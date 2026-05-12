import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";

const requestSchema = z.object({
  requestId: z.string().trim().min(1).optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
  request_id: z.string().trim().min(1).optional(),
});

/**
 * POST /api/try-on/cancel
 * Body: { requestId: string }
 * Releases an active hold for the given request (idempotent).
 */
export async function POST(req: NextRequest) {
  // Dynamic imports so env/auth misconfig doesn't crash the module at import time.
  let auth: typeof import("@clerk/nextjs/server").auth;
  try {
    ({ auth } = await import("@clerk/nextjs/server"));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("tryon_cancel_clerk_import_failed", { error: err });
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
    logger.error("tryon_cancel_auth_failed", { error: err });
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

  const { getHoldByRequestId, releaseCreditHold } = await import("@/lib/db-access");

  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_request",
        details: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 }
    );
  }
  const requestId =
    parsed.data.requestId ||
    parsed.data.idempotencyKey ||
    parsed.data.request_id;

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

  const released = await releaseCreditHold(requestId, "user_cancelled");

  const res = NextResponse.json({
    ok: true,
    status: released?.status || hold.status,
  });
  res.headers.set("X-ChangeRoom-Stack", "nextjs-vercel");
  res.headers.set("X-Request-Id", requestId);
  res.headers.set("X-ChangeRoom-Request-Id", requestId);
  return res;
}
