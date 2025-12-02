-- Migration: Add clothing_item_offers table for Shop & Save affiliate offers
-- This table stores product offers found for each clothing item

CREATE TABLE IF NOT EXISTS clothing_item_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clothing_item_id UUID NOT NULL REFERENCES clothing_items(id) ON DELETE CASCADE,
  source TEXT NOT NULL,                    -- 'ebay', 'amazon', 'google_shopping'
  merchant TEXT NOT NULL,
  title TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'AUD',
  product_url TEXT NOT NULL,
  affiliate_url TEXT NOT NULL,             -- Already tagged affiliate link
  thumbnail_url TEXT,
  shipping_price NUMERIC(10, 2),
  total_price NUMERIC(10, 2) NOT NULL,     -- price + shipping
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clothing_item_offers_clothing_item_idx ON clothing_item_offers (clothing_item_id);
CREATE INDEX IF NOT EXISTS clothing_item_offers_source_idx ON clothing_item_offers (source);
CREATE INDEX IF NOT EXISTS clothing_item_offers_total_price_idx ON clothing_item_offers (total_price);
CREATE INDEX IF NOT EXISTS clothing_item_offers_created_at_idx ON clothing_item_offers (created_at);

-- Optional: Add a table for tracking affiliate link clicks
CREATE TABLE IF NOT EXISTS affiliate_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID REFERENCES clothing_item_offers(id) ON DELETE SET NULL,
  user_id TEXT,                             -- Optional: track which user clicked
  clicked_url TEXT NOT NULL,                -- The affiliate URL that was clicked
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS affiliate_clicks_offer_idx ON affiliate_clicks (offer_id);
CREATE INDEX IF NOT EXISTS affiliate_clicks_user_idx ON affiliate_clicks (user_id);
CREATE INDEX IF NOT EXISTS affiliate_clicks_created_at_idx ON affiliate_clicks (created_at);

