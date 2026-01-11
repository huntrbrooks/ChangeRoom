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

    // Payment bypass for specific email
    const user = await currentUser();
    const userEmail = user?.emailAddresses?.[0]?.emailAddress;
    const isVerifiedEmail =
      user?.emailAddresses?.some((e) => e.verification?.status === "verified") ||
      false;
    const shouldBypassPayment = isBypassUser(userEmail);

    const creditCost = quality === "hd" ? 2 : 1;

    // Ensure billing exists and check freeze
    let billing = await getOrCreateUserBilling(userId);
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
      if (message === "insufficient_credits") {
        const freshBilling = await getOrCreateUserBilling(userId);
        const res = NextResponse.json(
          { error: "no_credits", creditsAvailable: freshBilling.credits_available },
          { status: 402 }
        );
        res.headers.set("X-ChangeRoom-Stack", "nextjs-vercel");
        res.headers.set("X-Request-Id", currentRequestId);
        res.headers.set("X-ChangeRoom-Request-Id", currentRequestId);
        return res;
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
    console.error("try-on hold error:", err);
    const error = err instanceof Error ? err : new Error(String(err));
    const message = error.message;
    
    // Categorize errors for better client-side handling
    let errorCode = "hold_failed";
    let statusCode = 500;
    
    if (message.includes("database_pool_unavailable") || 
        message.includes("database_connection_failed") ||
        message.includes("database_client_invalid")) {
      // Database connectivity issues - may be temporary
      errorCode = "database_error";
      console.error("Database error in try-on hold - this may be a transient issue:", message);
    } else if (message.includes("ECONNREFUSED") || 
               message.includes("ETIMEDOUT") ||
               message.includes("connection")) {
      // Network/connection issues
      errorCode = "database_error";
      console.error("Database connection error in try-on hold:", message);
    }
    
    const res = NextResponse.json(
      { 
        error: errorCode, 
        details: message,
        retryable: errorCode === "database_error" // Client can retry on transient DB errors
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


