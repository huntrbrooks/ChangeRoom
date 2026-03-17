import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { randomUUID } from "crypto";
import { isBypassUser } from "@/lib/bypass-config";

/**
 * POST /api/try-on/hold
 * Body: { requestId: string, quality?: "standard" | "hd" }
 *
 * Creates (or reuses) a credit hold for a try-on request (idempotent by requestId).
 * This is designed to be called BEFORE the long-running Render try-on request.
 */
export async function POST(req: NextRequest) {
  // Dynamic imports so env/auth misconfig doesn't crash the module at import time
  // (empty 500s in production are nearly impossible to debug from the browser).
  let auth: typeof import("@clerk/nextjs/server").auth;
  let currentUser: typeof import("@clerk/nextjs/server").currentUser;
  try {
    ({ auth, currentUser } = await import("@clerk/nextjs/server"));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("try-on hold: failed to import @clerk/nextjs/server", err);
    return NextResponse.json(
      {
        error: "clerk_server_unavailable",
        details: message,
        hint: "Check Vercel env vars: CLERK_SECRET_KEY must be set for server-side auth.",
      },
      { status: 500 }
    );
  }

  let userId: string | null = null;
  try {
    ({ userId } = await auth());
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("try-on hold: auth() failed", err);
    return NextResponse.json(
      {
        error: "auth_failed",
        details: message,
        hint: "This usually means CLERK_SECRET_KEY (server-side) is missing/invalid in Vercel.",
      },
      { status: 500 }
    );
  }

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let currentRequestId: string | null = null;
  let usedFreeTrial = false;

  try {
    const { createCreditHold, getOrCreateUserBilling, grantFreeTrialOnce } =
      await import("@/lib/db-access");

    const reqHeaderId =
      req.headers.get("x-request-id") || req.headers.get("x-changeroom-request-id");
    const body = await req.json();
    const quality = (body.quality as "standard" | "hd" | undefined) || "standard";

    currentRequestId =
      (body.requestId as string | undefined) ||
      (body.request_id as string | undefined) ||
      (body.idempotencyKey as string | undefined) ||
      reqHeaderId ||
      randomUUID();

    if (!currentRequestId || !currentRequestId.trim()) {
      return NextResponse.json({ error: "requestId_required" }, { status: 400 });
    }

    // Rate limiting (per user and per IP)
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const rlUser = checkRateLimit(`tryon-hold:user:${userId}`, 10, 60_000);
    const rlIp = checkRateLimit(`tryon-hold:ip:${ip}`, 20, 60_000);
    if (!rlUser.allowed || !rlIp.allowed) {
      return NextResponse.json(
        { error: "rate_limited", retryAfterMs: 60_000 },
        { status: 429 }
      );
    }

    // Payment bypass for specific email (best-effort; do not fail the hold if Clerk user fetch fails)
    let userEmail: string | null = null;
    let isVerifiedEmail = false;
    try {
      const user = await currentUser();
      userEmail = user?.emailAddresses?.[0]?.emailAddress || null;
      isVerifiedEmail =
        user?.emailAddresses?.some((e) => e.verification?.status === "verified") ||
        false;
    } catch (err: unknown) {
      // Log but don't fail - email is only needed for bypass check
      const errMessage = err instanceof Error ? err.message : String(err);
      console.warn("try-on hold: currentUser() failed, continuing without email context", {
        error: errMessage,
        // Don't log full error object to avoid exposing sensitive info
      });
    }
    const shouldBypassPayment = isBypassUser(userEmail);

    const creditCost = quality === "hd" ? 2 : 1;

    // Ensure billing exists and check freeze
    // Wrap in try-catch to provide better error messages for database issues
    let billing;
    try {
      billing = await getOrCreateUserBilling(userId);
    } catch (dbErr: unknown) {
      const dbMessage = dbErr instanceof Error ? dbErr.message : String(dbErr);
      console.error("try-on hold: getOrCreateUserBilling failed", {
        userId,
        error: dbMessage,
      });
      // Re-throw with more context
      const enhancedError = new Error(
        `Database error while fetching billing: ${dbMessage}`
      );
      if (dbErr instanceof Error && dbErr.stack) {
        enhancedError.stack = dbErr.stack;
      }
      throw enhancedError;
    }
    if (billing.is_frozen) {
      return NextResponse.json(
        {
          error: "account_frozen",
          message: "Account is temporarily frozen. Please update billing.",
        },
        { status: 402 }
      );
    }

    // Give free trial credit only for verified users and standard quality
    if (!shouldBypassPayment && creditCost === 1 && !billing.trial_used && isVerifiedEmail) {
      const trialResult = await grantFreeTrialOnce(userId, creditCost);
      billing = trialResult.billing;
      usedFreeTrial = trialResult.granted;
    }

    if (shouldBypassPayment) {
      const res = NextResponse.json({
        ok: true,
        requestId: currentRequestId,
        usedFreeTrial,
        creditsAvailable: billing.credits_available,
        bypass: true,
      });
      res.headers.set("X-ChangeRoom-Stack", "nextjs-vercel");
      res.headers.set("X-Request-Id", currentRequestId);
      res.headers.set("X-ChangeRoom-Request-Id", currentRequestId);
      return res;
    }

    try {
      const holdResult = await createCreditHold({
        userId,
        requestId: currentRequestId,
        amount: creditCost,
        reason: `try-on-render:${quality}`,
        // Holds should never be indefinite; auto-release after a reasonable window.
        expiresAt: new Date(Date.now() + 30 * 60_000),
      });

      const res = NextResponse.json({
        ok: true,
        requestId: currentRequestId,
        usedFreeTrial,
        creditsAvailable: holdResult.billing.credits_available,
      });
      res.headers.set("X-ChangeRoom-Stack", "nextjs-vercel");
      res.headers.set("X-Request-Id", currentRequestId);
      res.headers.set("X-ChangeRoom-Request-Id", currentRequestId);
      return res;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("try-on hold: createCreditHold failed", {
        userId,
        requestId: currentRequestId,
        error: message,
      });
      
      if (message === "insufficient_credits") {
        try {
          const freshBilling = await getOrCreateUserBilling(userId);
          const res = NextResponse.json(
            { error: "no_credits", creditsAvailable: freshBilling.credits_available },
            { status: 402 }
          );
          res.headers.set("X-ChangeRoom-Stack", "nextjs-vercel");
          res.headers.set("X-Request-Id", currentRequestId);
          res.headers.set("X-ChangeRoom-Request-Id", currentRequestId);
          return res;
        } catch (dbErr: unknown) {
          // If we can't even fetch billing, it's a database issue
          console.error("try-on hold: failed to fetch billing after insufficient_credits", dbErr);
          throw new Error(`Database error: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`);
        }
      }
      if (message === "account_frozen") {
        const res = NextResponse.json(
          {
            error: "account_frozen",
            message: "Account is temporarily frozen. Please update billing.",
          },
          { status: 402 }
        );
        res.headers.set("X-ChangeRoom-Stack", "nextjs-vercel");
        res.headers.set("X-Request-Id", currentRequestId);
        res.headers.set("X-ChangeRoom-Request-Id", currentRequestId);
        return res;
      }
      throw e;
    }
  } catch (err: unknown) {
    // Extract error information safely
    const error = err instanceof Error ? err : new Error(String(err));
    const message = error.message;
    const stack = error.stack;

    // Log full error details for debugging (server-side only)
    console.error("try-on hold error:", {
      message,
      stack: stack?.split('\n').slice(0, 5).join('\n'), // First 5 lines of stack
      userId: userId || 'unknown',
      requestId: currentRequestId || 'unknown',
    });

    // Categorize errors for better client-side handling
    let errorCode = "hold_failed";
    let statusCode = 500;
    let retryable = false;

    const lowerMessage = message.toLowerCase();
    
    // Database connectivity issues - may be temporary
    if (
      lowerMessage.includes("database_pool_unavailable") ||
      lowerMessage.includes("database_connection_failed") ||
      lowerMessage.includes("database_client_invalid") ||
      lowerMessage.includes("econnrefused") ||
      lowerMessage.includes("etimedout") ||
      lowerMessage.includes("connection") ||
      lowerMessage.includes("postgres") ||
      lowerMessage.includes("neon") ||
      lowerMessage.includes("vercel postgres")
    ) {
      errorCode = "database_error";
      retryable = true;
      console.error(
        "Database error in try-on hold - this may be a transient issue:",
        message
      );
    } else if (
      lowerMessage.includes("auth_failed") ||
      lowerMessage.includes("clerk") ||
      lowerMessage.includes("unauthorized")
    ) {
      // Auth errors should return 401, not 500
      errorCode = "auth_failed";
      statusCode = 401;
      console.error("Authentication error in try-on hold:", message);
    }

    const res = NextResponse.json(
      {
        error: errorCode,
        details: message,
        retryable, // Client can retry on transient DB errors
      },
      { status: statusCode }
    );
    res.headers.set("X-ChangeRoom-Stack", "nextjs-vercel");
    if (currentRequestId) {
      res.headers.set("X-Request-Id", currentRequestId);
      res.headers.set("X-ChangeRoom-Request-Id", currentRequestId);
    }
    return res;
  }
}
