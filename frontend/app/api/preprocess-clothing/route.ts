import { NextRequest, NextResponse } from "next/server";

const MESSAGE =
  "This Vercel preprocessing route has been removed. Use the Render backend /api/preprocess-clothing endpoint.";

function deprecatedResponse(req: NextRequest) {
  const res = NextResponse.json(
    {
      error: "deprecated_route",
      message: MESSAGE,
    },
    { status: 410 }
  );

  res.headers.set("X-ChangeRoom-Stack", "nextjs-vercel");

  const rid = req.headers.get("x-request-id") || req.headers.get("x-changeroom-request-id");
  if (rid) {
    res.headers.set("X-Request-Id", rid);
    res.headers.set("X-ChangeRoom-Request-Id", rid);
  }

  return res;
}

export async function POST(req: NextRequest) {
  return deprecatedResponse(req);
}
