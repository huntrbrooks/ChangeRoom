-- Apply before migration_account_closure.sql, after migration_add_clothing_item_offers.sql.
-- Legacy production created this table lazily in db-access.ts. Account closure must
-- also work when no affiliate click has ever caused that code path to run.
BEGIN;
CREATE TABLE IF NOT EXISTS public.affiliate_clicks (
  id uuid PRIMARY KEY,
  offer_id uuid,
  user_id text,
  clicked_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.affiliate_clicks'::regclass
      AND conname='affiliate_clicks_offer_id_fkey'
  ) THEN
    ALTER TABLE public.affiliate_clicks
      ADD CONSTRAINT affiliate_clicks_offer_id_fkey
      FOREIGN KEY (offer_id) REFERENCES public.clothing_item_offers(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS affiliate_clicks_offer_idx ON public.affiliate_clicks(offer_id);
CREATE INDEX IF NOT EXISTS affiliate_clicks_user_idx ON public.affiliate_clicks(user_id);
CREATE INDEX IF NOT EXISTS affiliate_clicks_created_at_idx ON public.affiliate_clicks(created_at);
COMMIT;
