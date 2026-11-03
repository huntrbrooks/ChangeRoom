import Link from 'next/link';
import type { ReactNode } from 'react';

export const SUPPORT_EMAIL = 'info@igetdressed.online';

export function SupportEmail() {
  return <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>;
}

export function HelpPage({ title, children }: { title: string; children: ReactNode }) {
  return <main className="min-h-screen bg-[#faf9f6] px-5 py-12 text-zinc-900">
    <article className="mx-auto max-w-2xl space-y-7 leading-relaxed [&_a]:underline [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_p+p]:mt-3">
      <Link href="/">← Back to the studio</Link>
      <h1 className="text-4xl font-bold tracking-tight">{title}</h1>
      {children}
    </article>
  </main>;
}
