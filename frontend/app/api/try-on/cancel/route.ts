import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getHoldByRequestId, releaseCreditHold } from "@/lib/db-access";

/**
 * POST /api/try-on/cancel
 * Body: { requestId: string }
 * Releases an active hold for the given request (idempotent).
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const requestId =
    (body.requestId as string | undefined) ||
    (body.idempotencyKey as string | undefined) ||
    (body.request_id as string | undefined);

  if (!requestId || !requestId.trim()) {
    return NextResponse.json({ error: "requestId_required" }, { status: 400 });
  }

  const hold = await getHoldByRequestId(requestId);
  if (!hold) {
    return NextResponse.json({ ok: true, status: "not_found" });
  }

  if (hold.user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const released = await releaseCreditHold(requestId, "user_cancelled");

  return NextResponse.json({
    ok: true,
    status: released?.status || hold.status,
  });
}

