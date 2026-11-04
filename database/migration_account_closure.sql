-- Apply after base schema, user_outfits, migration_account_closure_prerequisites.sql,
-- tryon_jobs and subscriber_billing_v2. Do not rely on lazy affiliate_clicks creation.
-- No existing account is closed by this migration.
BEGIN;
CREATE TABLE IF NOT EXISTS public.account_closures (
  user_id text PRIMARY KEY, requested_at timestamptz NOT NULL DEFAULT now(),
  billing_state text NOT NULL DEFAULT 'pending' CHECK (billing_state IN ('pending','resolved','review')),
  external_cleanup_at timestamptz, last_attempt_at timestamptz, last_error text
);
CREATE TABLE IF NOT EXISTS public.account_closure_media (
  user_id text NOT NULL REFERENCES public.account_closures(user_id), kind text NOT NULL,
  locator text NOT NULL, removed_at timestamptz, PRIMARY KEY (user_id,kind,locator)
);
REVOKE ALL ON public.account_closures, public.account_closure_media FROM PUBLIC;
ALTER TABLE public.account_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_closure_media ENABLE ROW LEVEL SECURITY;

-- Discard late Clerk/profile sync writes for permanently deleted IDs.
CREATE OR REPLACE FUNCTION public.closure_guard_profile() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.account_closures WHERE user_id=NEW.user_id) THEN
    NEW.email=NULL; NEW.first_name=NULL; NEW.last_name=NULL; NEW.image_url=NULL;
    NEW.deleted_at=COALESCE(NEW.deleted_at,now());
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS closure_guard_profile ON public.user_profiles;
CREATE TRIGGER closure_guard_profile BEFORE INSERT OR UPDATE ON public.user_profiles
FOR EACH ROW EXECUTE FUNCTION public.closure_guard_profile();

-- Reject new reservations for an already closed account, even for a stale session.
CREATE OR REPLACE FUNCTION public.closure_guard_reservation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id,4711));
  IF EXISTS(SELECT 1 FROM public.account_closures WHERE user_id=NEW.user_id) THEN
    RAISE EXCEPTION 'account_closed';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS closure_guard_jobs ON public.tryon_jobs;
CREATE TRIGGER closure_guard_jobs BEFORE INSERT ON public.tryon_jobs
FOR EACH ROW EXECUTE FUNCTION public.closure_guard_reservation();
DROP TRIGGER IF EXISTS closure_guard_checkout ON public.billing_checkout_attempts;
CREATE TRIGGER closure_guard_checkout BEFORE INSERT ON public.billing_checkout_attempts
FOR EACH ROW EXECUTE FUNCTION public.closure_guard_reservation();

CREATE OR REPLACE FUNCTION public.request_account_closure(p_user text) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE j record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user,4711));
  INSERT INTO public.account_closures(user_id) VALUES(p_user) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM public.account_closures WHERE user_id=p_user FOR UPDATE;
  INSERT INTO public.user_profiles(user_id,deleted_at) VALUES(p_user,now())
    ON CONFLICT(user_id) DO UPDATE SET deleted_at=COALESCE(public.user_profiles.deleted_at,now()),updated_at=now();
  -- These values originated in legacy clients. Inventory, never blindly delete a key/URL for a user.
  INSERT INTO public.account_closure_media(user_id,kind,locator)
    SELECT p_user,kind,locator FROM (
      SELECT 'garment-key' kind,storage_key locator FROM public.clothing_items WHERE user_id=p_user
      UNION ALL SELECT 'person-key',storage_key FROM public.person_images WHERE user_id=p_user
      UNION ALL SELECT 'result-key',result_storage_key FROM public.tryon_sessions WHERE user_id=p_user
      UNION ALL SELECT 'outfit-path',split_part(split_part(image_url,'?',1),'#',1) FROM public.user_outfits
        WHERE user_id=p_user AND image_url ~ '^https?://'
    ) assets WHERE NULLIF(locator,'') IS NOT NULL AND length(locator)<=2048
    ON CONFLICT DO NOTHING;
  -- An interrupted running job is refunded by the normal server-side settlement.
  FOR j IN SELECT id FROM public.tryon_jobs WHERE user_id=p_user AND state='running' ORDER BY id FOR UPDATE
  LOOP PERFORM public.tryon_settle(j.id,p_user,NULL); END LOOP;
  DELETE FROM public.tryon_jobs WHERE user_id=p_user;
  DELETE FROM public.user_outfits WHERE user_id=p_user;
  DELETE FROM public.tryon_sessions WHERE user_id=p_user;
  DELETE FROM public.person_images WHERE user_id=p_user;
  DELETE FROM public.clothing_items WHERE user_id=p_user;
  DELETE FROM public.affiliate_clicks WHERE user_id=p_user;
  -- Keep the minimal historical billing mapping + ledger for reconciliation and refunds.
END $$;
REVOKE ALL ON FUNCTION public.request_account_closure(text) FROM PUBLIC;
COMMIT;
