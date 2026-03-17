/** @jest-environment node */

import { NextRequest } from "next/server";

describe("frontrunner demo auth", () => {
  const originalPassword = process.env.FRONTRUNNER_DEMO_PASSWORD;
  const originalSecret = process.env.FRONTRUNNER_DEMO_COOKIE_SECRET;

  beforeEach(() => {
    process.env.FRONTRUNNER_DEMO_PASSWORD = "bintang";
    process.env.FRONTRUNNER_DEMO_COOKIE_SECRET = "pitch-secret";
  });

  afterEach(() => {
    if (typeof originalPassword === "string") {
      process.env.FRONTRUNNER_DEMO_PASSWORD = originalPassword;
    } else {
      delete process.env.FRONTRUNNER_DEMO_PASSWORD;
    }

    if (typeof originalSecret === "string") {
      process.env.FRONTRUNNER_DEMO_COOKIE_SECRET = originalSecret;
    } else {
      delete process.env.FRONTRUNNER_DEMO_COOKIE_SECRET;
    }
  });

  it("rejects an incorrect unlock password", async () => {
    const { POST } = await import("@/app/api/frontrunnerau/unlock/route");
    const formData = new FormData();
    formData.set("password", "wrong");

    const req = new NextRequest("https://example.com/api/frontrunnerau/unlock", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req);

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://example.com/frontrunnerau?error=invalid_password");
  });

  it("sets the demo cookie after a correct password", async () => {
    const { POST } = await import("@/app/api/frontrunnerau/unlock/route");
    const formData = new FormData();
    formData.set("password", "bintang");

    const req = new NextRequest("https://example.com/api/frontrunnerau/unlock", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req);
    const cookie = res.cookies.get("frontrunnerau_demo");

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://example.com/frontrunnerau");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.value).toBeTruthy();
  });

  it("blocks pitch catalog access without the demo cookie", async () => {
    const { GET } = await import("@/app/api/pitch/catalog/route");
    const req = new NextRequest("https://example.com/api/pitch/catalog", {
      method: "GET",
    });

    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "demo_access_required" });
  });
});
