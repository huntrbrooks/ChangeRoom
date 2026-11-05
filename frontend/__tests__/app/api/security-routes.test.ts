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
  getUserBillingByStripeCustomer: jest.fn(),
  isPrivilegedUserId: jest.fn(),
  markFreeTrialUsed: jest.fn(),
  upsertUserProfileFromClerk: jest.fn(),
  grantCredits: jest.fn(),
  withPackAuthority: jest.fn(),
  listPackPurchases: jest.fn(),
  getClothingItemOfferUrls: jest.fn(),
  logAffiliateClick: jest.fn(),
};
jest.mock("@/lib/db-access", () => db);

const mockJobSql = jest.fn();
jest.mock("@/lib/db", () => ({ sql: (...args: unknown[]) => mockJobSql(...args) }));

const mockRetrieve = jest.fn(), mockPiRetrieve=jest.fn();
jest.mock("stripe", () =>
  jest.fn().mockImplementation(() => ({ checkout: { sessions: { retrieve: mockRetrieve } }, paymentIntents:{retrieve:mockPiRetrieve} }))
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
  db.getUserBillingByStripeCustomer.mockImplementation(async(customer:string)=>customer === 'cus_attacker'
    ? {user_id:'user_attacker',stripe_customer_id:customer,credits_available:5}
    : {user_id:'user_victim',stripe_customer_id:customer,credits_available:0});
  db.logAffiliateClick.mockResolvedValue(undefined);
});

describe("POST /api/try-on/hold", () => {
  it("issues a fresh database ID only for the verified Clerk subject", async () => {
    mockCurrentUser.mockResolvedValue({ id: "user_attacker", primaryEmailAddressId: "primary",
      emailAddresses: [{ id: "primary", verification: { status: "verified" } }] });
    db.getOrCreateUserBilling.mockResolvedValueOnce({credits_available:5,trials_remaining:1,is_frozen:false});
    mockJobSql.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{id:"new-server-id"}] });
    const { POST } = await import("@/app/api/try-on/hold/route");
    const res = await POST(request("https://example.com/api/try-on/hold", { method: "POST",
      body: { requestId: "victims-request", userId: "victim", privileged: true, expectedFunding: "trial" } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({requestId:"new-server-id"});
    expect(mockJobSql.mock.calls[1].slice(1)).toEqual(["user_attacker", true, false]);
  });
});

it("cannot switch an included or free quote to a paid job", async () => {
  mockCurrentUser.mockResolvedValue({id:"user_attacker", primaryEmailAddressId:"p",
    emailAddresses:[{id:"p",verification:{status:"verified"}}]});
  const { POST } = await import("@/app/api/try-on/hold/route");
  for (const expectedFunding of ["trial","included"]) {
    const res = await POST(request("https://example.com/api/try-on/hold",{method:"POST",body:{expectedFunding}}));
    expect(res.status).toBe(409);
  }
  expect(mockJobSql.mock.calls.every(c => c[0].join("").includes("tryon_sweep"))).toBe(true);
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
  beforeAll(() => { process.env.STRIPE_STARTER_PRICE_ID = "price_test_starter"; });
  const paidSession = {
    id: "cs_test_123",
    created: 1700000000, // historical paid pack, before market-limited checkout
    mode: "payment",
    payment_status: "paid",
    amount_total: 1499,
    payment_intent: {id: "pi_123", status: "succeeded", customer: "cus_victim", amount_received: 1499,
      latest_charge: {payment_intent:"pi_123",captured:true,amount_captured:1499}},
    metadata: { creditAmount: "10" },
    client_reference_id: null,
    customer: "cus_victim",
    line_items: { data: [{price:{id:"price_test_starter"},quantity:1}], has_more:false },
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

  it("rejects a client reference alone for a different customer", async () => {
    mockRetrieve.mockResolvedValue({ ...paidSession, client_reference_id: "user_attacker" });
    const { POST } = await import("@/app/api/billing/verify-checkout-session/route");
    const res = await POST(request("https://example.com/api/billing/verify-checkout-session", { method:"POST", body:{sessionId:"cs_test_123"} }));
    expect(res.status).toBe(403);
  });

  it('rejects another owner’s tagged checkout before any billing lookup or creation', async()=>{
    mockRetrieve.mockResolvedValue({...paidSession,client_reference_id:'user_victim'});
    const {POST}=await import('@/app/api/billing/verify-checkout-session/route');
    const res=await POST(request('https://example.com/api/billing/verify-checkout-session',{method:'POST',body:{sessionId:'cs_test_123'}}));
    expect(res.status).toBe(403);expect(await res.json()).toEqual({error:'Forbidden'});
    expect(db.getUserBillingByStripeCustomer).not.toHaveBeenCalled();
    expect(db.getOrCreateUserBilling).not.toHaveBeenCalled();expect(mockPiRetrieve).not.toHaveBeenCalled();
  });

  it("grants the purchased SKU to its mapped customer", async () => {
    mockRetrieve.mockResolvedValue({ ...paidSession, client_reference_id: "user_attacker" });
    mockRetrieve.mockResolvedValue({ ...paidSession, customer: "cus_attacker", client_reference_id: "user_attacker", payment_intent:{...paidSession.payment_intent,customer:"cus_attacker"} });
    mockPiRetrieve.mockResolvedValue({...paidSession.payment_intent,customer:'cus_attacker'});
    db.withPackAuthority.mockImplementation(async (user,customer,pi,work)=>work({billing:{is_frozen:false},closed:false,alreadyGranted:false,
      grant:(amount:number,metadata:Record<string,unknown>)=>db.grantCredits(user,amount,metadata,pi)}));
    db.grantCredits.mockResolvedValue({ credits_available: 15 });
    const { POST } = await import("@/app/api/billing/verify-checkout-session/route");

    const res = await POST(
      request("https://example.com/api/billing/verify-checkout-session", { method: "POST", body: { sessionId: "cs_test_123" } })
    );

    expect(res.status).toBe(200);
    expect(db.grantCredits).toHaveBeenCalledWith("user_attacker", 10, expect.any(Object), "pi_123");
  });
});

describe('GET /api/billing/pack-purchases',()=>{
  it('a caller cannot select another user in the request; only self history is returned privately',async()=>{
    db.listPackPurchases.mockResolvedValue({purchases:[],hasMore:false});
    const {GET}=await import('@/app/api/billing/pack-purchases/route');
    const r=await GET(request('https://example.com/api/billing/pack-purchases?page=1&userId=victim'));
    expect(r.status).toBe(200);expect(r.headers.get('Cache-Control')).toBe('private, no-store');
    expect(db.listPackPurchases).toHaveBeenCalledWith('user_attacker',1);
  });
  it('refuses unauthenticated history and invalid page numbers without looking up a ledger',async()=>{
    const {GET}=await import('@/app/api/billing/pack-purchases/route');
    mockAuth.mockResolvedValueOnce({userId:null});
    expect((await GET(request('https://example.com/api/billing/pack-purchases'))).status).toBe(401);
    expect((await GET(request('https://example.com/api/billing/pack-purchases?page=-1'))).status).toBe(400);
    expect(db.listPackPurchases).not.toHaveBeenCalled();
  });
});
