import { NextRequest, NextResponse } from 'next/server';

/**
 * Stub endpoint hit whenever a wardrobe item is selected in Shop & Save.
 * This allows the shopping service to react to user pick events (logging, analytics, prefetch, etc.).
 */
export async function POST(req: NextRequest) {
  try {
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


