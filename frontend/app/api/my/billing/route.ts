import { NextResponse } from "next/server";
import { getUserPrimaryEmail } from "@/lib/bypass-config";

/**
 * GET /api/my/billing
 * Fetch user's billing information (plan, credits)
 */
export async function GET() {
  // NOTE:
  // We dynamically import Clerk + DB helpers so misconfigured env vars don't crash
  // the module at import time (which shows up as an empty 500 in the browser).
  let auth: typeof import("@clerk/nextjs/server").auth;
  let currentUser: typeof import("@clerk/nextjs/server").currentUser;
  try {
    ({ auth, currentUser } = await import("@clerk/nextjs/server"));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("billing: failed to import @clerk/nextjs/server", err);
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
    console.error("billing: auth() failed", err);
    return NextResponse.json(
      {
        error: "auth_failed",
        details: message,
        hint: "This usually means CLERK_SECRET_KEY (server-side) is missing or invalid in Vercel.",
      },
      { status: 500 }
    );
  }

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const {
      getEffectiveUserBilling,
      hasPaidCreditGrant,
      upsertUserProfileFromClerk,
    } = await import(
      "@/lib/db-access"
    );
    let userEmail: string | null = null;
    try {
      const user = await currentUser();
      userEmail = getUserPrimaryEmail(user);
      if (user) {
        await upsertUserProfileFromClerk({
          userId,
          email: userEmail,
          firstName: user.firstName || null,
          lastName: user.lastName || null,
          imageUrl: user.imageUrl || null,
          clerkCreatedAt: user.createdAt || null,
        });
      }
    } catch (profileErr) {
      console.warn("billing: failed to sync current Clerk user profile", profileErr);
    }

    const { billing, isPrivileged } = await getEffectiveUserBilling(userId, userEmail);
    const hasPurchase =
      isPrivileged ||
      billing.plan !== "free" ||
      Boolean(billing.stripe_subscription_id) ||
      (await hasPaidCreditGrant(userId));
    return NextResponse.json({
      plan: billing.plan,
      creditsAvailable: billing.credits_available,
      creditsRefreshAt: billing.credits_refresh_at,
      trialsRemaining: billing.trials_remaining,
      hasPurchase,
      unlimitedCredits: isPrivileged,
      isPrivileged,
    });
  } catch (err: unknown) {
    console.error("get billing error:", err);
    
    // Log more details for debugging
    if (err instanceof Error) {
      console.error("Error stack:", err.stack);
    }

    return NextResponse.json(
      {
        error: "billing_unavailable",
        retryable: true,
      },
      { status: 503 }
    );
  }
}
