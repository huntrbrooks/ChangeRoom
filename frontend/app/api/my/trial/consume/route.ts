import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getUserPrimaryEmail, isBypassUser } from "@/lib/bypass-config";

/**
 * POST /api/my/trial/consume
 * Marks the user's free trial as used (idempotent).
 */
export async function POST(_req: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let userEmail: string | null = null;
    try {
      const user = await currentUser();
      userEmail = getUserPrimaryEmail(user);
      if (user) {
        const { upsertUserProfileFromClerk } = await import("@/lib/db-access");
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
      console.warn("trial consume: failed to sync Clerk user profile", profileErr);
    }

    if (isBypassUser(userEmail)) {
      const { getEffectiveUserBilling } = await import("@/lib/db-access");
      const { billing } = await getEffectiveUserBilling(userId, userEmail);
      return NextResponse.json({
        plan: billing.plan,
        creditsAvailable: billing.credits_available,
        creditsRefreshAt: billing.credits_refresh_at,
        trialsRemaining: billing.trials_remaining,
        unlimitedCredits: true,
        bypass: true,
      });
    }

    const { markFreeTrialUsed } = await import("@/lib/db-access");
    const billing = await markFreeTrialUsed(userId);
    return NextResponse.json({
      plan: billing.plan,
      creditsAvailable: billing.credits_available,
      creditsRefreshAt: billing.credits_refresh_at,
      trialsRemaining: billing.trials_remaining,
    });
  } catch (err: unknown) {
    console.error("Error consuming free trial:", err);
    // Fallback to current billing state to avoid blocking clients and keep idempotent behavior
    try {
      const { getOrCreateUserBilling } = await import("@/lib/db-access");
      const billing = await getOrCreateUserBilling(userId);
      return NextResponse.json({
        plan: billing.plan,
        creditsAvailable: billing.credits_available,
        creditsRefreshAt: billing.credits_refresh_at,
        trialsRemaining: 0, // force-consume to avoid client loops
        note: "trial consume fallback",
      });
    } catch (fallbackErr) {
      console.error("Fallback billing fetch failed while consuming trial:", fallbackErr);
      return NextResponse.json(
        { error: "Failed to mark trial used" },
        { status: 500 }
      );
    }
  }
}
