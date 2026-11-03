"""Synthetic recovery only. Owns an empty fixture set on loopback/recovery_test.

No URL accepted. Uses checked-in SQL and synthetic PNG bytes; no production keys,
backups, or network storage. Reports what was and was not restored.
"""
import argparse
import base64
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--port', type=int, required=True)
parser.add_argument('--migrations', type=Path, default=ROOT/'database', help='Candidate migration directory when testing an unmerged branch')
args = parser.parse_args()
if not 1 <= args.port <= 65535:
    raise SystemExit('Invalid loopback port')
env = {k:v for k,v in os.environ.items() if not k.startswith('PG')}
env.update(PGHOST='127.0.0.1', PGPORT=str(args.port), PGDATABASE='recovery_test', PGUSER='crtest', PGCONNECT_TIMEOUT='3')
if 'PGPASSWORD' in os.environ:
    env['PGPASSWORD'] = os.environ['PGPASSWORD']  # disposable local CI only

def cmd(argv, sql_text=None):
    p = subprocess.run(argv, env=env, input=sql_text, text=True, capture_output=True, check=False)
    if p.returncode:
        raise RuntimeError(f'{argv[0]} failed: {p.stderr.strip()[:400]}')
    return p.stdout.strip()

def sql(s):
    return cmd(['psql','-XAtq','-v','ON_ERROR_STOP=1'],s)

def require(condition, reason):
    if not condition: raise RuntimeError(reason)

TABLES=('users_billing','credit_ledger_entries','tryon_jobs','person_images')
COUNT_SQL='SELECT '+ ' + '.join(f'(SELECT count(*) FROM public.{t})' for t in TABLES)
PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGMMSFnAwMDAxAAGAA/KAVgj5iRsAAAAAElFTkSuQmCC')
u='drill_synthetic_owner';job='0e7fe4c1-d24f-4f00-9710-28e4dae3a170';stale='5d26ffc4-2848-49af-b1bd-c5af422b53ec';objkey='person/user_drill_synthetic_owner/fixture.png'
require(sql("SELECT current_database()='recovery_test' AND current_user='crtest' AND inet_server_addr()='127.0.0.1'::inet")=='t','Wrong target')
# Refuse non-fixture rows BEFORE using, seeding or restoring into the database.
for t in TABLES:
    if sql(f"SELECT to_regclass('public.{t}') IS NOT NULL")=='t':
        require(sql(f'SELECT count(*) FROM public.{t}')=='0','Disposable drill tables must be empty: '+t)
for name in ('schema.sql','migration_add_clothing_item_offers.sql','migration_add_user_outfits.sql','migration_subscriber_billing_v2.sql','migration_tryon_jobs.sql','migration_account_closure.sql'):
    cmd(['psql','-Xq','-v','ON_ERROR_STOP=1','-f',str(args.migrations / name)])
cmd(['psql','-Xq','-v','ON_ERROR_STOP=1','-f',str(ROOT/'database/migration_tryon_ops.sql')])
require(sql(COUNT_SQL)=='0','Nonempty fixture tables')
# Only on the synthetic DB: verify closure data isolation/duplicate handling, then prove the
# operator sees actionable aggregate counts when an external cleanup or payment closure stalls.
cmd(['psql','-Xq','-v','ON_ERROR_STOP=1','-f',str(ROOT/'database/tests/account-closure.sql')])
require(sql('SELECT * FROM public.closure_ops_counts()')=='0|0|0','Disposable closure queue must be empty')
observed=sql("""BEGIN;
  INSERT INTO public.account_closures (user_id,billing_state,requested_at,external_cleanup_at) VALUES
  ('drill_ops_review','review',now(),now()),('drill_ops_pending','pending',now()-interval '31 minutes',now()),
  ('drill_ops_erase','resolved',now()-interval '25 hours',NULL);
  SELECT * FROM public.closure_ops_counts(); ROLLBACK;""")
require(observed=='1|1|1','Closure queue alarms did not distinguish manual review, late billing and overdue erasure')
start=time.monotonic()
with tempfile.TemporaryDirectory(prefix='changeroom-synthetic-restore-') as scratch:
    tmp=Path(scratch);live=tmp/'local-object-store'/objkey;live.parent.mkdir(parents=True);live.write_bytes(PNG)
    sql(f"""BEGIN;
      INSERT INTO users_billing (user_id,credits_available,trials_remaining) VALUES ('{u}',2,0);
      INSERT INTO credit_ledger_entries (id,user_id,request_id,entry_type,credits_change,balance_after) VALUES(gen_random_uuid(),'{u}','drill_fake_receipt','grant',2,2);
      INSERT INTO person_images (user_id,storage_key,public_url,mime_type) VALUES ('{u}','{objkey}','https://example.invalid/synthetic','image/png');
      INSERT INTO tryon_jobs (id,user_id,trial_eligible,privileged) VALUES ('{job}','{u}',false,false);
      COMMIT;""")
    require(sql(f"SELECT public.tryon_claim('{job}','{u}')")=='credits','Reservation failed')
    require(sql(f"SELECT public.tryon_settle('{job}','{u}',decode('{PNG.hex()}','hex'))")=='t','Generation fixture settlement failed')
    sql(f"INSERT INTO tryon_jobs (id,user_id,trial_eligible,privileged) VALUES ('{stale}','{u}',false,false)")
    require(sql(f"SELECT public.tryon_claim('{stale}','{u}')")=='credits','Stale reservation fixture failed')
    sql(f"UPDATE tryon_jobs SET updated_at=now()-interval '30 minutes' WHERE id='{stale}'; SELECT public.tryon_sweep(); SELECT public.tryon_sweep();")
    def snapshot():
        return sql(f"""SELECT credits_available,trials_remaining FROM users_billing WHERE user_id='{u}';
        SELECT entry_type,credits_change,balance_after FROM credit_ledger_entries WHERE user_id='{u}' ORDER BY entry_type,request_id;
        SELECT state,coalesce(encode(result_bytes,'hex'),'') FROM tryon_jobs WHERE user_id='{u}' ORDER BY id;
        SELECT storage_key FROM person_images WHERE user_id='{u}';""")
    expected=snapshot();require(sql(f"SELECT credits_available FROM users_billing WHERE user_id='{u}'")=='1','Wrong post-refund balance')
    require(sql(f"SELECT sum(credits_change) FROM credit_ledger_entries WHERE user_id='{u}'")=='1','Ledger diverged from balance')
    require(sql(f"SELECT count(*) FROM credit_ledger_entries WHERE user_id='{u}' AND entry_type='release'")=='1','Refund replay applied twice')
    require(sql('SELECT * FROM public.tryon_ops_counts()')=='0|0|0|1|1','Monitor did not report expected aggregates')
    archive=tmp/'fixture.dump'; backup_object=tmp/'object-backup.png'
    cmd(['pg_dump','-Fc','--no-owner','--no-acl','--file',str(archive),*[f'--table=public.{t}' for t in TABLES]])
    shutil.copyfile(live,backup_object)
    def clear_fixtures():
        sql('BEGIN;'+''.join(f"DELETE FROM public.{t} WHERE user_id='{u}';" for t in ('credit_ledger_entries','tryon_jobs','person_images','users_billing'))+'COMMIT;')
    clear_fixtures();live.unlink();require(sql(COUNT_SQL)=='0','Simulated loss did not clear fixtures')
    # A data-only restore does not recreate constraints; a live FK therefore requires parent rows first.
    toc=cmd(['pg_restore','--list',str(archive)]).splitlines(); order=tmp/'data.list'
    entries=[line for t in TABLES for line in toc if f' TABLE DATA public {t} ' in line]
    require(len(entries)==len(TABLES),'Expected exactly four fixture table data entries')
    order.write_text('\n'.join(entries)+'\n')
    t0=time.monotonic();cmd(['pg_restore','--data-only','--use-list',str(order),'--no-owner','--no-acl','--exit-on-error','--single-transaction','-d','recovery_test',str(archive)])
    shutil.copyfile(backup_object,live)
    require(snapshot()==expected,'Restored entitlement, ledger, result or media pointer differs')
    require(hashlib.sha256(live.read_bytes()).digest()==hashlib.sha256(PNG).digest(),'Restored external-media fixture differs')
    restored=time.monotonic()-t0
    sql(f"UPDATE tryon_jobs SET updated_at=now()-interval '26 hours' WHERE id='{job}'; SELECT public.tryon_sweep();")
    require(sql(f"SELECT state='succeeded' AND result_bytes IS NULL FROM tryon_jobs WHERE id='{job}'")=='t','Expired result bytes retained')
    clear_fixtures();require(sql(COUNT_SQL)=='0','Fixture cleanup failed')
    print(f'PASS: Postgres {sql("SHOW server_version").split()[0]}; 1 synthetic owner, balance 1, 5 ledger rows, 2 jobs, and 1 object pointer; media and result bytes match. Stale job refunded once; expired result cleared. Restore+integrity check {restored:.2f}s; fixture drill {time.monotonic()-start:.2f}s. No live backup, R2 or Stripe exercised.')
