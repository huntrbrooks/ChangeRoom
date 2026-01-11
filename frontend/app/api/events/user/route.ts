import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

/**
 * POST /api/events/user
 * 
 * Emit user events to n8n for automation triggers.
 * Called by the frontend when key user actions occur.
 * 
 * Events to emit:
 * - signup_complete: User finished signup
 * - trial_consumed: User used their free trial
 * - purchase_complete: User purchased credits
 * - outfit_generated: User generated a try-on
 */

const N8N_WEBHOOK_URL = process.env.N8N_EVENTS_WEBHOOK_URL;

async function notifyN8n(eventData: Record<string, unknown>) {
  if (!N8N_WEBHOOK_URL) {
    console.log('[events] N8N_EVENTS_WEBHOOK_URL not configured, skipping notification');
    return;
  }

  try {
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventData),
    });

    if (!response.ok) {
      console.warn('[events] n8n notification failed:', response.status);
    }
  } catch (error) {
    console.warn('[events] Failed to notify n8n:', error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { event, data } = body;

    if (!event) {
      return NextResponse.json({ error: 'Missing event type' }, { status: 400 });
    }

    const eventPayload = {
      event,
      userId,
      timestamp: new Date().toISOString(),
      data: data || {},
    };

    // Log locally
    console.log('[user-event]', eventPayload);

    // Send to n8n for automation
    await notifyN8n(eventPayload);

    return NextResponse.json({ ok: true, event });
  } catch (error) {
    console.error('[events] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

