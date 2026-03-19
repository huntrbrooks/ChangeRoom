/**
 * Compatibility DB access helpers.
 *
 * Context:
 * Vercel/Next (Turbopack) requires that imported named exports exist at build time.
 * Some routes historically imported helpers from `@/lib/db-access` that are not
 * present in the current deployed file on `main`, causing Vercel builds to fail.
 *
 * This module provides a stable set of small, focused helpers used by app routes.
 */

import { sql } from "./db";
import { appConfig } from "./config";

function uuid(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  // Fallback (should be rare in Vercel/Node)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export type Plan = "free" | "standard" | "pro";

export interface UserBilling {
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: Plan;
  credits_available: number;
  credits_refresh_at: Date | null;
  is_frozen: boolean;
  created_at: Date;
  updated_at: Date;
}

export type CreditLedgerEntryType =
  | "grant"
  | "hold"
  | "debit"
  | "release"
  | "refund"
  | "adjustment";

export interface CreditLedgerEntry {
  id: string;
  user_id: string;
  request_id: string | null;
  hold_id: string | null;
  entry_type: CreditLedgerEntryType;
  credits_change: number;
  balance_after: number | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

export interface ClothingItem {
  id: string;
  user_id: string;
  storage_key: string;
  public_url: string;
  category: string;
  subcategory: string | null;
  color: string | null;
  style: string | null;
  brand: string | null;
  description: string;
  tags: string[];
  original_filename: string | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  wearing_style: string | null;
  created_at: Date;
}

export interface PersonImage {
  id: string;
  user_id: string;
  storage_key: string;
  public_url: string;
  description: string | null;
  original_filename: string | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  created_at: Date;
}

export interface ClothingItemOffer {
  id: string;
  clothing_item_id: string;
  source: string;
  merchant: string;
  title: string;
  price: number;
  currency: string;
  product_url: string;
  affiliate_url: string;
  thumbnail_url: string | null;
  shipping_price: number | null;
  total_price: number;
  created_at: Date;
}

export interface ClothingItemMetadata {
  filename: string;
  category: string;
  itemType: string;
  color: string;
  style: string;
  description: string;
  tags: string[];
  fileUrl: string | null;
}

export interface UserOutfit {
  id: string;
  user_id: string;
  image_url: string;
  // Stored as JSONB; callers treat it as `ClothingItemMetadata[]`
  clothing_items: unknown;
  created_at: Date;
}

/**
 * Apply a credit penalty when users repeatedly trigger content blocks.
 * Idempotent by requestId (entry_type='adjustment').
 */
export async function applyContentBlockPenalty(params: {
  userId: string;
  requestId: string;
  amount?: number;
}): Promise<{ charged: boolean; billing: UserBilling }> {
  const { userId, requestId } = params;
  const amount = params.amount ?? 1;

  if (!requestId || !requestId.trim()) {
    throw new Error("request_id_required");
  }
  if (amount <= 0) {
    throw new Error("amount_must_be_positive");
  }

  // Ensure user row exists (cheap)
  await sql`
    INSERT INTO users_billing (user_id, plan, credits_available, is_frozen)
    VALUES (${userId}, 'free', ${appConfig.freeCredits}, false)
    ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
  `;

  // Idempotency: already charged for this request?
  const existing = await sql`
    SELECT id FROM credit_ledger_entries
    WHERE request_id = ${requestId} AND entry_type = 'adjustment'
    LIMIT 1
  `;
  if (existing.rows.length > 0) {
    const billing = await sql`SELECT * FROM users_billing WHERE user_id = ${userId} LIMIT 1`;
    return { charged: false, billing: billing.rows[0] as UserBilling };
  }

  const updated = await sql`
    UPDATE users_billing
    SET credits_available = credits_available - ${amount}, updated_at = now()
    WHERE user_id = ${userId} AND credits_available >= ${amount} AND is_frozen = false
    RETURNING *
  `;
  if (updated.rows.length === 0) {
    // Distinguish frozen vs insufficient
    const current = await sql`SELECT is_frozen, credits_available FROM users_billing WHERE user_id = ${userId} LIMIT 1`;
    const row = current.rows[0] as { is_frozen?: boolean; credits_available?: number } | undefined;
    if (row?.is_frozen) throw new Error("account_frozen");
    throw new Error("insufficient_credits");
  }

  await sql`
    INSERT INTO credit_ledger_entries (
      id, user_id, request_id, hold_id, entry_type, credits_change, balance_after, metadata
    )
    VALUES (
      ${uuid()},
      ${userId},
      ${requestId},
      NULL,
      'adjustment',
      ${-amount},
      ${(updated.rows[0] as UserBilling).credits_available},
      ${JSON.stringify({ reason: "content_block_penalty", amount })}
    )
  `;

  return { charged: true, billing: updated.rows[0] as UserBilling };
}

export async function getLedgerEntries(
  userId: string,
  limit = 50
): Promise<CreditLedgerEntry[]> {
  const result = await sql`
    SELECT * FROM credit_ledger_entries
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return result.rows as CreditLedgerEntry[];
}

export async function getUserBillingByStripeCustomer(
  stripeCustomerId: string
): Promise<UserBilling | null> {
  const result = await sql`
    SELECT * FROM users_billing
    WHERE stripe_customer_id = ${stripeCustomerId}
    LIMIT 1
  `;
  return (result.rows[0] as UserBilling) || null;
}

export async function countClothingItemsByUser(
  userId: string,
  since?: Date
): Promise<number> {
  const result = since
    ? await sql`
        SELECT COUNT(*) AS count
        FROM clothing_items
        WHERE user_id = ${userId} AND created_at >= ${since.toISOString()}
      `
    : await sql`
        SELECT COUNT(*) AS count
        FROM clothing_items
        WHERE user_id = ${userId}
      `;
  const countStr = (result.rows[0] as { count?: string })?.count ?? "0";
  return Number.parseInt(countStr, 10);
}

export async function getUserClothingItems(
  userId: string,
  filters?: {
    category?: string;
    tags?: string[];
    limit?: number;
    since?: Date;
  }
): Promise<ClothingItem[]> {
  const limit =
    typeof filters?.limit === "number" && Number.isFinite(filters.limit)
      ? Math.max(1, Math.min(200, filters.limit))
      : 200;
  const sinceIso = filters?.since ? filters.since.toISOString() : null;

  // Keep logic simple and safe for Postgres template tags.
  if (filters?.category && filters?.tags?.length) {
    const result = sinceIso
      ? await sql`
          SELECT * FROM clothing_items
          WHERE user_id = ${userId}
            AND category = ${filters.category}
            AND tags @> ${JSON.stringify(filters.tags)}::jsonb
            AND created_at >= ${sinceIso}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `
      : await sql`
          SELECT * FROM clothing_items
          WHERE user_id = ${userId}
            AND category = ${filters.category}
            AND tags @> ${JSON.stringify(filters.tags)}::jsonb
          ORDER BY created_at DESC
          LIMIT ${limit}
        `;
    return result.rows as ClothingItem[];
  }

  if (filters?.category) {
    const result = sinceIso
      ? await sql`
          SELECT * FROM clothing_items
          WHERE user_id = ${userId}
            AND category = ${filters.category}
            AND created_at >= ${sinceIso}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `
      : await sql`
          SELECT * FROM clothing_items
          WHERE user_id = ${userId}
            AND category = ${filters.category}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `;
    return result.rows as ClothingItem[];
  }

  if (filters?.tags?.length) {
    const result = sinceIso
      ? await sql`
          SELECT * FROM clothing_items
          WHERE user_id = ${userId}
            AND tags @> ${JSON.stringify(filters.tags)}::jsonb
            AND created_at >= ${sinceIso}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `
      : await sql`
          SELECT * FROM clothing_items
          WHERE user_id = ${userId}
            AND tags @> ${JSON.stringify(filters.tags)}::jsonb
          ORDER BY created_at DESC
          LIMIT ${limit}
        `;
    return result.rows as ClothingItem[];
  }

  const result = sinceIso
    ? await sql`
        SELECT * FROM clothing_items
        WHERE user_id = ${userId} AND created_at >= ${sinceIso}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `
    : await sql`
        SELECT * FROM clothing_items
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
  return result.rows as ClothingItem[];
}

export async function getPersonImageById(
  userId: string,
  personImageId: string
): Promise<PersonImage | null> {
  const result = await sql`
    SELECT * FROM person_images
    WHERE id = ${personImageId} AND user_id = ${userId}
    LIMIT 1
  `;
  return (result.rows[0] as PersonImage) || null;
}

export async function getClothingItemsByIds(
  userId: string,
  clothingItemIds: string[]
): Promise<ClothingItem[]> {
  const ids = clothingItemIds.slice(0, 5);
  if (ids.length === 0) return [];

  if (ids.length === 1) {
    const result = await sql`
      SELECT * FROM clothing_items
      WHERE user_id = ${userId} AND id = ${ids[0]}
      LIMIT 5
    `;
    return result.rows as ClothingItem[];
  }

  // Avoid ANY()/array casting pitfalls; keep it explicit.
  // @vercel/postgres doesn't support joining template fragments directly; use OR cases.
  if (ids.length === 2) {
    const result = await sql`
      SELECT * FROM clothing_items
      WHERE user_id = ${userId} AND (id = ${ids[0]} OR id = ${ids[1]})
      LIMIT 5
    `;
    return result.rows as ClothingItem[];
  }
  if (ids.length === 3) {
    const result = await sql`
      SELECT * FROM clothing_items
      WHERE user_id = ${userId}
        AND (id = ${ids[0]} OR id = ${ids[1]} OR id = ${ids[2]})
      LIMIT 5
    `;
    return result.rows as ClothingItem[];
  }
  if (ids.length === 4) {
    const result = await sql`
      SELECT * FROM clothing_items
      WHERE user_id = ${userId}
        AND (id = ${ids[0]} OR id = ${ids[1]} OR id = ${ids[2]} OR id = ${ids[3]})
      LIMIT 5
    `;
    return result.rows as ClothingItem[];
  }
  const result = await sql`
    SELECT * FROM clothing_items
    WHERE user_id = ${userId}
      AND (id = ${ids[0]} OR id = ${ids[1]} OR id = ${ids[2]} OR id = ${ids[3]} OR id = ${ids[4]})
    LIMIT 5
  `;
  return result.rows as ClothingItem[];
}

export async function upsertClothingItemOffers(
  clothingItemId: string,
  offers: Array<{
    source: string;
    merchant: string;
    title: string;
    price: number;
    currency: string;
    productUrl: string;
    affiliateUrl: string;
    thumbnailUrl?: string | null;
    shippingPrice?: number | null;
    totalPrice: number;
  }>
): Promise<ClothingItemOffer[]> {
  await sql`DELETE FROM clothing_item_offers WHERE clothing_item_id = ${clothingItemId}`;

  const inserted: ClothingItemOffer[] = [];
  for (const offer of offers) {
    const result = await sql`
      INSERT INTO clothing_item_offers (
        id,
        clothing_item_id,
        source,
        merchant,
        title,
        price,
        currency,
        product_url,
        affiliate_url,
        thumbnail_url,
        shipping_price,
        total_price
      )
      VALUES (
        ${uuid()},
        ${clothingItemId},
        ${offer.source},
        ${offer.merchant},
        ${offer.title},
        ${offer.price},
        ${offer.currency},
        ${offer.productUrl},
        ${offer.affiliateUrl},
        ${offer.thumbnailUrl ?? null},
        ${offer.shippingPrice ?? null},
        ${offer.totalPrice}
      )
      RETURNING *
    `;
    if (result.rows[0]) inserted.push(result.rows[0] as ClothingItemOffer);
  }

  return inserted;
}

export async function getClothingItemOffers(
  userId: string,
  clothingItemId: string,
  limit = 10
): Promise<ClothingItemOffer[]> {
  const result = await sql`
    SELECT o.*
    FROM clothing_item_offers o
    INNER JOIN clothing_items c ON c.id = o.clothing_item_id
    WHERE c.user_id = ${userId} AND o.clothing_item_id = ${clothingItemId}
    ORDER BY o.total_price ASC
    LIMIT ${limit}
  `;
  return result.rows as ClothingItemOffer[];
}

export async function getSavedClothingItemIds(userId: string): Promise<string[]> {
  const result = await sql`
    SELECT clothing_item_id
    FROM saved_clothing_items
    WHERE user_id = ${userId}
    ORDER BY saved_at DESC
  `;
  return result.rows.map((r) => String((r as { clothing_item_id?: unknown }).clothing_item_id));
}

export async function getSavedClothingItems(
  userId: string,
  options?: { limit?: number }
): Promise<Array<ClothingItem & { saved_at: Date }>> {
  const limit =
    typeof options?.limit === "number" && Number.isFinite(options.limit)
      ? Math.max(1, Math.min(200, options.limit))
      : null;

  const result = limit
    ? await sql`
        SELECT c.*, s.saved_at
        FROM saved_clothing_items s
        INNER JOIN clothing_items c ON c.id = s.clothing_item_id
        WHERE s.user_id = ${userId}
        ORDER BY s.saved_at DESC
        LIMIT ${limit}
      `
    : await sql`
        SELECT c.*, s.saved_at
        FROM saved_clothing_items s
        INNER JOIN clothing_items c ON c.id = s.clothing_item_id
        WHERE s.user_id = ${userId}
        ORDER BY s.saved_at DESC
      `;
  return result.rows as Array<ClothingItem & { saved_at: Date }>;
}

export async function getUserOutfits(
  userId: string,
  limit = 50
): Promise<UserOutfit[]> {
  const result = await sql`
    SELECT * FROM user_outfits
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return result.rows as UserOutfit[];
}

export async function deleteUserOutfit(
  userId: string,
  outfitId: string
): Promise<boolean> {
  const result = await sql`
    DELETE FROM user_outfits
    WHERE id = ${outfitId} AND user_id = ${userId}
    RETURNING id
  `;
  return result.rows.length > 0;
}

