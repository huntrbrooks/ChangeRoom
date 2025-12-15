import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getOrCreateUserBilling } from "@/lib/db-access";

/**
 * GET /api/my/billing
 * Fetch user's billing information (plan, credits)
 */
export async function GET(_req: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const billing = await getOrCreateUserBilling(userId);
    return NextResponse.json({
      plan: billing.plan,
      creditsAvailable: billing.credits_available,
      creditsRefreshAt: billing.credits_refresh_at,
      trialUsed: billing.trial_used ?? false, // Default to false if null/undefined
    });
  } catch (err: unknown) {
    const _errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error("get billing error:", err);
    
    // Log more details for debugging
    if (err instanceof Error) {
      console.error("Error stack:", err.stack);
    }
    
    // Return default billing info instead of error to prevent UI issues
    // This allows the app to continue working even if there's a DB issue
    return NextResponse.json({
      plan: 'free' as const,
      creditsAvailable: 0,
      creditsRefreshAt: null,
      trialUsed: false,
    });
  }
}

