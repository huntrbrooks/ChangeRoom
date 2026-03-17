import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/webhooks/n8n
 * 
 * Webhook endpoint for n8n automations to trigger actions in the app.
 * Secured by a shared secret in the Authorization header.
 * 
 * Supported events:
 * - welcome_email_sent: Track that welcome email was delivered
 * - trial_reminder_sent: Track trial consumption reminder
 * - conversion_email_sent: Track post-trial conversion email
 * - abandoned_cart_reminder: Track abandoned cart reminder
 */
export async function POST(request: NextRequest) {
  try {
    // Verify n8n webhook secret
    const authHeader = request.headers.get('authorization');
    const expectedSecret = process.env.N8N_WEBHOOK_SECRET;
    
    if (!expectedSecret) {
      console.warn('[n8n-webhook] N8N_WEBHOOK_SECRET not configured');
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
    }

    const providedSecret = authHeader?.replace('Bearer ', '');
    if (providedSecret !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { event, userId, email, data } = body;

    if (!event) {
      return NextResponse.json({ error: 'Missing event type' }, { status: 400 });
    }

    // Log the webhook event for analytics
    console.log('[n8n-webhook]', {
      event,
      userId,
      email: email?.slice(0, 3) + '***', // Mask email for logs
      timestamp: new Date().toISOString(),
      data,
    });

    // Handle different event types
    switch (event) {
      case 'welcome_email_sent':
        // Could update user metadata or trigger analytics
        console.log(`[n8n] Welcome email sent to user ${userId || email}`);
        break;

      case 'trial_reminder_sent':
        console.log(`[n8n] Trial reminder sent to user ${userId || email}`);
        break;

      case 'conversion_email_sent':
        console.log(`[n8n] Conversion email sent to user ${userId || email}`);
        break;

      case 'abandoned_cart_reminder':
        console.log(`[n8n] Abandoned cart reminder sent to user ${userId || email}`);
        break;

      case 'review_request_sent':
        console.log(`[n8n] Review request sent to user ${userId || email}`);
        break;

      default:
        console.log(`[n8n] Unknown event: ${event}`);
    }

    return NextResponse.json({
      ok: true,
      event,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[n8n-webhook] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Also support GET for webhook verification during setup
export async function GET() {
  return NextResponse.json({
    status: 'n8n webhook endpoint active',
    supportedEvents: [
      'welcome_email_sent',
      'trial_reminder_sent',
      'conversion_email_sent',
      'abandoned_cart_reminder',
      'review_request_sent',
    ],
  });
}

