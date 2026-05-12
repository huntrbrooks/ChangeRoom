import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { z } from "zod";
import { grantCredits, getOrCreateUserBilling } from "@/lib/db-access";
import { logger } from "@/lib/logger";

const ADMIN_EMAILS = [
  "admin@igetdressed.online",
  "gerard@igetdressed.online",
  "gerardgrenville@gmail.com",
];

const giftCreditsSchema = z.object({
  email: z.string().email(),
  credits: z.number().int().min(1).max(1000),
  reason: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
});

async function getAdminAuth(request: NextRequest): Promise<{
  authorized: boolean;
  adminEmail: string | null;
}> {
  const apiKey = request.headers.get("x-api-key");
  const expectedApiKey = process.env.ADMIN_API_KEY;

  if (apiKey && expectedApiKey && apiKey === expectedApiKey) {
    return { authorized: true, adminEmail: "api-key" };
  }

  const { userId } = await auth();
  if (!userId) {
    return { authorized: false, adminEmail: null };
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const email = user.emailAddresses[0]?.emailAddress || "";

  return {
    authorized: Boolean(email && ADMIN_EMAILS.includes(email.toLowerCase())),
    adminEmail: email || null,
  };
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  const client = await clerkClient();
  const users = await client.users.getUserList({
    emailAddress: [email],
    limit: 1,
  });
  return users.data[0]?.id || null;
}

export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminAuth(request);
    if (!admin.authorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = giftCreditsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "invalid_request",
          details: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }

    const { email, credits, reason } = parsed.data;
    const requestId =
      parsed.data.idempotencyKey ||
      request.headers.get("x-request-id") ||
      request.headers.get("x-changeroom-request-id") ||
      undefined;
    const targetUserId = await findUserIdByEmail(email);
    if (!targetUserId) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }

    const updated = await grantCredits(
      targetUserId,
      credits,
      {
        source: "admin",
        reason: reason || "admin_gift",
        admin_email: admin.adminEmail,
        recipient_email: email,
      },
      requestId ? `admin_gift:${requestId}` : undefined
    );

    logger.info("admin_credits_gifted", {
      admin_email: admin.adminEmail,
      target_user_id: targetUserId,
      credits,
      reason: reason || null,
    });

    return NextResponse.json({
      success: true,
      email,
      creditsGifted: credits,
      totalCredits: updated.credits_available,
      reason: reason || null,
    });
  } catch (error) {
    logger.error("admin_gift_credits_failed", { error });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminAuth(request);
    if (!admin.authorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const email = request.nextUrl.searchParams.get("email")?.trim();
    if (!email) {
      return NextResponse.json({ error: "email_required" }, { status: 400 });
    }

    const targetUserId = await findUserIdByEmail(email);
    if (!targetUserId) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }

    const billing = await getOrCreateUserBilling(targetUserId);

    return NextResponse.json({
      email,
      creditsAvailable: billing.credits_available,
      plan: billing.plan,
      trialsRemaining: billing.trials_remaining,
      isFrozen: billing.is_frozen,
    });
  } catch (error) {
    logger.error("admin_gift_credits_lookup_failed", { error });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
