-- After migration_tryon_jobs.sql and migration_account_closure.sql, as the job table/function owner. No images or identifiers leave the DB.
BEGIN;
CREATE OR REPLACE FUNCTION public.tryon_ops_counts()
RETURNS TABLE(stale_running bigint, old_images bigint, stale_history bigint, recent_failed bigint, recent_success bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT count(*) FILTER (WHERE state='running' AND updated_at<now()-interval '20 minutes'),
         count(*) FILTER (WHERE result_bytes IS NOT NULL AND updated_at<now()-interval '25 hours'),
         count(*) FILTER (WHERE state<>'running' AND created_at<now()-interval '31 days'),
         count(*) FILTER (WHERE state='failed' AND updated_at>now()-interval '30 minutes'),
         count(*) FILTER (WHERE state='succeeded' AND updated_at>now()-interval '30 minutes')
  FROM public.tryon_jobs;
$$;
REVOKE ALL ON FUNCTION public.tryon_ops_counts() FROM PUBLIC;
-- This monitor must never see which customers requested closure, their media, or invoices.
CREATE OR REPLACE FUNCTION public.closure_ops_counts()
RETURNS TABLE(billing_manual_review bigint, billing_overdue bigint, cleanup_overdue bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT count(*) FILTER (WHERE billing_state='review'),
         count(*) FILTER (WHERE billing_state='pending' AND requested_at<now()-interval '30 minutes'),
         count(*) FILTER (WHERE external_cleanup_at IS NULL AND requested_at<now()-interval '24 hours')
  FROM public.account_closures;
$$;
REVOKE ALL ON FUNCTION public.closure_ops_counts() FROM PUBLIC;
COMMIT;
