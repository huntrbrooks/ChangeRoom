import {
  getUserPrimaryEmail,
  isBypassUser,
  isPrivilegedAccountEmail,
} from "@/lib/bypass-config";

describe("bypass-config", () => {
  const originalBypassEmails = process.env.NEXT_PUBLIC_PAYWALL_BYPASS_EMAILS;

  afterEach(() => {
    if (originalBypassEmails === undefined) {
      delete process.env.NEXT_PUBLIC_PAYWALL_BYPASS_EMAILS;
    } else {
      process.env.NEXT_PUBLIC_PAYWALL_BYPASS_EMAILS = originalBypassEmails;
    }
  });

  it("always treats the two privileged accounts as bypass users", () => {
    delete process.env.NEXT_PUBLIC_PAYWALL_BYPASS_EMAILS;

    expect(isPrivilegedAccountEmail("gerard.grenville@gmail.com")).toBe(true);
    expect(isPrivilegedAccountEmail("CassandraChenco@Outlook.com")).toBe(true);
    expect(isBypassUser(" gerard.grenville@gmail.com ")).toBe(true);
    expect(isBypassUser("cassandrachenco@outlook.com")).toBe(true);
  });

  it("preserves configured bypass emails without making unrelated users privileged", () => {
    process.env.NEXT_PUBLIC_PAYWALL_BYPASS_EMAILS = "extra@example.com";

    expect(isBypassUser("extra@example.com")).toBe(true);
    expect(isPrivilegedAccountEmail("extra@example.com")).toBe(false);
    expect(isBypassUser("other@example.com")).toBe(false);
  });

  it("chooses a Clerk user's primary email before fallback addresses", () => {
    expect(
      getUserPrimaryEmail({
        primaryEmailAddressId: "email_2",
        emailAddresses: [
          { id: "email_1", emailAddress: "first@example.com" },
          { id: "email_2", emailAddress: "primary@example.com" },
        ],
      })
    ).toBe("primary@example.com");

    expect(
      getUserPrimaryEmail({
        emailAddresses: [
          { id: "email_1", emailAddress: "first@example.com" },
          {
            id: "email_2",
            emailAddress: "verified@example.com",
            verification: { status: "verified" },
          },
        ],
      })
    ).toBe("verified@example.com");
  });
});
