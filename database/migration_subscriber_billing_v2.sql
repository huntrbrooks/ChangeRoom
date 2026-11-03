BEGIN;
-- A durable reservation is committed BEFORE calling Stripe. Concurrent retries reuse it.
CREATE TABLE IF NOT EXISTS billing_checkout_attempts (
  user_id text PRIMARY KEY, attempt_id uuid NOT NULL UNIQUE,
  price_id text NOT NULL, session_id text UNIQUE, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS subscription_billing_cutover (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  started_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO subscription_billing_cutover(singleton) VALUES (true) ON CONFLICT DO NOTHING;
ALTER TABLE users_billing ALTER COLUMN trials_remaining SET DEFAULT 1; -- existing rows unchanged
COMMIT;
