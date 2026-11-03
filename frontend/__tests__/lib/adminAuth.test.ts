/** @jest-environment node */

jest.mock("@clerk/nextjs/server", () => ({ auth: jest.fn(), clerkClient: jest.fn() }));

import { apiKeyMatches, isAdminUser, verifiedPrimaryEmail } from "@/lib/adminAuth";

function user(entries: Array<{ id: string; email: string; status?: string }>, primaryId: string) {
  return {
    id: "user_1",
    primaryEmailAddressId: primaryId,
    emailAddresses: entries.map((e) => ({
      id: e.id,
      emailAddress: e.email,
      verification: { status: e.status ?? "verified" },
    })),
  };
}

describe("adminAuth", () => {
  it("compares API keys exactly", () => {
    expect(apiKeyMatches("secret-key", "secret-key")).toBe(true);
    expect(apiKeyMatches("secret-ke", "secret-key")).toBe(false);
    expect(apiKeyMatches("anything", undefined)).toBe(false);
    expect(apiKeyMatches(null, "secret-key")).toBe(false);
  });

  it("accepts a verified primary admin email", () => {
    expect(isAdminUser(user([{ id: "e1", email: "Admin@IGetDressed.online" }], "e1"), "")).toBe(true);
  });

  it("rejects an unverified admin email even when it is listed first", () => {
    const u = user([{ id: "e1", email: "admin@igetdressed.online", status: "unverified" }], "e1");
    expect(verifiedPrimaryEmail(u)).toBeNull();
    expect(isAdminUser(u, "")).toBe(false);
  });

  it("ignores admin emails that are not the primary address", () => {
    const u = user(
      [
        { id: "e1", email: "admin@igetdressed.online" },
        { id: "e2", email: "someone@example.com" },
      ],
      "e2"
    );
    expect(isAdminUser(u, "")).toBe(false);
  });

  it("accepts allowlisted user ids", () => {
    const u = user([{ id: "e1", email: "someone@example.com" }], "e1");
    expect(isAdminUser(u, "user_9, user_1")).toBe(true);
  });
});
