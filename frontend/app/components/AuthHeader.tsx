'use client';

import { UserButton, useAuth } from '@clerk/nextjs';
import Link from 'next/link';

export function AuthHeader() {
  const { isLoaded, isSignedIn } = useAuth();

  return (
    <header className="flex min-h-16 items-center justify-end gap-4 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur-md sm:px-6">
      {!isLoaded ? (
        <div aria-hidden="true" className="h-10 w-28 rounded-lg bg-slate-200/70 sm:h-11" />
      ) : isSignedIn ? (
        <UserButton />
      ) : (
        <>
          <Link
            href="/sign-in"
            className="inline-flex h-10 items-center justify-center px-4 text-xs font-semibold text-slate-800 transition-colors hover:text-black sm:h-11 sm:px-5 sm:text-sm"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-[#101114] px-5 text-xs font-semibold text-white shadow-[0_10px_24px_rgba(16,17,20,0.16)] transition-colors hover:bg-[#20232a] sm:h-11 sm:px-6 sm:text-sm"
          >
            Sign Up
          </Link>
        </>
      )}
    </header>
  );
}
