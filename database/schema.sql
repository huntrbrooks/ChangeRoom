-- Database schema for IGetDressed.Online
-- Designed for Neon (Postgres)

-- clothing_items: Each uploaded clothing image, owned by a Clerk user
CREATE TABLE IF NOT EXISTS clothing_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,                 -- Clerk userId
  storage_key TEXT NOT NULL UNIQUE,      -- R2 key: clothing/user_xxx/...
  public_url TEXT NOT NULL,              -- CDN url: https://cdn.../clothing/...
  category TEXT NOT NULL,                -- tshirt, hoodie, pants, shoes, etc
  subcategory TEXT,                      -- graphic tee, cargo pants,...
  color TEXT,
  style TEXT,                            -- streetwear, formal, casual,...
  brand TEXT,                            -- inferred brand name if visible
  description TEXT,                      -- 1 sentence human description
  tags JSONB DEFAULT '[]'::jsonb,        -- ["black","oversized","streetwear"]
  original_filename TEXT,
  mime_type TEXT,
  width INTEGER,
  height INTEGER,
  wearing_style TEXT,                      -- How the item should be worn (e.g., "backwards", "tucked_in")
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clothing_items_user_idx ON clothing_items (user_id);
CREATE INDEX IF NOT EXISTS clothing_items_category_idx ON clothing_items (category);
CREATE INDEX IF NOT EXISTS clothing_items_tags_gin ON clothing_items USING GIN (tags);

-- person_images: Base photos of the user that can be used for try on
CREATE TABLE IF NOT EXISTS person_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  public_url TEXT NOT NULL,
  description TEXT,
  original_filename TEXT,
  mime_type TEXT,
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS person_images_user_idx ON person_images (user_id);

-- tryon_sessions: Track what outfit was generated
CREATE TABLE IF NOT EXISTS tryon_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  person_image_id UUID NOT NULL REFERENCES person_images(id),
  clothing_item_ids UUID[] NOT NULL,              -- chosen clothing_items
  gemini_model TEXT NOT NULL DEFAULT 'gemini-2.5-flash-image',
  result_storage_key TEXT,                        -- where you save the result
  result_public_url TEXT,
  status TEXT NOT NULL DEFAULT 'completed',       -- completed, failed, pending
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tryon_sessions_user_idx ON tryon_sessions (user_id);

-- users_billing: Track user subscription, plan, and credits
CREATE TABLE IF NOT EXISTS users_billing (
  user_id TEXT PRIMARY KEY,                    -- Clerk userId
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  plan TEXT NOT NULL DEFAULT 'free',           -- free, standard, pro
  credits_available INTEGER NOT NULL DEFAULT 10,
  credits_refresh_at TIMESTAMPTZ,              -- When to refresh monthly credits
  trial_used BOOLEAN NOT NULL DEFAULT false,   -- Whether the free trial try-on has been used
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_billing_stripe_customer_idx ON users_billing (stripe_customer_id);
CREATE INDEX IF NOT EXISTS users_billing_plan_idx ON users_billing (plan);

