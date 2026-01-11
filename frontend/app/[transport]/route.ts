import { verifyClerkToken } from "@clerk/mcp-tools/next";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { createMcpHandler, withMcpAuth } from "@vercel/mcp-adapter";
import { z } from "zod";
import {
  getOrCreateUserBilling,
  getUserClothingItems,
  getUserOutfits,
  getLedgerEntries,
} from "@/lib/db-access";

const clerk = await clerkClient();

/**
 * ChangeRoom MCP Server
 * Provides AI assistants with access to user data, billing, wardrobe, and outfits.
 * Secured via Clerk OAuth tokens.
 */
const handler = createMcpHandler((server) => {
  // Tool: Get Clerk user data
  server.tool(
    "get-clerk-user-data",
    "Gets data about the Clerk user that authorized this request (name, email, profile)",
    {},
    async (_, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string;
      const userData = await clerk.users.getUser(userId);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              id: userData.id,
              firstName: userData.firstName,
              lastName: userData.lastName,
              email: userData.emailAddresses[0]?.emailAddress,
              imageUrl: userData.imageUrl,
              createdAt: userData.createdAt,
            }),
          },
        ],
      };
    }
  );

  // Tool: Get user billing and credits info
  server.tool(
    "get-user-billing",
    "Gets the user's billing information including credits available, plan, and trial status",
    {},
    async (_, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string;
      const billing = await getOrCreateUserBilling(userId);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              plan: billing.plan,
              creditsAvailable: billing.credits_available,
              trialUsed: billing.trial_used,
              isFrozen: billing.is_frozen,
              stripeCustomerId: billing.stripe_customer_id ? "[set]" : null,
              creditsRefreshAt: billing.credits_refresh_at,
            }),
          },
        ],
      };
    }
  );

  // Tool: Get user's wardrobe (clothing items)
  server.tool(
    "get-user-wardrobe",
    "Gets the user's uploaded clothing items (wardrobe). Returns category, color, style, and description for each item.",
    {
      limit: z.number().optional().describe("Maximum number of items to return (default: 20)"),
      category: z
        .string()
        .optional()
        .describe("Filter by category (e.g., 'tops', 'bottoms', 'dresses')"),
    },
    async (params, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string;
      const limit =
        typeof params.limit === "number" ? params.limit : 20;
      const category =
        typeof params.category === "string" ? params.category : undefined;

      const items = await getUserClothingItems(userId, {
        limit,
        category,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              count: items.length,
              items: items.map((item) => ({
                id: item.id,
                category: item.category,
                subcategory: item.subcategory,
                color: item.color,
                style: item.style,
                brand: item.brand,
                description: item.description,
                wearingStyle: item.wearing_style,
                createdAt: item.created_at,
              })),
            }),
          },
        ],
      };
    }
  );

  // Tool: Get user's saved outfits
  server.tool(
    "get-user-outfits",
    "Gets the user's saved try-on outfits (virtual fitting results)",
    {
      limit: z.number().optional().describe("Maximum number of outfits to return (default: 10)"),
    },
    async (params, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string;
      const limit =
        typeof params.limit === "number" ? params.limit : 10;

      const outfits = await getUserOutfits(userId, limit);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              count: outfits.length,
              outfits: outfits.map((outfit) => ({
                id: outfit.id,
                imageUrl: outfit.image_url,
                clothingItems: outfit.clothing_items,
                createdAt: outfit.created_at,
              })),
            }),
          },
        ],
      };
    }
  );

  // Tool: Get credit history
  server.tool(
    "get-credit-history",
    "Gets the user's credit transaction history (grants, holds, debits, refunds)",
    {
      limit: z.number().optional().describe("Maximum number of entries to return (default: 20)"),
    },
    async (params, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string;
      const limit =
        typeof params.limit === "number" ? params.limit : 20;

      const entries = await getLedgerEntries(userId, limit);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              count: entries.length,
              entries: entries.map((entry) => ({
                id: entry.id,
                type: entry.entry_type,
                creditsChange: entry.credits_change,
                balanceAfter: entry.balance_after,
                requestId: entry.request_id,
                createdAt: entry.created_at,
              })),
            }),
          },
        ],
      };
    }
  );
});

/**
 * Wrap the handler with Clerk OAuth authentication.
 * This ensures only authenticated clients with valid Clerk-issued tokens can access the tools.
 */
const authHandler = withMcpAuth(
  handler,
  async (_, token) => {
    const clerkAuth = await auth({ acceptsToken: "oauth_token" });
    // Note: OAuth tokens are machine tokens. Machine token usage is free
    // during Clerk's public beta period but will be subject to pricing once
    // generally available.
    return verifyClerkToken(clerkAuth, token);
  },
  {
    required: true,
    resourceMetadataPath: "/.well-known/oauth-protected-resource/mcp",
  }
);

export { authHandler as GET, authHandler as POST };

