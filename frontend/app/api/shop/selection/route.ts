import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { z } from 'zod';
import { ANALYTICS_EVENTS, captureServerEvent } from '@/lib/server-analytics';
import { logger } from '@/lib/logger';

const selectionSchema = z.object({
  clothingItemId: z.string().trim().min(1),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Endpoint hit whenever a wardrobe item is selected in Shop & Save.
 * Records a structured feature-usage event without exposing private item data.
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

    const body = await req.json().catch(() => null);
    const parsed = selectionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'invalid_request',
          details: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }

    await captureServerEvent(ANALYTICS_EVENTS.SHOP_SELECTION, {
      clothing_item_id: parsed.data.clothingItemId,
      metadata: parsed.data.metadata ?? {},
    }, userId);

    logger.info('shop_selection_registered', {
      user_id: userId,
      clothing_item_id: parsed.data.clothingItemId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error('shop_selection_failed', { error });
    return NextResponse.json(
      { error: 'Failed to capture selection event' },
      { status: 500 }
    );
  }
}

