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

// Credit hold expiry:
// Holds are meant to be short-lived "in-flight" reservations while the Render try-on runs.
// If the client crashes / tab closes / network fails before finalize/cancel, we must
// automatically release holds to avoid permanently trapping user credits.
const DEFAULT_CREDIT_HOLD_TTL_MS = 30 * 60_000; // 30 minutes

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
    (error as { message: string }).message.includes(text)
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

/**
 * Transaction helper for @vercel/postgres
 * Uses pool client with BEGIN/COMMIT/ROLLBACK for proper transaction isolation.
 * The `tx` parameter passed to the callback is the client's template literal sql function.
 * 
 * @throws Error if database connection cannot be established
 * @throws Error if transaction fails (original error is preserved)
 */
const runTransaction = async <T>(fn: (tx: typeof sql) => Promise<T>): Promise<T> => {
  // Validate that sql.connect exists (defensive check for @vercel/postgres API)
  if (typeof sql.connect !== 'function') {
    console.error('Database pool connect method not available. Check @vercel/postgres version.');
    throw new Error('database_pool_unavailable: sql.connect is not a function');
  }
  
  // Get a dedicated client from the pool for transaction isolation
  let client;
  try {
    client = await sql.connect();
  } catch (connectError) {
    console.error('Failed to acquire database connection for transaction:', connectError);
    throw new Error(
      `database_connection_failed: ${connectError instanceof Error ? connectError.message : String(connectError)}`
    );
  }
  
  // Validate that client has required methods
  if (typeof client.query !== 'function' || typeof client.sql !== 'function') {
    console.error('Database client missing required methods. Check @vercel/postgres version.');
    client.release();
    throw new Error('database_client_invalid: client missing query or sql methods');
  }
  
  try {
    // Start transaction
    await client.query('BEGIN');
    
    // Create a wrapper that uses the connected client's sql method
    // but preserves the same type signature as the global sql
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txSql = ((strings: TemplateStringsArray, ...values: any[]) => {
      return client.sql(strings, ...values);
    }) as typeof sql;
    
    // Execute the transaction function
    const result = await fn(txSql);
    
    // Commit on success
    await client.query('COMMIT');
    
    return result;
  } catch (error) {
    // Rollback on any error
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      // Log rollback failure but don't override the original error
      console.error('Transaction rollback failed:', rollbackError);
    }
    
    // Log the transaction error for debugging
    console.error('Transaction failed:', error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    // Always release the client back to the pool
    try {
      client.release();
    } catch (releaseError) {
      // Log but don't throw - the original error (if any) is more important
      console.error('Failed to release database client:', releaseError);
    }
  }
};

type TransactionSql = typeof sql;

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

function defaultHoldExpiry(): Date {
  return new Date(Date.now() + DEFAULT_CREDIT_HOLD_TTL_MS);
}

async function releaseStaleActiveHoldsInTx(
  tx: TransactionSql,
  userId: string
): Promise<{ releasedCount: number; refundedAmount: number }> {
  // Stale if:
  // - expires_at is set and is in the past
  // - OR expires_at is missing (legacy) and the hold is older than the TTL
  const stale = await tx`
    SELECT id, request_id, amount
    FROM credit_holds
    WHERE user_id = ${userId}
      AND status = 'active'
      AND (
        (expires_at IS NOT NULL AND expires_at < now())
        OR (expires_at IS NULL AND created_at < (now() - (${DEFAULT_CREDIT_HOLD_TTL_MS}::bigint * interval '1 millisecond')))
      )
    FOR UPDATE
  `;

  if (stale.rows.length === 0) {
    return { releasedCount: 0, refundedAmount: 0 };
  }

  const refundedAmount = stale.rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);

  // Refund credits back to the user.
  const updatedBilling = await tx`
    UPDATE users_billing
    SET credits_available = credits_available + ${refundedAmount},
        updated_at = now()
    WHERE user_id = ${userId}
    RETURNING *
  `;

  // Mark holds released (preserve original reason if present; otherwise mark as auto).
  await tx`
    UPDATE credit_holds
    SET status = 'released',
        updated_at = now(),
        reason = COALESCE(reason, 'auto_expired')
    WHERE user_id = ${userId}
      AND status = 'active'
      AND (
        (expires_at IS NOT NULL AND expires_at < now())
        OR (expires_at IS NULL AND created_at < (now() - (${DEFAULT_CREDIT_HOLD_TTL_MS}::bigint * interval '1 millisecond')))
      )
  `;

  // Ledger entries (idempotent): only insert if a release entry doesn't already exist.
  // balance_after is set to the post-refund balance for visibility.
  const balanceAfter = updatedBilling.rows[0]?.credits_available ?? null;
  for (const row of stale.rows) {
    const requestId = String(row.request_id);
    const amount = Number(row.amount || 0);
    const holdId = String(row.id);

    const existingRelease = await tx`
      SELECT id FROM credit_ledger_entries
      WHERE request_id = ${requestId} AND entry_type = 'release'
      LIMIT 1
    `;
    if (existingRelease.rows.length === 0) {
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
          ${holdId},
          'release',
          ${amount},
          ${balanceAfter},
          ${JSON.stringify({ reason: "auto_expired" })}
        )
      `;
    }
  }

  return { releasedCount: stale.rows.length, refundedAmount };
}

/**
 * Best-effort cleanup to prevent "stuck credits" when a hold is created but never finalized/cancelled.
 * Safe to call frequently; idempotent via per-request ledger uniqueness checks.
 */
export async function cleanupStaleCreditHoldsForUser(
  userId: string
): Promise<{ releasedCount: number; refundedAmount: number }> {
  await ensureUsersBillingTable();
  await ensureCreditTables();
  return runTransaction(async (tx) => {
    await ensureUserBillingWithLock(tx, userId);
    return releaseStaleActiveHoldsInTx(tx, userId);
  });
}

/**
 * Get or create user billing record
 * Creates with free plan and default credits if doesn't exist
 */
export async function getOrCreateUserBilling(userId: string): Promise<UserBilling> {
  return withUsersBillingTable(async () => {
    // Self-heal: release stale holds so users don't get stuck at "0 credits" forever.
    // (This is safe even for paid plans; it only releases long-stale active holds.)
    try {
      await cleanupStaleCreditHoldsForUser(userId);
    } catch (e) {
      // Do not block billing reads if cleanup fails; just log.
      console.warn("billing: failed to cleanup stale holds (non-fatal)", e);
    }

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
      const normalized = {
        ...billing,
        trial_used: billing.trial_used ?? false,
        is_frozen: billing.is_frozen ?? false,
      };
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
            return {
              ...(updated.rows[0] as UserBilling),
              trial_used: true,
              is_frozen: (updated.rows[0] as UserBilling).is_frozen ?? false,
            };
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
  const effectiveExpiresAt = expiresAt ?? defaultHoldExpiry();

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

    // Ensure billing exists, then release any stale holds for this user before enforcing available credits.
    await ensureUserBillingWithLock(tx, userId);
    await releaseStaleActiveHoldsInTx(tx, userId);
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
        ${effectiveExpiresAt.toISOString()}
      )
      RETURNING *
    `;

    // Note: No ON CONFLICT needed here because the hold itself is idempotent
    // (we check for existing hold at the start of the transaction).
    // The partial unique index on (request_id, entry_type) WHERE request_id IS NOT NULL
    // cannot be used with ON CONFLICT directly in PostgreSQL.
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

    // Check if debit ledger entry already exists (for idempotency)
    const existingDebit = await tx`
      SELECT id FROM credit_ledger_entries
      WHERE request_id = ${requestId} AND entry_type = 'debit'
      LIMIT 1
    `;
    if (existingDebit.rows.length === 0) {
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
      `;
    }

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

    // Check if release ledger entry already exists (for idempotency)
    const existingRelease = await tx`
      SELECT id FROM credit_ledger_entries
      WHERE request_id = ${requestId} AND entry_type = 'release'
      LIMIT 1
    `;
    if (existingRelease.rows.length === 0) {
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
      `;
    }

    return updatedHold.rows[0] as CreditHold;
  });
}

// ... rest of file unchanged ...
