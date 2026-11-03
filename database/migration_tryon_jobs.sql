-- Apply as the Vercel database owner after schema.sql and migration_add_credits_ledger.sql.
BEGIN;
CREATE TABLE IF NOT EXISTS public.tryon_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES public.users_billing(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  state text NOT NULL DEFAULT 'issued' CHECK (state IN ('issued','running','succeeded','failed')),
  trial_eligible boolean NOT NULL,
  privileged boolean NOT NULL,
  funding text CHECK (funding IN ('trial','credits','privileged')),
  result_bytes bytea CHECK (octet_length(result_bytes) <= 2500000)
);
ALTER TABLE public.tryon_jobs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS tryon_jobs_user_created ON public.tryon_jobs(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS tryon_jobs_state_updated ON public.tryon_jobs(state,updated_at);
REVOKE ALL ON public.tryon_jobs FROM PUBLIC;

ALTER TABLE public.tryon_jobs ADD COLUMN IF NOT EXISTS identified boolean NOT NULL DEFAULT false;
ALTER TABLE public.tryon_jobs ADD COLUMN IF NOT EXISTS shopped boolean NOT NULL DEFAULT false;
-- A successful try-on includes at most one identification and shopping request.
CREATE OR REPLACE FUNCTION public.tryon_extra(p_job uuid,p_user text,p_kind text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  UPDATE public.tryon_jobs SET identified=identified OR p_kind='identify',shopped=shopped OR p_kind='shop'
    WHERE id=p_job AND user_id=p_user AND state='succeeded' AND updated_at>now()-interval '15 minutes'
    AND ((p_kind='identify' AND NOT identified) OR (p_kind='shop' AND NOT shopped));
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.tryon_extra(uuid,text,text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.tryon_claim(p_job uuid,p_user text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE j public.tryon_jobs%ROWTYPE; b public.users_billing%ROWTYPE; fund text;
BEGIN
  SELECT * INTO j FROM public.tryon_jobs WHERE id=p_job AND user_id=p_user FOR UPDATE;
  IF NOT FOUND OR j.state <> 'issued' OR j.created_at < now()-interval '5 minutes' THEN RETURN 'denied'; END IF;
  SELECT * INTO b FROM public.users_billing WHERE user_id=p_user FOR UPDATE;
  IF NOT FOUND OR b.is_frozen THEN RETURN 'frozen'; END IF;
  IF j.privileged THEN fund := 'privileged';
  ELSIF j.trial_eligible THEN
    -- Never switch a quoted free preview to paid credits if the last trial raced.
    IF b.trials_remaining<=0 THEN RETURN 'trial_unavailable'; END IF;
    fund := 'trial';
    UPDATE public.users_billing SET trials_remaining=trials_remaining-1,updated_at=now() WHERE user_id=p_user;
  ELSIF b.credits_available>0 THEN
    fund := 'credits';
    UPDATE public.users_billing SET credits_available=credits_available-1,updated_at=now() WHERE user_id=p_user;
    INSERT INTO public.credit_ledger_entries(id,user_id,request_id,entry_type,credits_change,balance_after,metadata)
      VALUES(gen_random_uuid(),p_user,p_job::text,'hold',-1,b.credits_available-1,'{"reason":"tryon_job"}');
  ELSE RETURN 'no_credits'; END IF;
  UPDATE public.tryon_jobs SET state='running',funding=fund,updated_at=now() WHERE id=p_job;
  RETURN fund;
END $$;

-- Only Render can settle a running job; success and private image persistence commit together.
-- Repeating the same outcome is safe after a lost DB acknowledgement.
CREATE OR REPLACE FUNCTION public.tryon_settle(p_job uuid,p_user text,p_bytes bytea)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE j public.tryon_jobs%ROWTYPE; next_state text; balance integer;
BEGIN
  next_state := CASE WHEN p_bytes IS NULL THEN 'failed' ELSE 'succeeded' END;
  SELECT * INTO j FROM public.tryon_jobs WHERE id=p_job AND user_id=p_user FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF j.state = next_state THEN RETURN true; END IF;
  IF j.state <> 'running' THEN RETURN false; END IF;
  IF p_bytes IS NOT NULL AND (octet_length(p_bytes)=0 OR octet_length(p_bytes)>2500000) THEN RETURN false; END IF;
  IF j.funding='trial' AND p_bytes IS NULL THEN
    UPDATE public.users_billing SET trials_remaining=trials_remaining+1,updated_at=now() WHERE user_id=p_user;
  ELSIF j.funding='credits' THEN
    UPDATE public.users_billing SET credits_available=credits_available+CASE WHEN p_bytes IS NULL THEN 1 ELSE 0 END,updated_at=now()
      WHERE user_id=p_user RETURNING credits_available INTO balance;
    INSERT INTO public.credit_ledger_entries(id,user_id,request_id,entry_type,credits_change,balance_after,metadata)
      VALUES(gen_random_uuid(),p_user,p_job::text,CASE WHEN p_bytes IS NULL THEN 'release' ELSE 'debit' END,
             CASE WHEN p_bytes IS NULL THEN 1 ELSE 0 END,balance,'{"reason":"tryon_job"}');
  END IF;
  UPDATE public.tryon_jobs SET state=next_state,result_bytes=p_bytes,updated_at=now() WHERE id=p_job;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.tryon_sweep()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE j record;
BEGIN
  FOR j IN SELECT id,user_id FROM public.tryon_jobs WHERE state='running' AND updated_at<now()-interval '15 minutes'
    ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED
  LOOP PERFORM public.tryon_settle(j.id,j.user_id,NULL); END LOOP;
  UPDATE public.tryon_jobs SET result_bytes=NULL WHERE id IN (
    SELECT id FROM public.tryon_jobs WHERE result_bytes IS NOT NULL AND updated_at<now()-interval '24 hours' LIMIT 100);
  DELETE FROM public.tryon_jobs WHERE id IN (
    SELECT id FROM public.tryon_jobs WHERE state<>'running' AND created_at<now()-interval '30 days' LIMIT 500);
END $$;
REVOKE ALL ON FUNCTION public.tryon_claim(uuid,text), public.tryon_settle(uuid,text,bytea), public.tryon_sweep() FROM PUBLIC;
COMMIT;
