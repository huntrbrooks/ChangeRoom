/** @jest-environment node */

import { NextRequest } from "next/server";

const mockAuth = jest.fn();
const mockCurrentUser = jest.fn();
jest.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
  currentUser: () => mockCurrentUser(),
  clerkClient: jest.fn(),
}));

const db = {
  createCreditHold: jest.fn(),
  getEffectiveUserBilling: jest.fn(),
  getOrCreateUserBilling: jest.fn(),
  isPrivilegedUserId: jest.fn(),
  markFreeTrialUsed: jest.fn(),
  upsertUserProfileFromClerk: jest.fn(),
  grantCredits: jest.fn(),
  getClothingItemOfferUrls: jest.fn(),
  logAffiliateClick: jest.fn(),
};
jest.mock("@/lib/db-access", () => db);

const mockRetrieve = jest.fn();
jest.mock("stripe", () =>
  jest.fn().mockImplementation(() => ({ checkout: { sessions: { retrieve: mockRetrieve } } }))
);

let ipCounter = 0;
function request(url: string, init: { method?: string; body?: unknown } = {}) {
  ipCounter += 1;
  return new NextRequest(url, {
    method: init.method ?? "GET",
    headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${ipCounter}` },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue({ userId: "user_attacker" });
  mockCurrentUser.mockResolvedValue(null);
  db.isPrivilegedUserId.mockResolvedValue(false);
  db.getOrCreateUserBilling.mockResolvedValue({
    user_id: "user_attacker",
    credits_available: 5,
    trials_remaining: 0,
    is_frozen: false,
    stripe_customer_id: "cus_attacker",
  });
  db.logAffiliateClick.mockResolvedValue(undefined);
});

describe("POST /api/try-on/hold", () => {
  it.each(["request_id_conflict", "hold_not_active"])(
    "returns 409 when createCreditHold rejects with %s",
    async (reason) => {
      db.createCreditHold.mockRejectedValue(new Error(reason));
      const { POST } = await import("@/app/api/try-on/hold/route");

      const res = await POST(
        request("https://example.com/api/try-on/hold", { method: "POST", body: { requestId: "victims-request" } })
      );

      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({
        error: "request_id_already_used",
        message: "Start a new try-on request.",
      });
    }
  );
});

describe("GET /api/r", () => {
  const offerId = "3f0c7a52-1d4e-4b8a-9c11-2b7f0d9e6a10";

  it("redirects to the stored offer URL, ignoring the url parameter", async () => {
    db.getClothingItemOfferUrls.mockResolvedValue({
      affiliate_url: "https://www.asos.com/p/1?affid=1",
      product_url: "https://www.asos.com/p/1",
    });
    const { GET } = await import("@/app/api/r/route");

    const res = await GET(
      request(`https://example.com/api/r?offerId=${offerId}&url=${encodeURIComponent("https://evil.com")}`)
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://www.asos.com/p/1?affid=1");
  });

  it("refuses arbitrary destinations", async () => {
    const { GET } = await import("@/app/api/r/route");
    const res = await GET(request(`https://example.com/api/r?url=${encodeURIComponent("https://evil.com/login")}`));
    expect(res.status).toBe(400);
    expect(db.logAffiliateClick).not.toHaveBeenCalled();
  });

  it("still allows known retailers by URL", async () => {
    const { GET } = await import("@/app/api/r/route");
    const res = await GET(request(`https://example.com/api/r?url=${encodeURIComponent("https://www.zara.com/au/item")}`));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://www.zara.com/au/item");
  });
});

describe("POST /api/billing/verify-checkout-session", () => {
  const paidSession = {
    id: "cs_test_123",
    mode: "payment",
    payment_status: "paid",
    payment_intent: "pi_123",
    metadata: { creditAmount: "10" },
    client_reference_id: null,
    customer: "cus_victim",
    line_items: { data: [] },
  };

  it("refuses a paid session that can't be tied to the caller", async () => {
    mockRetrieve.mockResolvedValue(paidSession);
    const { POST } = await import("@/app/api/billing/verify-checkout-session/route");

    const res = await POST(
      request("https://example.com/api/billing/verify-checkout-session", { method: "POST", body: { sessionId: "cs_test_123" } })
    );

    expect(res.status).toBe(403);
    expect(db.grantCredits).not.toHaveBeenCalled();
  });

  it("grants credits when client_reference_id matches the caller", async () => {
    mockRetrieve.mockResolvedValue({ ...paidSession, client_reference_id: "user_attacker" });
    db.grantCredits.mockResolvedValue({ credits_available: 15 });
    const { POST } = await import("@/app/api/billing/verify-checkout-session/route");

    const res = await POST(
      request("https://example.com/api/billing/verify-checkout-session", { method: "POST", body: { sessionId: "cs_test_123" } })
    );

    expect(res.status).toBe(200);
    expect(db.grantCredits).toHaveBeenCalledWith("user_attacker", 10, expect.any(Object), "pi_123");
  });
});
