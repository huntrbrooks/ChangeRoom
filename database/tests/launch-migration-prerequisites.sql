-- Run only against an isolated restored branch after the launch migrations.
-- A subtransaction rolls back synthetic data; never use this as a live smoke test.
DO $$
DECLARE fixture text := 'migration-rehearsal-' || gen_random_uuid()::text;
BEGIN
  BEGIN
  INSERT INTO public.users_billing(user_id,credits_available,trials_remaining)
    VALUES(fixture,3,1);
  INSERT INTO public.user_profiles(user_id,email,first_name)
    VALUES(fixture,'synthetic@example.invalid','Synthetic');
  INSERT INTO public.affiliate_clicks(id,user_id,clicked_url)
    VALUES(gen_random_uuid(),fixture,'https://example.invalid/synthetic');
  PERFORM public.request_account_closure(fixture);
  IF NOT EXISTS (SELECT 1 FROM public.account_closures WHERE user_id=fixture)
     OR EXISTS (SELECT 1 FROM public.affiliate_clicks WHERE user_id=fixture)
     OR EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id=fixture
                AND (email IS NOT NULL OR first_name IS NOT NULL OR deleted_at IS NULL))
     OR NOT EXISTS (SELECT 1 FROM public.users_billing WHERE user_id=fixture AND credits_available=3)
  THEN
    RAISE EXCEPTION 'account closure migration prerequisite test failed';
  END IF;
  -- Roll back only the successful fixture. An actual assertion/error propagates.
  RAISE EXCEPTION USING ERRCODE='ZC001',MESSAGE='synthetic fixture passed';
  EXCEPTION WHEN SQLSTATE 'ZC001' THEN NULL;
  END;
END $$;
