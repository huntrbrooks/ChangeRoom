-- Migration: Add free trial support to users_billing table
-- Run this if the table already exists

-- Remove old trial_end_at if it exists and add trial_used
ALTER TABLE users_billing 
DROP COLUMN IF EXISTS trial_end_at;

ALTER TABLE users_billing 
ADD COLUMN IF NOT EXISTS trial_used BOOLEAN NOT NULL DEFAULT false;

