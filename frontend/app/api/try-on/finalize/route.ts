import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/try-on/finalize
 * Body: { requestId: string }
 *
 * Finalizes a credit hold as a debit (idempotent). This does NOT change the user's
 * visible balance (the hold already deducted), but records the debit in the ledger.
 */
export async function POST(req: NextRequest) {
  // Dynamic imports so env/auth misconfig doesn't crash the module at import time.
  let auth: typeof import("@clerk/nextjs/server").auth;
  try {
    ({ auth } = await import("@clerk/nextjs/server"));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("try-on finalize: failed to import @clerk/nextjs/server", err);
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
    console.error("try-on finalize: auth() failed", err);
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

  const { finalizeDebitFromHold, getHoldByRequestId } = await import("@/lib/db-access");

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
