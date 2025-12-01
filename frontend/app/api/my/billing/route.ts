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
      trialUsed: billing.trial_used,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error("get billing error:", err);
    
    // Log more details for debugging
    if (err instanceof Error) {
      console.error("Error stack:", err.stack);
    }
    
    // Return error details in development, generic message in production
    return NextResponse.json(
      { 
        error: "Failed to fetch billing information",
        ...(process.env.NODE_ENV === 'development' && { details: errorMessage })
      },
      { status: 500 }
    );
  }
}

