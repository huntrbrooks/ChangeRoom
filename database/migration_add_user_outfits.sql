-- Migration: Add user_outfits table for persistent storage of saved outfits
-- Each user can save their try-on results as outfits

CREATE TABLE IF NOT EXISTS user_outfits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,                    -- Clerk userId
  image_url TEXT NOT NULL,                  -- URL of the generated try-on image
  clothing_items JSONB NOT NULL,            -- Array of clothing item metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_outfits_user_idx ON user_outfits (user_id);
CREATE INDEX IF NOT EXISTS user_outfits_created_at_idx ON user_outfits (created_at DESC);


