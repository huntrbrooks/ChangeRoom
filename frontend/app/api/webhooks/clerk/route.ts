import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { z } from "zod";
import { ANALYTICS_EVENTS, captureServerEvent } from "@/lib/server-analytics";
import { logger } from "@/lib/logger";

const emailAddressSchema = z.object({
  id: z.string().optional(),
  email_address: z.string().email().optional(),
  emailAddress: z.string().email().optional(),
  verification: z
    .object({
      status: z.string().optional(),
    })
    .optional(),
});

const clerkUserSchema = z.object({
  id: z.string(),
  email_addresses: z.array(emailAddressSchema).optional(),
  emailAddresses: z.array(emailAddressSchema).optional(),
  primary_email_address_id: z.string().nullable().optional(),
  primaryEmailAddressId: z.string().nullable().optional(),
  first_name: z.string().nullable().optional(),
  firstName: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  image_url: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  created_at: z.number().nullable().optional(),
  createdAt: z.number().nullable().optional(),
});

const clerkWebhookSchema = z.object({
  type: z.string(),
  data: z.unknown(),
});

function headerValue(req: NextRequest, name: string): string {
  return req.headers.get(name) || "";
}

function primaryEmail(user: z.infer<typeof clerkUserSchema>): string | null {
  const primaryId = user.primary_email_address_id || user.primaryEmailAddressId || null;
  const emailAddresses = user.email_addresses || user.emailAddresses || [];
  const primary =
    (primaryId && emailAddresses.find((entry) => entry.id === primaryId)) ||
    emailAddresses.find((entry) => entry.verification?.status === "verified") ||
    emailAddresses[0];

  return primary?.email_address || primary?.emailAddress || null;
}

function clerkCreatedAt(user: z.infer<typeof clerkUserSchema>): Date | null {
  const timestamp = user.created_at || user.createdAt || null;
  return typeof timestamp === "number" ? new Date(timestamp) : null;
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.error("clerk_webhook_secret_missing");
    return NextResponse.json({ error: "webhook_not_configured" }, { status: 500 });
  }

  const payload = await req.text();
  const headers = {
    "svix-id": headerValue(req, "svix-id"),
    "svix-timestamp": headerValue(req, "svix-timestamp"),
    "svix-signature": headerValue(req, "svix-signature"),
  };

  if (!headers["svix-id"] || !headers["svix-timestamp"] || !headers["svix-signature"]) {
    return NextResponse.json({ error: "missing_svix_headers" }, { status: 400 });
  }

  let event: z.infer<typeof clerkWebhookSchema>;
  try {
    const verified = new Webhook(webhookSecret).verify(payload, headers);
    event = clerkWebhookSchema.parse(verified);
  } catch (error) {
    logger.warn("clerk_webhook_verification_failed", { error });
    return NextResponse.json({ error: "webhook_verification_failed" }, { status: 400 });
  }

  try {
    const {
      getOrCreateUserBilling,
      markUserProfileDeleted,
      upsertUserProfileFromClerk,
    } = await import("@/lib/db-access");

    switch (event.type) {
      case "user.created":
      case "user.updated": {
        const user = clerkUserSchema.parse(event.data);
        await Promise.all([
          upsertUserProfileFromClerk({
            userId: user.id,
            email: primaryEmail(user),
            firstName: user.first_name || user.firstName || null,
            lastName: user.last_name || user.lastName || null,
            imageUrl: user.image_url || user.imageUrl || null,
            clerkCreatedAt: clerkCreatedAt(user),
          }),
          getOrCreateUserBilling(user.id),
        ]);

        await captureServerEvent(
          event.type === "user.created" ? ANALYTICS_EVENTS.SIGN_UP : ANALYTICS_EVENTS.USER_UPDATED,
          {
            source: "clerk_webhook",
            event_type: event.type,
          },
          user.id
        );

        logger.info("clerk_user_synced", { user_id: user.id, event_type: event.type });
        break;
      }

      case "user.deleted": {
        const deleted = z.object({ id: z.string() }).parse(event.data);
        await markUserProfileDeleted(deleted.id);
        await captureServerEvent(
          ANALYTICS_EVENTS.USER_DELETED,
          {
            source: "clerk_webhook",
            event_type: event.type,
          },
          deleted.id
        );
        logger.info("clerk_user_marked_deleted", { user_id: deleted.id });
        break;
      }

      default:
        logger.info("clerk_webhook_event_unhandled", { event_type: event.type });
    }

    return NextResponse.json({ received: true, type: event.type });
  } catch (error) {
    logger.error("clerk_webhook_handler_failed", { error, event_type: event.type });
    return NextResponse.json({ error: "webhook_handler_failed" }, { status: 500 });
  }
}
