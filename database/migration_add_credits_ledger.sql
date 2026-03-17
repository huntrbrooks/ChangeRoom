-- Migration: add credits ledger, holds, and freeze flag
-- Safe to run multiple times (IF NOT EXISTS / idempotent indexes)

-- Add freeze flag to users_billing
ALTER TABLE users_billing
ADD COLUMN IF NOT EXISTS is_frozen BOOLEAN NOT NULL DEFAULT false;

-- credit_holds: temporary reservations of credits tied to requestId
CREATE TABLE IF NOT EXISTS credit_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'active', -- active, debited, released, cancelled, expired
  reason TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS credit_holds_request_unique ON credit_holds (request_id);
CREATE INDEX IF NOT EXISTS credit_holds_user_status_idx ON credit_holds (user_id, status);

-- credit_ledger_entries: append-only ledger
CREATE TABLE IF NOT EXISTS credit_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  request_id TEXT,
  hold_id UUID REFERENCES credit_holds(id),
  entry_type TEXT NOT NULL, -- grant, hold, debit, release, refund, adjustment
  credits_change INTEGER NOT NULL,
  balance_after INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS credit_ledger_entries_user_created_idx
  ON credit_ledger_entries (user_id, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_entries_request_type_unique
  ON credit_ledger_entries (request_id, entry_type)
  WHERE request_id IS NOT NULL;

