import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { checkRateLimit } from '@/lib/rate-limit';

/**
 * Stub endpoint hit whenever a wardrobe item is selected in Shop & Save.
 * This allows the shopping service to react to user pick events (logging, analytics, prefetch, etc.).
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown';
    const rlUser = checkRateLimit(`shop-selection:user:${userId}`, 60, 60_000);
    const rlIp = checkRateLimit(`shop-selection:ip:${ip}`, 120, 60_000);
    if (!rlUser.allowed || !rlIp.allowed) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    }

    const body = await req.json();
    const { clothingItemId, metadata } = body ?? {};

    if (!clothingItemId || typeof clothingItemId !== 'string') {
      return NextResponse.json(
        { error: 'clothingItemId is required' },
        { status: 400 }
      );
    }

    console.info('Shop selection registered', {
      clothingItemId,
      metadata,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Shop selection stub failed', error);
    return NextResponse.json(
      { error: 'Failed to capture selection event' },
      { status: 500 }
    );
  }
}


