import { NextRequest, NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { sql } from '@/lib/db';

/**
 * POST /api/admin/gift-credits
 * 
 * Admin endpoint to gift free credits to users (influencers, beta testers, etc.)
 * Requires admin user or valid admin API key.
 * 
 * Body: { email: string, credits: number, reason?: string }
 */

// Admin users who can gift credits
const ADMIN_EMAILS = [
  'admin@igetdressed.online',
  'gerard@igetdressed.online',
  'gerardgrenville@gmail.com',
  // Add more admin emails here
];

export async function POST(request: NextRequest) {
  try {
    // Check authorization - either logged in admin or API key
    const apiKey = request.headers.get('x-api-key');
    const expectedApiKey = process.env.ADMIN_API_KEY;

    let isAuthorized = false;
    let adminEmail = 'api-key';

    if (apiKey && expectedApiKey && apiKey === expectedApiKey) {
      isAuthorized = true;
    } else {
      // Check if logged in user is admin
      const { userId } = await auth();
      if (userId) {
        const client = await clerkClient();
        const user = await client.users.getUser(userId);
        const email = user.emailAddresses[0]?.emailAddress;
        if (email && ADMIN_EMAILS.includes(email.toLowerCase())) {
          isAuthorized = true;
          adminEmail = email;
        }
      }
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { email, credits, reason } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    if (!credits || typeof credits !== 'number' || credits < 1 || credits > 1000) {
      return NextResponse.json(
        { error: 'Credits must be a number between 1 and 1000' },
        { status: 400 }
      );
    }

    // Find user in Clerk by email
    const client = await clerkClient();
    let targetUserId: string | null = null;

    const users = await client.users.getUserList({
      emailAddress: [email],
      limit: 1,
    });

    if (users.data.length > 0) {
      targetUserId = users.data[0].id;
    }

    if (!targetUserId) {
      return NextResponse.json(
        { error: `User not found with email: ${email}` },
        { status: 404 }
      );
    }

    // Check current credits
    const existing = await sql`
      SELECT credits_available FROM billing WHERE clerk_user_id = ${targetUserId}
    `;

    const currentCredits = existing.rows[0]?.credits_available ?? 0;
    const newCredits = currentCredits + credits;

    // Upsert billing record
    await sql`
      INSERT INTO billing (clerk_user_id, credits_available, plan, trial_used, updated_at)
      VALUES (${targetUserId}, ${newCredits}, 'gifted', true, NOW())
      ON CONFLICT (clerk_user_id)
      DO UPDATE SET
        credits_available = ${newCredits},
        updated_at = NOW()
    `;

    // Log the gift for audit trail
    try {
      await sql`
        INSERT INTO credit_transactions (clerk_user_id, amount, type, description, created_at)
        VALUES (${targetUserId}, ${credits}, 'gift', ${reason || `Gifted by ${adminEmail}`}, NOW())
      `;
    } catch (txnError) {
      // Table might not exist yet - log but don't fail
      console.warn('[gift-credits] Could not log transaction (table may not exist):', txnError);
    }

    console.log(`[gift-credits] ${adminEmail} gifted ${credits} credits to ${email}. Reason: ${reason || 'N/A'}`);

    return NextResponse.json({
      success: true,
      email,
      creditsGifted: credits,
      totalCredits: newCredits,
      reason: reason || null,
    });
  } catch (error) {
    console.error('[gift-credits] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET endpoint to check credit balance
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const email = url.searchParams.get('email');

    if (!email) {
      return NextResponse.json({ error: 'Email query param required' }, { status: 400 });
    }

    // Check authorization
    const apiKey = request.headers.get('x-api-key');
    const expectedApiKey = process.env.ADMIN_API_KEY;

    if (!apiKey || apiKey !== expectedApiKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const client = await clerkClient();
    const users = await client.users.getUserList({
      emailAddress: [email],
      limit: 1,
    });

    if (users.data.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userId = users.data[0].id;
    
    const result = await sql`
      SELECT credits_available, plan, trial_used FROM billing WHERE clerk_user_id = ${userId}
    `;

    const billing = result.rows[0];

    return NextResponse.json({
      email,
      creditsAvailable: billing?.credits_available ?? 0,
      plan: billing?.plan ?? 'free',
      trialUsed: billing?.trial_used ?? false,
    });
  } catch (error) {
    console.error('[gift-credits] GET Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
