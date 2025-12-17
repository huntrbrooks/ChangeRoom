import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { applyContentBlockPenalty, getOrCreateUserBilling } from "@/lib/db-access";

/**
 * POST /api/my/credits/content-block-penalty
 * Body: { requestId: string }
 *
 * Deducts 1 credit (paid credits only; does NOT consume free trial) when the user repeatedly
 * triggers content blocks after being warned. Idempotent by requestId.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const requestId =
    (body.requestId as string | undefined) ||
    (body.request_id as string | undefined) ||
    (body.idempotencyKey as string | undefined) ||
    "";

  if (!requestId.trim()) {
    return NextResponse.json({ error: "requestId_required" }, { status: 400 });
  }

  try {
    const result = await applyContentBlockPenalty({ userId, requestId, amount: 1 });
    return NextResponse.json({
      ok: true,
      charged: result.charged,
      creditsAvailable: result.billing.credits_available,
      plan: result.billing.plan,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "insufficient_credits") {
      const billing = await getOrCreateUserBilling(userId);
      return NextResponse.json(
        { error: "no_credits", creditsAvailable: billing.credits_available },
        { status: 402 }
      );
    }
    if (message === "account_frozen") {
      return NextResponse.json(
        { error: "account_frozen", message: "Account is temporarily frozen. Please update billing." },
        { status: 402 }
      );
    }
    console.error("Failed to apply content-block penalty:", err);
    return NextResponse.json({ error: "penalty_failed" }, { status: 500 });
  }
}


