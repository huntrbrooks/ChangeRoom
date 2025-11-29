import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getOrCreateUserBilling } from "@/lib/db-access";

/**
 * GET /api/my/billing
 * Fetch user's billing information (plan, credits)
 */
export async function GET(req: NextRequest) {
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
    });
  } catch (err: any) {
    console.error("get billing error:", err);
    return NextResponse.json(
      { error: "Failed to fetch billing information" },
      { status: 500 }
    );
  }
}

