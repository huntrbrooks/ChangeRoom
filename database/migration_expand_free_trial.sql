-- Migration: Expand free trial from 1 to 2 try-ons
-- Changes trial_used (boolean) to trials_remaining (integer with default 2)
-- This allows users to have 2 free try-ons before needing to purchase credits

-- Step 1: Add new column trials_remaining (default 2 for new users)
ALTER TABLE users_billing
ADD COLUMN IF NOT EXISTS trials_remaining INTEGER NOT NULL DEFAULT 2;

-- Step 2: Migrate existing data
-- Users who have used their trial (trial_used = true) get 0 remaining trials
-- Users who haven't (trial_used = false or null) get 2 remaining trials
UPDATE users_billing
SET trials_remaining = CASE
  WHEN trial_used = true THEN 0
  WHEN trial_used = false OR trial_used IS NULL THEN 2
  ELSE 2
END
WHERE trials_remaining = 2; -- Only update rows that still have default value

-- Step 3: Drop the old trial_used column
ALTER TABLE users_billing DROP COLUMN IF EXISTS trial_used;

-- Step 4: Add index for efficient queries
CREATE INDEX IF NOT EXISTS users_billing_trials_remaining_idx
ON users_billing (trials_remaining)
WHERE trials_remaining > 0;
