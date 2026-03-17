import { cookies } from "next/headers";

import { BrandPitchPrototype } from "@/app/components/BrandPitchPrototype";
import {
  FRONTRUNNER_DEMO_COOKIE_NAME,
  hasValidFrontrunnerDemoSession,
} from "@/lib/frontrunnerDemoAccess";

export const dynamic = "force-dynamic";

type FrontrunnerDemoPageProps = {
  searchParams?: Promise<{ error?: string }>;
};

export default async function FrontrunnerDemoPage({
  searchParams,
}: FrontrunnerDemoPageProps) {
  const cookieStore = await cookies();
  const params = searchParams ? await searchParams : undefined;
  const hasAccess = hasValidFrontrunnerDemoSession(
    cookieStore.get(FRONTRUNNER_DEMO_COOKIE_NAME)?.value
  );

  if (!hasAccess) {
    const showError = params?.error === "invalid_password";

    return (
      <main className="min-h-screen bg-[#f4f1eb] text-black">
        <div className="mx-auto flex min-h-screen max-w-xl items-center px-6 py-16">
          <div className="w-full rounded-3xl border border-black/10 bg-white p-8 shadow-[0_25px_80px_rgba(0,0,0,0.08)]">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-black/50">
              Frontrunner AU
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">
              Private Creator Styling Demo
            </h1>
            <p className="mt-3 text-sm leading-6 text-black/65">
              This pitch room is for tailored investor and partner demos. Enter the access password
              to continue.
            </p>
            <form action="/api/frontrunnerau/unlock" method="post" className="mt-8 space-y-4">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-black/55">
                  Password
                </span>
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  required
                  className="w-full rounded-2xl border border-black/15 bg-white px-4 py-3 text-base outline-none transition focus:border-black"
                />
              </label>
              {showError && (
                <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  Incorrect password. Try again.
                </p>
              )}
              <button
                type="submit"
                className="w-full rounded-2xl bg-black px-4 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-black/85"
              >
                Enter Demo
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  return (
    <div>
      <div className="border-b border-black/10 bg-[#f4f1eb] px-4 py-3 text-xs font-medium text-black/60">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <span>Private demo unlocked for Frontrunner AU creator styling pitch.</span>
          <form action="/api/frontrunnerau/logout" method="post">
            <button
              type="submit"
              className="rounded-full border border-black/15 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-black transition hover:border-black/35"
            >
              Lock Demo
            </button>
          </form>
        </div>
      </div>
      <BrandPitchPrototype />
    </div>
  );
}
