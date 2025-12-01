/**
 * Centralized data access layer for database operations
 * All database queries should go through this module to ensure:
 * - Proper parameterization (SQL injection prevention)
 * - Consistent error handling
 * - Transaction support where needed
 * - User scoping (userId checks)
 */

import { sql } from "./db";
import { appConfig } from "./config";

// Types
export type Plan = "free" | "standard" | "pro";

export interface UserBilling {
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: Plan;
  credits_available: number;
  credits_refresh_at: Date | null;
  trial_used: boolean;
  created_at: Date;
  updated_at: Date;
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

export interface TryOnSession {
  id: string;
  user_id: string;
  person_image_id: string;
  clothing_item_ids: string[];
  gemini_model: string;
  result_storage_key: string | null;
  result_public_url: string | null;
  status: "completed" | "failed" | "pending";
  error: string | null;
  created_at: Date;
}

/**
 * Get or create user billing record
 * Creates with free plan and default credits if doesn't exist
 */
export async function getOrCreateUserBilling(userId: string): Promise<UserBilling> {
  // First try to get existing record
  const existing = await sql`
    SELECT * FROM users_billing WHERE user_id = ${userId}
  `;

  if (existing.rows.length > 0) {
    const billing = existing.rows[0] as UserBilling;
    // Ensure trial_used field exists (for backward compatibility)
    if (billing.trial_used === undefined || billing.trial_used === null) {
      // Update to set default value if column exists
      try {
        await sql`
          UPDATE users_billing 
          SET trial_used = COALESCE(trial_used, false), updated_at = now()
          WHERE user_id = ${userId}
        `;
        // Fetch again to get updated value
        const updated = await sql`
          SELECT * FROM users_billing WHERE user_id = ${userId}
        `;
        return updated.rows[0] as UserBilling;
      } catch (err) {
        // If column doesn't exist, return with default value
        return { ...billing, trial_used: false };
      }
    }
    return billing;
  }

  // Create new record
  try {
    const result = await sql`
      INSERT INTO users_billing (user_id, plan, credits_available, trial_used)
      VALUES (${userId}, 'free', ${appConfig.freeCredits}, false)
      ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
      RETURNING *
    `;

    if (result.rows.length > 0) {
      return result.rows[0] as UserBilling;
    }
  } catch (err: any) {
    // If trial_used column doesn't exist, try without it
    if (err.message?.includes('trial_used')) {
      const result = await sql`
        INSERT INTO users_billing (user_id, plan, credits_available)
        VALUES (${userId}, 'free', ${appConfig.freeCredits})
        ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
        RETURNING *
      `;
      if (result.rows.length > 0) {
        return { ...result.rows[0] as UserBilling, trial_used: false };
      }
    }
    throw err;
  }

  // If no row returned (shouldn't happen), fetch it
  const fetchResult = await sql`
    SELECT * FROM users_billing WHERE user_id = ${userId}
  `;
  const fetched = fetchResult.rows[0] as UserBilling;
  return { ...fetched, trial_used: fetched.trial_used ?? false };
}

/**
 * Update user billing credits
 * @param userId - Clerk userId
 * @param delta - Change in credits (positive to add, negative to subtract)
 * @param maybeReset - If true and plan is standard/pro, reset to monthly amount and set refresh date
 */
export async function updateUserBillingCredits(
  userId: string,
  delta: number,
  maybeReset: boolean = false
): Promise<UserBilling> {
  const billing = await getOrCreateUserBilling(userId);

  let newCredits = billing.credits_available + delta;
  let refreshAt = billing.credits_refresh_at;

  // If maybeReset is true and plan is standard/pro, check if refresh is needed
  if (maybeReset && (billing.plan === "standard" || billing.plan === "pro")) {
    const now = new Date();
    if (!billing.credits_refresh_at || now >= new Date(billing.credits_refresh_at)) {
      // Reset to monthly amount (don't add delta, just set to monthly)
      if (billing.plan === "standard") {
        newCredits = appConfig.standardMonthlyCredits;
      } else if (billing.plan === "pro") {
        newCredits = appConfig.proMonthlyCredits;
      }
      // Set refresh to one month from now
      refreshAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    } else {
      // Just add delta if not refreshing
      newCredits = billing.credits_available + delta;
    }
  }

  // Ensure credits don't go negative
  newCredits = Math.max(0, newCredits);

  // Convert Date to ISO string for SQL template
  const refreshAtValue = refreshAt instanceof Date ? refreshAt.toISOString() : refreshAt;

  const result = await sql`
    UPDATE users_billing
    SET 
      credits_available = ${newCredits},
      credits_refresh_at = ${refreshAtValue || null},
      updated_at = now()
    WHERE user_id = ${userId}
    RETURNING *
  `;

  return result.rows[0] as UserBilling;
}

/**
 * Check if user is currently on a free trial (hasn't used their free try-on yet)
 */
export async function isUserOnFreeTrial(userId: string): Promise<boolean> {
  const billing = await getOrCreateUserBilling(userId);
  return !billing.trial_used;
}

/**
 * Decrement credits in a transaction-safe way
 * Returns true if credits were available and decremented, false otherwise
 * During free trial (first try-on), allows 1 free try-on and marks trial as used
 */
export async function decrementCreditsIfAvailable(userId: string): Promise<boolean> {
  try {
    const billing = await getOrCreateUserBilling(userId);
    
    // Check if user is on free trial (hasn't used their free try-on)
    // Handle case where trial_used might be null/undefined (backward compatibility)
    const trialUsed = billing.trial_used ?? false;
    
    if (!trialUsed) {
      // Mark trial as used and allow this try-on
      try {
        const result = await sql`
          UPDATE users_billing
          SET 
            trial_used = true,
            updated_at = now()
          WHERE user_id = ${userId} AND (trial_used = false OR trial_used IS NULL)
          RETURNING *
        `;
        return result.rows.length > 0;
      } catch (err: any) {
        // If trial_used column doesn't exist, just allow the try-on
        if (err.message?.includes('trial_used') || err.message?.includes('column')) {
          return true;
        }
        throw err;
      }
    }
    
    // Use a transaction to ensure atomicity for regular credits
    const result = await sql`
      UPDATE users_billing
      SET 
        credits_available = credits_available - 1,
        updated_at = now()
      WHERE user_id = ${userId} AND credits_available > 0
      RETURNING *
    `;

    return result.rows.length > 0;
  } catch (err) {
    console.error('Error in decrementCreditsIfAvailable:', err);
    return false;
  }
}

/**
 * Reset free trial for a user (for testing/admin purposes)
 * Note: In production, users should only get one free try-on
 */
export async function resetFreeTrial(userId: string): Promise<UserBilling> {
  const result = await sql`
    UPDATE users_billing
    SET 
      trial_used = false,
      updated_at = now()
    WHERE user_id = ${userId}
    RETURNING *
  `;

  if (result.rows.length === 0) {
    return getOrCreateUserBilling(userId);
  }

  return result.rows[0] as UserBilling;
}

/**
 * Update user billing plan and reset credits
 */
export async function updateUserBillingPlan(
  userId: string,
  plan: Plan,
  stripeCustomerId?: string,
  stripeSubscriptionId?: string
): Promise<UserBilling> {
  let monthlyCredits = 0;
  if (plan === "standard") {
    monthlyCredits = appConfig.standardMonthlyCredits;
  } else if (plan === "pro") {
    monthlyCredits = appConfig.proMonthlyCredits;
  } else {
    monthlyCredits = appConfig.freeCredits;
  }

  const refreshAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const result = await sql`
    UPDATE users_billing
    SET 
      plan = ${plan},
      credits_available = ${monthlyCredits},
      credits_refresh_at = ${plan === "free" ? null : refreshAt.toISOString()},
      stripe_customer_id = COALESCE(${stripeCustomerId || null}, stripe_customer_id),
      stripe_subscription_id = COALESCE(${stripeSubscriptionId || null}, stripe_subscription_id),
      updated_at = now()
    WHERE user_id = ${userId}
    RETURNING *
  `;

  if (result.rows.length === 0) {
    // Create if doesn't exist
    return getOrCreateUserBilling(userId);
  }

  return result.rows[0] as UserBilling;
}

/**
 * Insert clothing items (batch)
 */
export async function insertClothingItems(
  userId: string,
  items: Array<{
    storageKey: string;
    publicUrl: string;
    category: string;
    subcategory?: string | null;
    color?: string | null;
    style?: string | null;
    description: string;
    tags?: string[];
    originalFilename?: string | null;
    mimeType?: string | null;
    width?: number | null;
    height?: number | null;
  }>
): Promise<ClothingItem[]> {
  const inserted: ClothingItem[] = [];

  for (const item of items) {
    const result = await sql`
      INSERT INTO clothing_items (
        user_id,
        storage_key,
        public_url,
        category,
        subcategory,
        color,
        style,
        description,
        tags,
        original_filename,
        mime_type,
        width,
        height
      )
      VALUES (
        ${userId},
        ${item.storageKey},
        ${item.publicUrl},
        ${item.category},
        ${item.subcategory || null},
        ${item.color || null},
        ${item.style || null},
        ${item.description},
        ${JSON.stringify(item.tags || [])}::jsonb,
        ${item.originalFilename || null},
        ${item.mimeType || null},
        ${item.width || null},
        ${item.height || null}
      )
      RETURNING *
    `;
    inserted.push(result.rows[0] as ClothingItem);
  }

  return inserted;
}

/**
 * Insert person image
 */
export async function insertPersonImage(
  userId: string,
  data: {
    storageKey: string;
    publicUrl: string;
    description?: string | null;
    originalFilename?: string | null;
    mimeType?: string | null;
    width?: number | null;
    height?: number | null;
  }
): Promise<PersonImage> {
  const result = await sql`
    INSERT INTO person_images (
      user_id,
      storage_key,
      public_url,
      description,
      original_filename,
      mime_type,
      width,
      height
    )
    VALUES (
      ${userId},
      ${data.storageKey},
      ${data.publicUrl},
      ${data.description || null},
      ${data.originalFilename || null},
      ${data.mimeType || null},
      ${data.width || null},
      ${data.height || null}
    )
    RETURNING *
  `;

  return result.rows[0] as PersonImage;
}

/**
 * Get user's person images
 */
export async function getUserPersonImages(userId: string): Promise<PersonImage[]> {
  const result = await sql`
    SELECT * FROM person_images
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `;

  return result.rows as PersonImage[];
}

/**
 * Get user's clothing items with optional filters
 */
export async function getUserClothingItems(
  userId: string,
  filters?: {
    category?: string;
    tags?: string[];
    limit?: number;
  }
): Promise<ClothingItem[]> {
  // Build single query with all conditions
  let result;
  
  if (filters?.category && filters?.tags && filters.tags.length > 0) {
    result = await sql`
      SELECT * FROM clothing_items
      WHERE user_id = ${userId}
      AND category = ${filters.category}
      AND tags @> ${JSON.stringify(filters.tags)}::jsonb
      ORDER BY created_at DESC
    `;
  } else if (filters?.category) {
    result = await sql`
      SELECT * FROM clothing_items
      WHERE user_id = ${userId}
      AND category = ${filters.category}
      ORDER BY created_at DESC
    `;
  } else if (filters?.tags && filters.tags.length > 0) {
    result = await sql`
      SELECT * FROM clothing_items
      WHERE user_id = ${userId}
      AND tags @> ${JSON.stringify(filters.tags)}::jsonb
      ORDER BY created_at DESC
    `;
  } else {
    result = await sql`
      SELECT * FROM clothing_items
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `;
  }
  
  let items = result.rows as ClothingItem[];
  
  // Apply limit after query if needed
  if (filters?.limit) {
    items = items.slice(0, filters.limit);
  }
  
  return items;
  return result.rows as ClothingItem[];
}

/**
 * Get person image by ID (scoped to user)
 */
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

/**
 * Get clothing items by IDs (scoped to user, max 5)
 */
export async function getClothingItemsByIds(
  userId: string,
  clothingItemIds: string[]
): Promise<ClothingItem[]> {
  if (clothingItemIds.length === 0) {
    return [];
  }

  // Limit to 5 items max
  const idsToQuery = clothingItemIds.slice(0, 5);
  if (idsToQuery.length === 0) {
    return [];
  }
  
  // Use a single query with OR conditions for each ID
  // Since we can't nest SQL template tags, build conditions separately
  if (idsToQuery.length === 1) {
    const result = await sql`
      SELECT * FROM clothing_items
      WHERE user_id = ${userId} AND id = ${idsToQuery[0]}
      LIMIT 5
    `;
    return result.rows as ClothingItem[];
  } else if (idsToQuery.length === 2) {
    const result = await sql`
      SELECT * FROM clothing_items
      WHERE user_id = ${userId} AND (id = ${idsToQuery[0]} OR id = ${idsToQuery[1]})
      LIMIT 5
    `;
    return result.rows as ClothingItem[];
  } else if (idsToQuery.length === 3) {
    const result = await sql`
      SELECT * FROM clothing_items
      WHERE user_id = ${userId} AND (id = ${idsToQuery[0]} OR id = ${idsToQuery[1]} OR id = ${idsToQuery[2]})
      LIMIT 5
    `;
    return result.rows as ClothingItem[];
  } else if (idsToQuery.length === 4) {
    const result = await sql`
      SELECT * FROM clothing_items
      WHERE user_id = ${userId} AND (id = ${idsToQuery[0]} OR id = ${idsToQuery[1]} OR id = ${idsToQuery[2]} OR id = ${idsToQuery[3]})
      LIMIT 5
    `;
    return result.rows as ClothingItem[];
  } else {
    const result = await sql`
      SELECT * FROM clothing_items
      WHERE user_id = ${userId} AND (id = ${idsToQuery[0]} OR id = ${idsToQuery[1]} OR id = ${idsToQuery[2]} OR id = ${idsToQuery[3]} OR id = ${idsToQuery[4]})
      LIMIT 5
    `;
    return result.rows as ClothingItem[];
  }
}

/**
 * Insert try-on session
 */
export async function insertTryOnSession(
  userId: string,
  data: {
    personImageId: string;
    clothingItemIds: string[];
    geminiModel?: string;
    status?: "completed" | "failed" | "pending";
  }
): Promise<TryOnSession> {
  const result = await sql`
    INSERT INTO tryon_sessions (
      user_id,
      person_image_id,
      clothing_item_ids,
      gemini_model,
      status
    )
    VALUES (
      ${userId},
      ${data.personImageId},
      ${JSON.stringify(data.clothingItemIds)}::jsonb,
      ${data.geminiModel || "gemini-2.5-flash-image"},
      ${data.status || "pending"}
    )
    RETURNING *
  `;

  return result.rows[0] as TryOnSession;
}

/**
 * Update try-on session result
 */
export async function updateTryOnSessionResult(
  sessionId: string,
  userId: string,
  data: {
    resultStorageKey?: string | null;
    resultPublicUrl?: string | null;
    status?: "completed" | "failed" | "pending";
    error?: string | null;
  }
): Promise<TryOnSession> {
  const result = await sql`
    UPDATE tryon_sessions
    SET 
      result_storage_key = COALESCE(${data.resultStorageKey || null}, result_storage_key),
      result_public_url = COALESCE(${data.resultPublicUrl || null}, result_public_url),
      status = COALESCE(${data.status || null}, status),
      error = COALESCE(${data.error || null}, error)
    WHERE id = ${sessionId} AND user_id = ${userId}
    RETURNING *
  `;

  return result.rows[0] as TryOnSession;
}

/**
 * Get user billing by Stripe customer ID
 */
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

