import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { finalizeDebitFromHold, getHoldByRequestId } from "@/lib/db-access";

/**
 * POST /api/try-on/finalize
 * Body: { requestId: string }
 *
 * Finalizes a credit hold as a debit (idempotent). This does NOT change the user's
 * visible balance (the hold already deducted), but records the debit in the ledger.
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
    const res = NextResponse.json({ ok: true, status: "not_found" });
    res.headers.set("X-ChangeRoom-Stack", "nextjs-vercel");
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-ChangeRoom-Request-Id", requestId);
    return res;
  }

  if (hold.user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updated = await finalizeDebitFromHold(requestId);

  const res = NextResponse.json({
    ok: true,
    status: updated?.status || hold.status,
  });
  res.headers.set("X-ChangeRoom-Stack", "nextjs-vercel");
  res.headers.set("X-Request-Id", requestId);
  res.headers.set("X-ChangeRoom-Request-Id", requestId);
  return res;
}


