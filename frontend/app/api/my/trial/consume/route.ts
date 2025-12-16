import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { markFreeTrialUsed, getOrCreateUserBilling } from "@/lib/db-access";

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
    const billing = await markFreeTrialUsed(userId);
    return NextResponse.json({
      plan: billing.plan,
      creditsAvailable: billing.credits_available,
      creditsRefreshAt: billing.credits_refresh_at,
      trialUsed: billing.trial_used ?? true,
    });
  } catch (err: unknown) {
    console.error("Error consuming free trial:", err);
    // Fallback to current billing state to avoid blocking clients and keep idempotent behavior
    try {
      const billing = await getOrCreateUserBilling(userId);
      return NextResponse.json({
        plan: billing.plan,
        creditsAvailable: billing.credits_available,
        creditsRefreshAt: billing.credits_refresh_at,
        trialUsed: true, // force-consume to avoid client loops
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

