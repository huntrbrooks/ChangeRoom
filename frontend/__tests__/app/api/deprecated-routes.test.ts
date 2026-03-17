/** @jest-environment node */

import { NextRequest } from "next/server";

describe("deprecated Vercel-side upload routes", () => {
  it("returns 410 for preprocess-clothing", async () => {
    const { POST } = await import("@/app/api/preprocess-clothing/route");
    const req = new NextRequest("https://example.com/api/preprocess-clothing", {
      method: "POST",
      headers: { "x-request-id": "req-preprocess" },
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(410);
    expect(body).toEqual({
      error: "deprecated_route",
      message:
        "This Vercel preprocessing route has been removed. Use the Render backend /api/preprocess-clothing endpoint.",
    });
    expect(res.headers.get("X-Request-Id")).toBe("req-preprocess");
  });

  it("returns 410 for upload-urls", async () => {
    const { POST } = await import("@/app/api/upload-urls/route");
    const req = new NextRequest("https://example.com/api/upload-urls", {
      method: "POST",
      headers: { "x-changeroom-request-id": "req-upload" },
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(410);
    expect(body).toEqual({
      error: "deprecated_route",
      message:
        "This Vercel upload route has been removed. Upload and preprocessing now run through the Render backend.",
    });
    expect(res.headers.get("X-ChangeRoom-Request-Id")).toBe("req-upload");
  });
});
