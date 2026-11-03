-- Run against a dedicated empty test database with all launch migrations; never against production.
BEGIN;
INSERT INTO users_billing(user_id,credits_available) VALUES('closure-fixture-A',5),('closure-fixture-B',1);
INSERT INTO user_profiles(user_id,email) VALUES('closure-fixture-A','fixture@example.invalid'),('closure-fixture-B','other@example.invalid');
INSERT INTO person_images(id,user_id,storage_key,public_url) VALUES(gen_random_uuid(),'closure-fixture-A','fixture/a','https://example.invalid/a');
INSERT INTO tryon_jobs(id,user_id,trial_eligible,privileged) VALUES('e046601a-810f-4669-905a-0bca7ca25b24','closure-fixture-A',false,false);
SELECT tryon_claim('e046601a-810f-4669-905a-0bca7ca25b24','closure-fixture-A');
SELECT request_account_closure('closure-fixture-A');
SELECT request_account_closure('closure-fixture-A');
UPDATE user_profiles SET email='late@example.invalid',deleted_at=NULL WHERE user_id='closure-fixture-A';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE user_id='closure-fixture-A' AND email IS NULL AND deleted_at IS NOT NULL) OR
     NOT EXISTS (SELECT 1 FROM users_billing WHERE user_id='closure-fixture-A' AND credits_available=5) OR
     NOT EXISTS (SELECT 1 FROM user_profiles WHERE user_id='closure-fixture-B' AND email='other@example.invalid') OR
     NOT EXISTS (SELECT 1 FROM account_closure_media WHERE user_id='closure-fixture-A' AND locator='fixture/a') OR
     EXISTS (SELECT 1 FROM tryon_jobs WHERE user_id='closure-fixture-A') OR
     EXISTS (SELECT 1 FROM person_images WHERE user_id='closure-fixture-A') THEN RAISE EXCEPTION 'closure invariants failed'; END IF;
  BEGIN
    INSERT INTO tryon_jobs(user_id,trial_eligible,privileged) VALUES('closure-fixture-A',true,false);
    RAISE EXCEPTION 'closed account issued a reservation';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'account_closed' THEN RAISE; END IF; END;
END $$;
ROLLBACK;
