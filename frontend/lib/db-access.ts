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

export interface CreditHold {
  id: string;
  user_id: string;
  request_id: string;
  amount: number;
  status: "active" | "debited" | "released" | "cancelled" | "expired";
  reason: string | null;
  expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

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

function errorMessageIncludes(error: unknown, text: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string" &&
    ((error as { message: string }).message.includes(text))
  );
}

// Helpers to lazily provision tables when migrations haven't run
const USERS_BILLING_TABLE = "users_billing";
let usersBillingTableReady: Promise<void> | null = null;

const CREDIT_HOLDS_TABLE = "credit_holds";
const CREDIT_LEDGER_TABLE = "credit_ledger_entries";
let creditTablesReady: Promise<void> | null = null;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

function isMissingRelationError(error: unknown, relation: string): boolean {
  return getErrorMessage(error)
    .toLowerCase()
    .includes(`relation \"${relation.toLowerCase()}\" does not exist`);
}

async function createUsersBillingTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS users_billing (
      user_id TEXT PRIMARY KEY,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      plan TEXT NOT NULL DEFAULT 'free',
      credits_available INTEGER NOT NULL DEFAULT 0,
      credits_refresh_at TIMESTAMPTZ,
      trial_used BOOLEAN NOT NULL DEFAULT false,
      is_frozen BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS users_billing_stripe_customer_idx ON users_billing (stripe_customer_id)`;
  await sql`CREATE INDEX IF NOT EXISTS users_billing_plan_idx ON users_billing (plan)`;
  // Backward-compatible column adds (safe to run repeatedly)
  await sql`ALTER TABLE users_billing ADD COLUMN IF NOT EXISTS trial_used BOOLEAN NOT NULL DEFAULT false`;
  await sql`ALTER TABLE users_billing ADD COLUMN IF NOT EXISTS is_frozen BOOLEAN NOT NULL DEFAULT false`;
}

async function ensureUsersBillingTable(forceRefresh = false): Promise<void> {
  if (forceRefresh) usersBillingTableReady = null;
  if (!usersBillingTableReady) {
    usersBillingTableReady = createUsersBillingTable().catch((error) => {
      usersBillingTableReady = null;
      throw error;
    });
  }
  return usersBillingTableReady;
}

async function withUsersBillingTable<T>(operation: () => Promise<T>): Promise<T> {
  try {
    await ensureUsersBillingTable();
    return await operation();
  } catch (error) {
    if (isMissingRelationError(error, USERS_BILLING_TABLE)) {
      await ensureUsersBillingTable(true);
      return await operation();
    }
    throw error;
  }
}

async function createCreditTables(): Promise<void> {
  // credit_holds
  await sql`
    CREATE TABLE IF NOT EXISTS credit_holds (
      id UUID PRIMARY KEY,
      user_id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      amount INTEGER NOT NULL CHECK (amount > 0),
      status TEXT NOT NULL DEFAULT 'active',
      reason TEXT,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS credit_holds_request_unique ON credit_holds (request_id)`;
  await sql`CREATE INDEX IF NOT EXISTS credit_holds_user_status_idx ON credit_holds (user_id, status)`;

  // credit_ledger_entries
  await sql`
    CREATE TABLE IF NOT EXISTS credit_ledger_entries (
      id UUID PRIMARY KEY,
      user_id TEXT NOT NULL,
      request_id TEXT,
      hold_id UUID REFERENCES credit_holds(id),
      entry_type TEXT NOT NULL,
      credits_change INTEGER NOT NULL,
      balance_after INTEGER,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS credit_ledger_entries_user_created_idx ON credit_ledger_entries (user_id, created_at)`;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_entries_request_type_unique
    ON credit_ledger_entries (request_id, entry_type)
    WHERE request_id IS NOT NULL
  `;
}

async function ensureCreditTables(forceRefresh = false): Promise<void> {
  if (forceRefresh) creditTablesReady = null;
  if (!creditTablesReady) {
    creditTablesReady = createCreditTables().catch((error) => {
      creditTablesReady = null;
      throw error;
    });
  }
  return creditTablesReady;
}

async function withCreditTables<T>(operation: () => Promise<T>): Promise<T> {
  try {
    await ensureCreditTables();
    return await operation();
  } catch (error) {
    if (
      isMissingRelationError(error, CREDIT_HOLDS_TABLE) ||
      isMissingRelationError(error, CREDIT_LEDGER_TABLE)
    ) {
      await ensureCreditTables(true);
      return await operation();
    }
    throw error;
  }
}

// Lightweight transaction helper for @vercel/postgres (begin is available at runtime)
const runTransaction = async <T>(fn: (tx: typeof sql) => Promise<T>): Promise<T> => {
  const client = sql as unknown as { begin: (cb: (tx: typeof sql) => Promise<T>) => Promise<T> };
  return client.begin(async (tx: typeof sql) => fn(tx));
};

async function ensureUserBillingWithLock(
  tx: typeof sql,
  userId: string
): Promise<UserBilling> {
  const existing = await tx`
    SELECT * FROM users_billing WHERE user_id = ${userId} FOR UPDATE
  `;

  if (existing.rows.length > 0) {
    const billing = existing.rows[0] as UserBilling;
    return {
      ...billing,
      trial_used: billing.trial_used ?? false,
      is_frozen: billing.is_frozen ?? false,
    };
  }

  const inserted = await tx`
    INSERT INTO users_billing (user_id, plan, credits_available, trial_used, is_frozen)
    VALUES (${userId}, 'free', ${appConfig.freeCredits}, false, false)
    ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
    RETURNING *
  `;

  return inserted.rows[0] as UserBilling;
}

function coerceLedgerEntry(row: Record<string, unknown>): CreditLedgerEntry {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    request_id: (row.request_id as string) || null,
    hold_id: (row.hold_id as string) || null,
    entry_type: row.entry_type as CreditLedgerEntryType,
    credits_change: row.credits_change as number,
    balance_after: (row.balance_after as number) ?? null,
    metadata: (row.metadata as Record<string, unknown>) || {},
    created_at: row.created_at as Date,
  };
}

/**
 * Get or create user billing record
 * Creates with free plan and default credits if doesn't exist
 */
export async function getOrCreateUserBilling(userId: string): Promise<UserBilling> {
  return withUsersBillingTable(async () => {
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
        } catch {
          // If column doesn't exist, return with default value
          return { ...billing, trial_used: false, is_frozen: billing.is_frozen ?? false };
        }
      }
      // If free plan trial has been used and there is no purchase, credits should be 0.
      // This corrects older records created with default free credits.
      const normalized = { ...billing, trial_used: billing.trial_used ?? false, is_frozen: billing.is_frozen ?? false };
      if (
        normalized.plan === "free" &&
        normalized.trial_used === true &&
        (normalized.credits_available ?? 0) > 0 &&
        !normalized.stripe_subscription_id
      ) {
        const hasPurchase = await hasPaidCreditGrant(userId);
        if (!hasPurchase) {
          const updated = await sql`
            UPDATE users_billing
            SET credits_available = 0, updated_at = now()
            WHERE user_id = ${userId}
            RETURNING *
          `;
          if (updated.rows.length > 0) {
            return { ...(updated.rows[0] as UserBilling), trial_used: true, is_frozen: (updated.rows[0] as UserBilling).is_frozen ?? false };
          }
        }
      }
      return normalized;
    }

    // Create new record
    try {
      const result = await sql`
        INSERT INTO users_billing (user_id, plan, credits_available, trial_used, is_frozen)
        VALUES (${userId}, 'free', ${appConfig.freeCredits}, false, false)
        ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
        RETURNING *
      `;

      if (result.rows.length > 0) {
        return result.rows[0] as UserBilling;
      }
    } catch (err: unknown) {
      // If trial_used column doesn't exist, try without it
      if (errorMessageIncludes(err, "trial_used")) {
        const result = await sql`
          INSERT INTO users_billing (user_id, plan, credits_available, is_frozen)
          VALUES (${userId}, 'free', ${appConfig.freeCredits}, false)
          ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
          RETURNING *
        `;
        if (result.rows.length > 0) {
          return { ...(result.rows[0] as UserBilling), trial_used: false, is_frozen: false };
        }
      }
      throw err;
    }

    // If no row returned (shouldn't happen), fetch it
    const fetchResult = await sql`
      SELECT * FROM users_billing WHERE user_id = ${userId}
    `;
    const fetched = fetchResult.rows[0] as UserBilling;
    return {
      ...fetched,
      trial_used: fetched.trial_used ?? false,
      is_frozen: fetched.is_frozen ?? false,
    };
  });
}

/**
 * Create or reuse a credit hold (idempotent by requestId).
 * Reduces available credits immediately; release/debit is append-only.
 */
export async function createCreditHold(params: {
  userId: string;
  requestId: string;
  amount: number;
  reason?: string;
  expiresAt?: Date;
}): Promise<{ hold: CreditHold; created: boolean; billing: UserBilling }> {
  const { userId, requestId, amount, reason, expiresAt } = params;

  if (!requestId.trim()) {
    throw new Error("request_id_required");
  }
  if (amount <= 0) {
    throw new Error("amount_must_be_positive");
  }

  await ensureUsersBillingTable();
  await ensureCreditTables();
  return runTransaction(async (tx) => {
    // Reuse existing hold for idempotency
    const existingHold = await tx`
      SELECT * FROM credit_holds WHERE request_id = ${requestId} LIMIT 1
    `;
    if (existingHold.rows.length > 0) {
      const hold = existingHold.rows[0] as CreditHold;
      const billing = await ensureUserBillingWithLock(tx, hold.user_id);
      return { hold, created: false, billing };
    }

    let billing = await ensureUserBillingWithLock(tx, userId);
    // Mark free trial as consumed when the first credit is held
    if (!billing.trial_used && billing.plan === "free") {
      const trialUpdate = await tx`
        UPDATE users_billing
        SET trial_used = true, updated_at = now()
        WHERE user_id = ${userId} AND (trial_used = false OR trial_used IS NULL)
        RETURNING *
      `;
      if (trialUpdate.rows.length > 0) {
        billing = trialUpdate.rows[0] as UserBilling;
      }
    }
    if (billing.is_frozen) {
      throw new Error("account_frozen");
    }
    if (billing.credits_available < amount) {
      throw new Error("insufficient_credits");
    }

    const updatedBilling = await tx`
      UPDATE users_billing
      SET 
        credits_available = credits_available - ${amount},
        updated_at = now()
      WHERE user_id = ${userId}
      RETURNING *
    `;

    const holdId = generateUuid();
    const holdResult = await tx`
      INSERT INTO credit_holds (
        id,
        user_id,
        request_id,
        amount,
        status,
        reason,
        expires_at
      )
      VALUES (
        ${holdId},
        ${userId},
        ${requestId},
        ${amount},
        'active',
        ${reason || null},
        ${expiresAt ? expiresAt.toISOString() : null}
      )
      RETURNING *
    `;

    await tx`
      INSERT INTO credit_ledger_entries (
        id,
        user_id,
        request_id,
        hold_id,
        entry_type,
        credits_change,
        balance_after,
        metadata
      )
      VALUES (
        ${generateUuid()},
        ${userId},
        ${requestId},
        ${holdResult.rows[0].id},
        'hold',
        ${-amount},
        ${updatedBilling.rows[0].credits_available},
        ${JSON.stringify({ reason })}
      )
      ON CONFLICT (request_id, entry_type) DO NOTHING
    `;

    return {
      hold: holdResult.rows[0] as CreditHold,
      created: true,
      billing: updatedBilling.rows[0] as UserBilling,
    };
  });
}

/**
 * Finalize a debit from an existing hold (idempotent).
 * Does not change balance because hold already deducted.
 */
export async function finalizeDebitFromHold(
  requestId: string
): Promise<CreditHold | null> {
  if (!requestId.trim()) {
    throw new Error("request_id_required");
  }

  await ensureUsersBillingTable();
  await ensureCreditTables();
  return runTransaction(async (tx) => {
    const holdResult = await tx`
      SELECT * FROM credit_holds WHERE request_id = ${requestId} FOR UPDATE
    `;
    if (holdResult.rows.length === 0) {
      return null;
    }
    const hold = holdResult.rows[0] as CreditHold;

    if (hold.status === "debited") {
      return hold;
    }
    if (hold.status !== "active") {
      return hold;
    }

    const billing = await ensureUserBillingWithLock(tx, hold.user_id);

    const updatedHold = await tx`
      UPDATE credit_holds
      SET status = 'debited', updated_at = now()
      WHERE id = ${hold.id}
      RETURNING *
    `;

    await tx`
      INSERT INTO credit_ledger_entries (
        id,
        user_id,
        request_id,
        hold_id,
        entry_type,
        credits_change,
        balance_after,
        metadata
      )
      VALUES (
        ${generateUuid()},
        ${hold.user_id},
        ${requestId},
        ${hold.id},
        'debit',
        0,
        ${billing.credits_available},
        ${JSON.stringify({ amount: hold.amount })}
      )
      ON CONFLICT (request_id, entry_type) DO NOTHING
    `;

    return updatedHold.rows[0] as CreditHold;
  });
}

/**
 * Release an existing hold (idempotent). Adds credits back if hold was active.
 */
export async function releaseCreditHold(
  requestId: string,
  reason?: string
): Promise<CreditHold | null> {
  if (!requestId.trim()) {
    throw new Error("request_id_required");
  }

  await ensureUsersBillingTable();
  await ensureCreditTables();
  return runTransaction(async (tx) => {
    const holdResult = await tx`
      SELECT * FROM credit_holds WHERE request_id = ${requestId} FOR UPDATE
    `;
    if (holdResult.rows.length === 0) {
      return null;
    }
    const hold = holdResult.rows[0] as CreditHold;

    // Already finalized
    if (hold.status === "debited" || hold.status === "released") {
      return hold;
    }

    const billing = await ensureUserBillingWithLock(tx, hold.user_id);

    const updatedBilling =
      hold.status === "active"
        ? await tx`
            UPDATE users_billing
            SET 
              credits_available = credits_available + ${hold.amount},
              updated_at = now()
            WHERE user_id = ${hold.user_id}
            RETURNING *
          `
        : { rows: [billing] };

    const updatedHold = await tx`
      UPDATE credit_holds
      SET status = 'released', updated_at = now(), reason = COALESCE(${reason || null}, reason)
      WHERE id = ${hold.id}
      RETURNING *
    `;

    await tx`
      INSERT INTO credit_ledger_entries (
        id,
        user_id,
        request_id,
        hold_id,
        entry_type,
        credits_change,
        balance_after,
        metadata
      )
      VALUES (
        ${generateUuid()},
        ${hold.user_id},
        ${requestId},
        ${hold.id},
        'release',
        ${hold.status === "active" ? hold.amount : 0},
        ${updatedBilling.rows[0].credits_available},
        ${JSON.stringify({ reason })}
      )
      ON CONFLICT (request_id, entry_type) DO NOTHING
    `;

    return updatedHold.rows[0] as CreditHold;
  });
}

/**
 * Grant credits (append-only ledger)
 */
export async function grantCredits(
  userId: string,
  amount: number,
  metadata: Record<string, unknown> = {},
  requestId?: string
): Promise<UserBilling> {
  if (amount <= 0) {
    throw new Error("grant_amount_must_be_positive");
  }

  await ensureUsersBillingTable();
  await ensureCreditTables();
  return runTransaction(async (tx) => {
    // Ensure billing exists and lock row for safe concurrent updates
    await ensureUserBillingWithLock(tx, userId);

    // Idempotency gate: if requestId is provided, insert the ledger row first.
    // Only if the insert succeeds do we mutate the user's balance.
    let insertedLedgerId: string | null = null;
    if (requestId && requestId.trim()) {
      const inserted = await tx`
        INSERT INTO credit_ledger_entries (
          id,
          user_id,
          request_id,
          entry_type,
          credits_change,
          balance_after,
          metadata
        )
        VALUES (
          ${generateUuid()},
          ${userId},
          ${requestId},
          'grant',
          ${amount},
          NULL,
          ${JSON.stringify(metadata)}
        )
        ON CONFLICT (request_id, entry_type) DO NOTHING
        RETURNING id
      `;
      if (inserted.rows.length === 0) {
        // Already granted for this requestId
        const existing = await tx`
          SELECT * FROM users_billing WHERE user_id = ${userId} FOR UPDATE
        `;
        return existing.rows[0] as UserBilling;
      }
      insertedLedgerId = inserted.rows[0].id as string;
    }

    const updated = await tx`
      UPDATE users_billing
      SET
        credits_available = credits_available + ${amount},
        updated_at = now()
      WHERE user_id = ${userId}
      RETURNING *
    `;

    // If requestId wasn't provided, we still write an audit ledger row (non-idempotent by design).
    if (!requestId || !requestId.trim()) {
      await tx`
        INSERT INTO credit_ledger_entries (
          id,
          user_id,
          request_id,
          entry_type,
          credits_change,
          balance_after,
          metadata
        )
        VALUES (
          ${generateUuid()},
          ${userId},
          NULL,
          'grant',
          ${amount},
          ${updated.rows[0].credits_available},
          ${JSON.stringify(metadata)}
        )
      `;
    } else if (insertedLedgerId) {
      // Fill in balance_after for the inserted ledger row
      await tx`
        UPDATE credit_ledger_entries
        SET balance_after = ${updated.rows[0].credits_available}
        WHERE id = ${insertedLedgerId}
      `;
    }

    return updated.rows[0] as UserBilling;
  });
}

/**
 * Fetch active hold by requestId
 */
export async function getHoldByRequestId(
  requestId: string
): Promise<CreditHold | null> {
  await ensureCreditTables();
  return withCreditTables(async () => {
    const result = await sql`
      SELECT * FROM credit_holds WHERE request_id = ${requestId} LIMIT 1
    `;
    return (result.rows[0] as CreditHold) || null;
  });
}

/**
 * Get recent ledger entries for a user (descending)
 */
export async function getLedgerEntries(
  userId: string,
  limit: number = 50
): Promise<CreditLedgerEntry[]> {
  await ensureCreditTables();
  return withCreditTables(async () => {
    const result = await sql`
      SELECT * FROM credit_ledger_entries
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return result.rows.map(coerceLedgerEntry);
  });
}

/**
 * Check whether the user has any recorded paid credit grants (excludes free trial).
 */
export async function hasPaidCreditGrant(userId: string): Promise<boolean> {
  await ensureCreditTables();
  return withCreditTables(async () => {
    const result = await sql`
      SELECT 1
      FROM credit_ledger_entries
      WHERE user_id = ${userId}
        AND entry_type = 'grant'
        AND COALESCE(metadata->>'reason', '') <> 'free_trial'
      LIMIT 1
    `;
    return result.rows.length > 0;
  });
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

  const result = await withUsersBillingTable(() => sql`
    UPDATE users_billing
    SET 
      credits_available = ${newCredits},
      credits_refresh_at = ${refreshAtValue || null},
      updated_at = now()
    WHERE user_id = ${userId}
    RETURNING *
  `);

  const updated = result.rows[0] as UserBilling;
  return { ...updated, is_frozen: updated.is_frozen ?? false };
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
        const result = await withUsersBillingTable(() => sql`
          UPDATE users_billing
          SET 
            trial_used = true,
            updated_at = now()
          WHERE user_id = ${userId} AND (trial_used = false OR trial_used IS NULL)
          RETURNING *
        `);
        return result.rows.length > 0;
      } catch (err: unknown) {
        // If trial_used column doesn't exist, just allow the try-on
        const messageIncludesTrial =
          errorMessageIncludes(err, 'trial_used') || errorMessageIncludes(err, 'column');
        if (messageIncludesTrial) {
          return true;
        }
        throw err;
      }
    }
    
    // Use a transaction to ensure atomicity for regular credits
    const result = await withUsersBillingTable(() => sql`
      UPDATE users_billing
      SET 
        credits_available = credits_available - 1,
        updated_at = now()
      WHERE user_id = ${userId} AND credits_available > 0
      RETURNING *
    `);

    return result.rows.length > 0;
  } catch (err) {
    console.error('Error in decrementCreditsIfAvailable:', err);
    return false;
  }
}

/**
 * Apply a 1-credit penalty for repeated content blocks (idempotent by requestId).
 *
 * IMPORTANT: This must NOT consume free trial. It only decrements paid credits_available.
 * We record a credit_ledger_entries row with entry_type='adjustment' for auditing.
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

  await ensureUsersBillingTable();
  await ensureCreditTables();

  return runTransaction(async (tx) => {
    const billing = await ensureUserBillingWithLock(tx, userId);
    if (billing.is_frozen) {
      throw new Error("account_frozen");
    }

    // Idempotency: if an adjustment already exists for this requestId, do not charge again.
    const existing = await tx`
      SELECT id FROM credit_ledger_entries
      WHERE request_id = ${requestId} AND entry_type = 'adjustment'
      LIMIT 1
    `;
    if (existing.rows.length > 0) {
      const refreshed = await ensureUserBillingWithLock(tx, userId);
      return { charged: false, billing: refreshed };
    }

    if (billing.credits_available < amount) {
      throw new Error("insufficient_credits");
    }

    const updatedBilling = await tx`
      UPDATE users_billing
      SET
        credits_available = credits_available - ${amount},
        updated_at = now()
      WHERE user_id = ${userId}
      RETURNING *
    `;

    const updated = updatedBilling.rows[0] as UserBilling;

    await tx`
      INSERT INTO credit_ledger_entries (
        id,
        user_id,
        request_id,
        entry_type,
        credits_change,
        balance_after,
        metadata
      )
      VALUES (
        ${generateUuid()},
        ${userId},
        ${requestId},
        'adjustment',
        ${-amount},
        ${updated.credits_available},
        ${JSON.stringify({ reason: "content_block_penalty", amount })}
      )
      ON CONFLICT (request_id, entry_type) DO NOTHING
    `;

    return { charged: true, billing: updated };
  });
}

/**
 * Atomically mark free trial as used and optionally grant credits once.
 */
export async function grantFreeTrialOnce(
  userId: string,
  grantAmount: number
): Promise<{ granted: boolean; billing: UserBilling }> {
  if (grantAmount <= 0) {
    return { granted: false, billing: await getOrCreateUserBilling(userId) };
  }

  await ensureUsersBillingTable();
  await ensureCreditTables();
  return runTransaction(async (tx) => {
    const billing = await ensureUserBillingWithLock(tx, userId);
    if (billing.trial_used) {
      return { granted: false, billing };
    }

    const updatedBilling = await tx`
      UPDATE users_billing
      SET 
        trial_used = true,
        credits_available = credits_available + ${grantAmount},
        updated_at = now()
      WHERE user_id = ${userId} AND (trial_used = false OR trial_used IS NULL)
      RETURNING *
    `;

    if (updatedBilling.rows.length === 0) {
      const refreshed = await ensureUserBillingWithLock(tx, userId);
      return { granted: false, billing: refreshed };
    }

    await tx`
      INSERT INTO credit_ledger_entries (
        id,
        user_id,
        entry_type,
        credits_change,
        balance_after,
        metadata
      )
      VALUES (
        ${generateUuid()},
        ${userId},
        'grant',
        ${grantAmount},
        ${updatedBilling.rows[0].credits_available},
        ${JSON.stringify({ reason: "free_trial" })}
      )
    `;

    return {
      granted: true,
      billing: updatedBilling.rows[0] as UserBilling,
    };
  });
}

/**
 * Mark the free trial as used without adjusting credits.
 * Returns updated billing or existing if already marked.
 */
export async function markFreeTrialUsed(userId: string): Promise<UserBilling> {
  return withUsersBillingTable(async () => {
    const result = await sql`
      UPDATE users_billing
      SET
        trial_used = true,
        credits_available = CASE
          WHEN plan = 'free' THEN 0
          ELSE credits_available
        END,
        updated_at = now()
      WHERE user_id = ${userId} AND (trial_used = false OR trial_used IS NULL)
      RETURNING *
    `;

    if (result.rows.length === 0) {
      return getOrCreateUserBilling(userId);
    }

    return result.rows[0] as UserBilling;
  });
}

/**
 * Reset free trial for a user (for testing/admin purposes)
 * Note: In production, users should only get one free try-on
 */
export async function resetFreeTrial(userId: string): Promise<UserBilling> {
  return withUsersBillingTable(async () => {
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
  });
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

  return withUsersBillingTable(async () => {
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

    return { ...(result.rows[0] as UserBilling), is_frozen: (result.rows[0] as UserBilling).is_frozen ?? false };
  });
}

/**
 * Freeze or unfreeze a user's ability to generate (e.g., on payment failure)
 */
export async function setUserBillingFrozen(
  userId: string,
  frozen: boolean
): Promise<UserBilling> {
  return withUsersBillingTable(async () => {
    const result = await sql`
      UPDATE users_billing
      SET is_frozen = ${frozen}, updated_at = now()
      WHERE user_id = ${userId}
      RETURNING *
    `;
    if (result.rows.length === 0) {
      return getOrCreateUserBilling(userId);
    }
    return {
      ...(result.rows[0] as UserBilling),
      is_frozen: (result.rows[0] as UserBilling).is_frozen ?? false,
    };
  });
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
    brand?: string | null;
    description: string;
    tags?: string[];
    originalFilename?: string | null;
    mimeType?: string | null;
    width?: number | null;
    height?: number | null;
  }>
): Promise<ClothingItem[]> {
  return withClothingItemsTable(async () => {
    const inserted: ClothingItem[] = [];

    for (const item of items) {
      const itemId = generateUuid();
      const result = await sql`
        INSERT INTO clothing_items (
          id,
          user_id,
          storage_key,
          public_url,
          category,
          subcategory,
          color,
          style,
          brand,
          description,
          tags,
          original_filename,
          mime_type,
          width,
          height
        )
        VALUES (
          ${itemId},
          ${userId},
          ${item.storageKey},
          ${item.publicUrl},
          ${item.category},
          ${item.subcategory || null},
          ${item.color || null},
          ${item.style || null},
          ${item.brand || null},
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
  });
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
    since?: Date;
  }
): Promise<ClothingItem[]> {
  return withClothingItemsTable(async () => {
    // Build single query with all conditions
    let result;
    const sinceValue =
      filters?.since instanceof Date && !Number.isNaN(filters.since.getTime())
        ? filters.since.toISOString()
        : null;
    
    if (filters?.category && filters?.tags && filters.tags.length > 0) {
      if (sinceValue) {
        result = await sql`
          SELECT * FROM clothing_items
          WHERE user_id = ${userId}
          AND category = ${filters.category}
          AND tags @> ${JSON.stringify(filters.tags)}::jsonb
          AND created_at >= ${sinceValue}
          ORDER BY created_at DESC
        `;
      } else {
        result = await sql`
          SELECT * FROM clothing_items
          WHERE user_id = ${userId}
          AND category = ${filters.category}
          AND tags @> ${JSON.stringify(filters.tags)}::jsonb
          ORDER BY created_at DESC
        `;
      }
    } else if (filters?.category) {
      if (sinceValue) {
        result = await sql`
          SELECT * FROM clothing_items
          WHERE user_id = ${userId}
          AND category = ${filters.category}
          AND created_at >= ${sinceValue}
          ORDER BY created_at DESC
        `;
      } else {
        result = await sql`
          SELECT * FROM clothing_items
          WHERE user_id = ${userId}
          AND category = ${filters.category}
          ORDER BY created_at DESC
        `;
      }
    } else if (filters?.tags && filters.tags.length > 0) {
      if (sinceValue) {
        result = await sql`
          SELECT * FROM clothing_items
          WHERE user_id = ${userId}
          AND tags @> ${JSON.stringify(filters.tags)}::jsonb
          AND created_at >= ${sinceValue}
          ORDER BY created_at DESC
        `;
      } else {
        result = await sql`
          SELECT * FROM clothing_items
          WHERE user_id = ${userId}
          AND tags @> ${JSON.stringify(filters.tags)}::jsonb
          ORDER BY created_at DESC
        `;
      }
    } else {
      if (sinceValue) {
        result = await sql`
          SELECT * FROM clothing_items
          WHERE user_id = ${userId}
          AND created_at >= ${sinceValue}
          ORDER BY created_at DESC
        `;
      } else {
        result = await sql`
          SELECT * FROM clothing_items
          WHERE user_id = ${userId}
          ORDER BY created_at DESC
        `;
      }
    }
    
    let items = result.rows as ClothingItem[];
    
    // Apply limit after query if needed
    if (filters?.limit) {
      items = items.slice(0, filters.limit);
    }
    
    return items;
  });
}

/**
 * Utility: confirm clothing item belongs to user
 */
async function clothingItemBelongsToUser(
  userId: string,
  clothingItemId: string
): Promise<boolean> {
  const result = await sql`
    SELECT id FROM clothing_items
    WHERE user_id = ${userId} AND id = ${clothingItemId}
    LIMIT 1
  `;
  return result.rows.length > 0;
}

/**
 * Get IDs of saved clothing items for user
 */
export async function getSavedClothingItemIds(userId: string): Promise<string[]> {
  return withSavedClothingItemsTable(async () => {
    const result = await sql`
      SELECT clothing_item_id
      FROM saved_clothing_items
      WHERE user_id = ${userId}
      ORDER BY saved_at DESC
    `;
    return result.rows.map((row) => row.clothing_item_id as string);
  });
}

/**
 * Get saved clothing items (joined with clothing data)
 */
export async function getSavedClothingItems(
  userId: string,
  options?: { limit?: number }
): Promise<Array<ClothingItem & { saved_at: Date }>> {
  return withSavedClothingItemsTable(() =>
    withClothingItemsTable(async () => {
      const limitValue =
        typeof options?.limit === 'number' && Number.isFinite(options.limit) ? options.limit : null;

      const result = limitValue
        ? await sql`
            SELECT c.*, s.saved_at
            FROM saved_clothing_items s
            INNER JOIN clothing_items c ON c.id = s.clothing_item_id
            WHERE s.user_id = ${userId}
            ORDER BY s.saved_at DESC
            LIMIT ${limitValue}
          `
        : await sql`
            SELECT c.*, s.saved_at
            FROM saved_clothing_items s
            INNER JOIN clothing_items c ON c.id = s.clothing_item_id
            WHERE s.user_id = ${userId}
            ORDER BY s.saved_at DESC
          `;
      return result.rows as Array<ClothingItem & { saved_at: Date }>;
    })
  );
}

/**
 * Save or update a clothing item in the user's saved list
 */
export async function saveClothingItem(
  userId: string,
  clothingItemId: string
): Promise<void> {
  return withSavedClothingItemsTable(async () => {
    const owned = await clothingItemBelongsToUser(userId, clothingItemId);
    if (!owned) {
      throw new Error("Clothing item not found for user");
    }

    await sql`
      INSERT INTO saved_clothing_items (id, user_id, clothing_item_id)
      VALUES (${generateUuid()}, ${userId}, ${clothingItemId})
      ON CONFLICT (user_id, clothing_item_id)
      DO UPDATE SET saved_at = now()
    `;
  });
}

/**
 * Remove clothing item from saved list
 */
export async function removeSavedClothingItem(
  userId: string,
  clothingItemId: string
): Promise<void> {
  return withSavedClothingItemsTable(async () => {
    await sql`
      DELETE FROM saved_clothing_items
      WHERE user_id = ${userId} AND clothing_item_id = ${clothingItemId}
    `;
  });
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

  return withClothingItemsTable(async () => {
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
  });
}

export async function countClothingItemsByUser(
  userId: string,
  since?: Date
): Promise<number> {
  const result = since
    ? await sql`
        SELECT COUNT(*) as count
        FROM clothing_items
        WHERE user_id = ${userId} AND created_at >= ${since.toISOString()}
      `
    : await sql`
        SELECT COUNT(*) as count
        FROM clothing_items
        WHERE user_id = ${userId}
      `;

  const countStr = (result.rows[0] as { count: string }).count || "0";
  return parseInt(countStr, 10);
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

// Shop & Save Offer Types
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

/**
 * Insert offers for a clothing item (replace existing offers)
 */
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
  return withClothingItemOffersTable(async () => {
    await sql`
      DELETE FROM clothing_item_offers
      WHERE clothing_item_id = ${clothingItemId}
    `;

    const inserted: ClothingItemOffer[] = [];
    for (const offer of offers) {
      const offerId = generateUuid();
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
          ${offerId},
          ${clothingItemId},
          ${offer.source},
          ${offer.merchant},
          ${offer.title},
          ${offer.price},
          ${offer.currency},
          ${offer.productUrl},
          ${offer.affiliateUrl},
          ${offer.thumbnailUrl || null},
          ${offer.shippingPrice || null},
          ${offer.totalPrice}
        )
        RETURNING *
      `;
      inserted.push(result.rows[0] as ClothingItemOffer);
    }

    return inserted;
  });
}

/**
 * Get offers for a clothing item (scoped to user)
 */
export async function getClothingItemOffers(
  userId: string,
  clothingItemId: string,
  limit?: number
): Promise<ClothingItemOffer[]> {
  return withClothingItemOffersTable(() =>
    withClothingItemsTable(async () => {
      let result;

      if (limit) {
        result = await sql`
          SELECT o.*
          FROM clothing_item_offers o
          INNER JOIN clothing_items c ON c.id = o.clothing_item_id
          WHERE c.user_id = ${userId} AND o.clothing_item_id = ${clothingItemId}
          ORDER BY o.total_price ASC
          LIMIT ${limit}
        `;
      } else {
        result = await sql`
          SELECT o.*
          FROM clothing_item_offers o
          INNER JOIN clothing_items c ON c.id = o.clothing_item_id
          WHERE c.user_id = ${userId} AND o.clothing_item_id = ${clothingItemId}
          ORDER BY o.total_price ASC
        `;
      }

      return result.rows as ClothingItemOffer[];
    })
  );
}

/**
 * Log an affiliate click
 */
export async function logAffiliateClick(data: {
  offerId?: string | null;
  userId?: string | null;
  clickedUrl: string;
}): Promise<void> {
  await withAffiliateClicksTable(async () => {
    const clickId = generateUuid();
    await sql`
      INSERT INTO affiliate_clicks (id, offer_id, user_id, clicked_url)
      VALUES (${clickId}, ${data.offerId || null}, ${data.userId || null}, ${data.clickedUrl})
    `;
  });
}

// Helpers to lazily provision tables when migrations haven't run
const CLOTHING_ITEMS_TABLE = "clothing_items";
let clothingItemsTableReady: Promise<void> | null = null;

const CLOTHING_ITEM_OFFERS_TABLE = "clothing_item_offers";
let clothingItemOffersTableReady: Promise<void> | null = null;

const SAVED_CLOTHING_ITEMS_TABLE = "saved_clothing_items";
let savedClothingItemsTableReady: Promise<void> | null = null;

const AFFILIATE_CLICKS_TABLE = "affiliate_clicks";
let affiliateClicksTableReady: Promise<void> | null = null;

const USER_OUTFITS_TABLE = "user_outfits";
let userOutfitsTableReady: Promise<void> | null = null;

function generateUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  // Fallback for environments without Web Crypto support
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function createClothingItemsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS clothing_items (
      id UUID PRIMARY KEY,
      user_id TEXT NOT NULL,
      storage_key TEXT NOT NULL UNIQUE,
      public_url TEXT NOT NULL,
      category TEXT NOT NULL,
      subcategory TEXT,
      color TEXT,
      style TEXT,
      brand TEXT,
      description TEXT NOT NULL,
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      original_filename TEXT,
      mime_type TEXT,
      width INTEGER,
      height INTEGER,
      wearing_style TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS clothing_items_user_idx ON clothing_items (user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS clothing_items_category_idx ON clothing_items (category)`;
  await sql`CREATE INDEX IF NOT EXISTS clothing_items_tags_gin ON clothing_items USING GIN (tags)`;
  await sql`CREATE INDEX IF NOT EXISTS clothing_items_created_at_idx ON clothing_items (created_at DESC)`;
  await sql`ALTER TABLE clothing_items ADD COLUMN IF NOT EXISTS brand TEXT`;
}

async function ensureClothingItemsTable(forceRefresh = false): Promise<void> {
  if (forceRefresh) {
    clothingItemsTableReady = null;
  }

  if (!clothingItemsTableReady) {
    clothingItemsTableReady = createClothingItemsTable().catch((error) => {
      clothingItemsTableReady = null;
      throw error;
    });
  }

  return clothingItemsTableReady;
}

async function withClothingItemsTable<T>(operation: () => Promise<T>): Promise<T> {
  try {
    await ensureClothingItemsTable();
    return await operation();
  } catch (error) {
    if (isMissingRelationError(error, CLOTHING_ITEMS_TABLE)) {
      await ensureClothingItemsTable(true);
      return await operation();
    }
    throw error;
  }
}

async function createClothingItemOffersTable() {
  await ensureClothingItemsTable();
  await sql`
    CREATE TABLE IF NOT EXISTS clothing_item_offers (
      id UUID PRIMARY KEY,
      clothing_item_id UUID NOT NULL,
      source TEXT NOT NULL,
      merchant TEXT NOT NULL,
      title TEXT NOT NULL,
      price NUMERIC(10, 2) NOT NULL,
      currency TEXT NOT NULL DEFAULT 'AUD',
      product_url TEXT NOT NULL,
      affiliate_url TEXT NOT NULL,
      thumbnail_url TEXT,
      shipping_price NUMERIC(10, 2),
      total_price NUMERIC(10, 2) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'clothing_item_offers_clothing_item_id_fkey'
      ) THEN
        ALTER TABLE clothing_item_offers
        ADD CONSTRAINT clothing_item_offers_clothing_item_id_fkey
        FOREIGN KEY (clothing_item_id) REFERENCES clothing_items(id) ON DELETE CASCADE;
      END IF;
    END $$;
  `;
  await sql`CREATE INDEX IF NOT EXISTS clothing_item_offers_clothing_item_idx ON clothing_item_offers (clothing_item_id)`;
  await sql`CREATE INDEX IF NOT EXISTS clothing_item_offers_source_idx ON clothing_item_offers (source)`;
  await sql`CREATE INDEX IF NOT EXISTS clothing_item_offers_total_price_idx ON clothing_item_offers (total_price)`;
  await sql`CREATE INDEX IF NOT EXISTS clothing_item_offers_created_at_idx ON clothing_item_offers (created_at)`;
}

async function ensureClothingItemOffersTable(forceRefresh = false): Promise<void> {
  if (forceRefresh) {
    clothingItemOffersTableReady = null;
  }

  if (!clothingItemOffersTableReady) {
    clothingItemOffersTableReady = createClothingItemOffersTable().catch((error) => {
      clothingItemOffersTableReady = null;
      throw error;
    });
  }

  return clothingItemOffersTableReady;
}

async function withClothingItemOffersTable<T>(operation: () => Promise<T>): Promise<T> {
  try {
    await ensureClothingItemOffersTable();
    return await operation();
  } catch (error) {
    if (isMissingRelationError(error, CLOTHING_ITEM_OFFERS_TABLE)) {
      await ensureClothingItemOffersTable(true);
      return await operation();
    }
    throw error;
  }
}

async function createSavedClothingItemsTable() {
  await ensureClothingItemsTable();
  await sql`
    CREATE TABLE IF NOT EXISTS saved_clothing_items (
      id UUID PRIMARY KEY,
      user_id TEXT NOT NULL,
      clothing_item_id UUID NOT NULL,
      saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, clothing_item_id)
    )
  `;
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'saved_clothing_items_clothing_item_id_fkey'
      ) THEN
        ALTER TABLE saved_clothing_items
        ADD CONSTRAINT saved_clothing_items_clothing_item_id_fkey
        FOREIGN KEY (clothing_item_id) REFERENCES clothing_items(id) ON DELETE CASCADE;
      END IF;
    END $$;
  `;
  await sql`CREATE INDEX IF NOT EXISTS saved_clothing_items_user_idx ON saved_clothing_items (user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS saved_clothing_items_saved_at_idx ON saved_clothing_items (saved_at DESC)`;
}

async function ensureSavedClothingItemsTable(forceRefresh = false): Promise<void> {
  if (forceRefresh) {
    savedClothingItemsTableReady = null;
  }

  if (!savedClothingItemsTableReady) {
    savedClothingItemsTableReady = createSavedClothingItemsTable().catch((error) => {
      savedClothingItemsTableReady = null;
      throw error;
    });
  }

  return savedClothingItemsTableReady;
}

async function withSavedClothingItemsTable<T>(operation: () => Promise<T>): Promise<T> {
  try {
    await ensureSavedClothingItemsTable();
    return await operation();
  } catch (error) {
    if (isMissingRelationError(error, SAVED_CLOTHING_ITEMS_TABLE)) {
      await ensureSavedClothingItemsTable(true);
      return await operation();
    }
    throw error;
  }
}

async function createAffiliateClicksTable() {
  await ensureClothingItemOffersTable();
  await sql`
    CREATE TABLE IF NOT EXISTS affiliate_clicks (
      id UUID PRIMARY KEY,
      offer_id UUID,
      user_id TEXT,
      clicked_url TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'affiliate_clicks_offer_id_fkey'
      ) THEN
        ALTER TABLE affiliate_clicks
        ADD CONSTRAINT affiliate_clicks_offer_id_fkey
        FOREIGN KEY (offer_id) REFERENCES clothing_item_offers(id) ON DELETE SET NULL;
      END IF;
    END $$;
  `;
  await sql`CREATE INDEX IF NOT EXISTS affiliate_clicks_offer_idx ON affiliate_clicks (offer_id)`;
  await sql`CREATE INDEX IF NOT EXISTS affiliate_clicks_user_idx ON affiliate_clicks (user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS affiliate_clicks_created_at_idx ON affiliate_clicks (created_at)`;
}

async function ensureAffiliateClicksTable(forceRefresh = false): Promise<void> {
  if (forceRefresh) {
    affiliateClicksTableReady = null;
  }

  if (!affiliateClicksTableReady) {
    affiliateClicksTableReady = createAffiliateClicksTable().catch((error) => {
      affiliateClicksTableReady = null;
      throw error;
    });
  }

  return affiliateClicksTableReady;
}

async function withAffiliateClicksTable<T>(operation: () => Promise<T>): Promise<T> {
  try {
    await ensureAffiliateClicksTable();
    return await operation();
  } catch (error) {
    if (isMissingRelationError(error, AFFILIATE_CLICKS_TABLE)) {
      await ensureAffiliateClicksTable(true);
      return await operation();
    }
    throw error;
  }
}

async function createUserOutfitsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS user_outfits (
      id UUID PRIMARY KEY,
      user_id TEXT NOT NULL,
      image_url TEXT NOT NULL,
      clothing_items JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS user_outfits_user_idx ON user_outfits (user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS user_outfits_created_at_idx ON user_outfits (created_at DESC)`;
}

async function ensureUserOutfitsTable(forceRefresh = false): Promise<void> {
  if (forceRefresh) {
    userOutfitsTableReady = null;
  }

  if (!userOutfitsTableReady) {
    userOutfitsTableReady = createUserOutfitsTable().catch((error) => {
      userOutfitsTableReady = null;
      throw error;
    });
  }

  return userOutfitsTableReady;
}

async function withUserOutfitsTable<T>(operation: () => Promise<T>): Promise<T> {
  try {
    await ensureUserOutfitsTable();
    return await operation();
  } catch (error) {
    if (isMissingRelationError(error, USER_OUTFITS_TABLE)) {
      await ensureUserOutfitsTable(true);
      return await operation();
    }
    throw error;
  }
}

// User Outfits Types
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
  clothing_items: ClothingItemMetadata[];
  created_at: Date;
}

/**
 * Insert a new user outfit
 */
export async function insertUserOutfit(
  userId: string,
  data: {
    imageUrl: string;
    clothingItems: ClothingItemMetadata[];
  }
): Promise<UserOutfit> {
  const outfitId = generateUuid();

  const result = await withUserOutfitsTable(() =>
    sql`
      INSERT INTO user_outfits (id, user_id, image_url, clothing_items)
      VALUES (
        ${outfitId},
        ${userId},
        ${data.imageUrl},
        ${JSON.stringify(data.clothingItems)}::jsonb
      )
      RETURNING *
    `
  );

  return result.rows[0] as UserOutfit;
}

/**
 * Get user's outfits (ordered by most recent first)
 */
export async function getUserOutfits(
  userId: string,
  limit?: number
): Promise<UserOutfit[]> {
  return withUserOutfitsTable(async () => {
    let result;
    
    if (limit) {
      result = await sql`
        SELECT * FROM user_outfits
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    } else {
      result = await sql`
        SELECT * FROM user_outfits
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
      `;
    }

    return result.rows as UserOutfit[];
  });
}

/**
 * Delete a user outfit (scoped to user)
 */
export async function deleteUserOutfit(
  userId: string,
  outfitId: string
): Promise<boolean> {
  const result = await withUserOutfitsTable(() =>
    sql`
      DELETE FROM user_outfits
      WHERE id = ${outfitId} AND user_id = ${userId}
      RETURNING id
    `
  );

  return result.rows.length > 0;
}

