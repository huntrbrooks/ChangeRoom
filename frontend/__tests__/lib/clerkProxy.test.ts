import { CLERK_PROXY_PATH, getClerkFrontendApiHost } from '@/lib/clerkProxy';

describe('clerkProxy', () => {
  it('uses the stable same-origin proxy path', () => {
    expect(CLERK_PROXY_PATH).toBe('/__clerk');
  });

  it("defaults the Clerk frontend API host to Clerk's hosted frontend API", () => {
    delete process.env.NEXT_PUBLIC_CLERK_FRONTEND_API;
    delete process.env.CLERK_FRONTEND_API;

    expect(getClerkFrontendApiHost()).toBe('clerk.igetdressed.online');
  });

  it('uses the configured Clerk frontend API host when set', () => {
    process.env.NEXT_PUBLIC_CLERK_FRONTEND_API = 'https://clerk.igetdressed.online';

    expect(getClerkFrontendApiHost()).toBe('clerk.igetdressed.online');
  });
});
