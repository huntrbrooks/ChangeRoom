import { auth, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { isTryonStaff } from '@/lib/tryon-staff';
import { checkRateLimit } from '@/lib/rate-limit';
import { getOrCreateUserBilling } from '@/lib/db-access';
import { sql } from '@/lib/db';

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!checkRateLimit('tryon-intent:' + userId, 10, 60_000).allowed)
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  try {
    const quote = (await req.json().catch(() => null))?.expectedFunding;
    if (!['trial','credits','included'].includes(quote)) return NextResponse.json({ error: 'funding_quote_required' }, { status: 400 });
    const user = await currentUser();
    if (!user || user.id !== userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const verified = user.emailAddresses.some(e => e.id === user.primaryEmailAddressId && e.verification?.status === 'verified');
    const privileged = isTryonStaff(userId);
    await sql`SELECT public.tryon_sweep()`;
    const billing = await getOrCreateUserBilling(userId);
    if (billing.is_frozen) return NextResponse.json({ error: 'account_frozen' }, { status: 402 });
    if ((quote === "included" && !privileged) || (quote === "trial" && !privileged && !(verified && billing.trials_remaining > 0)))
      return NextResponse.json({ error: "quote_changed" }, { status: 409 });
    if (!privileged && !(verified && billing.trials_remaining > 0) && billing.credits_available < 1)
      return NextResponse.json({ error: 'no_credits' }, { status: 402 });
    const issued = await sql`INSERT INTO public.tryon_jobs(user_id,trial_eligible,privileged)
      VALUES (${userId},${verified && billing.trials_remaining > 0},${privileged}) RETURNING id`;
    return NextResponse.json({ requestId: issued.rows[0].id }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'generation_authorization_unavailable' }, { status: 503 });
  }
}
