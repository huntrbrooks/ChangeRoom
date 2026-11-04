"""No Stripe requests. Optional integration tests own a new, disposable local DB.

Set CHANGEROOM_REFUND_TEST_DSN to a loopback crtest/refund_test admin database.
The suite creates and drops a uniquely named database, never reuses app data.
"""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
import importlib.util
import os
from pathlib import Path
import uuid

import pytest

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('reconcile_pack_refund', ROOT / 'scripts/ops/reconcile_pack_refund.py')
refund = importlib.util.module_from_spec(spec)
spec.loader.exec_module(refund)


@pytest.fixture
def payment():
    return {
        'id': 'pi_fixture', 'customer': 'cus_fixture', 'livemode': False,
        'status': 'succeeded', 'amount_received': 1499, 'currency': 'aud',
        'latest_charge': {
            'id': 'ch_fixture', 'customer': 'cus_fixture', 'livemode': False,
            'payment_intent': 'pi_fixture', 'paid': True, 'refunded': True,
            'amount': 1499, 'amount_refunded': 1499, 'currency': 'aud', 'disputed': False,
            'refunds': {'has_more': False, 'data': [
                {'id': 're_fixture', 'status': 'succeeded', 'charge': 'ch_fixture', 'amount': 1499, 'currency': 'aud'},
            ]},
        },
    }


def test_full_settled_refund_proof(payment):
    assert refund.verified_payment(payment, 'cus_fixture', False) == {
        'payment_intent': 'pi_fixture', 'charge': 'ch_fixture', 'refund_ids': ['re_fixture'],
        'refunded_cents': 1499, 'currency': 'aud',
    }


@pytest.mark.parametrize('path,value', [
    (('livemode',), True), (('customer',), 'cus_other'), (('status',), 'processing'),
    (('latest_charge',), 'ch_unexpanded'),
    (('latest_charge', 'livemode'), True), (('latest_charge', 'customer'), 'cus_other'),
    (('latest_charge', 'payment_intent'), 'pi_other'), (('latest_charge', 'disputed'), True),
    (('latest_charge', 'paid'), False), (('latest_charge', 'refunded'), False),
    (('latest_charge', 'amount_refunded'), 500), (('latest_charge', 'currency'), 'usd'),
    (('latest_charge', 'refunds', 'has_more'), True),
    (('latest_charge', 'refunds', 'data', 0, 'status'), 'pending'),
    (('latest_charge', 'refunds', 'data', 0, 'status'), 'failed'),
    (('latest_charge', 'refunds', 'data', 0, 'charge'), 'ch_other'),
    (('latest_charge', 'refunds', 'data', 0, 'amount'), 1498),
    (('latest_charge', 'refunds', 'data', 0, 'currency'), 'usd'),
])
def test_unsettled_partial_or_mismatched_provider_records_are_refused(payment, path, value):
    obj = payment
    for key in path[:-1]:
        obj = obj[key]
    obj[path[-1]] = value
    with pytest.raises(refund.Refused):
        refund.verified_payment(payment, 'cus_fixture', False)


def test_missing_recorded_customer_is_not_proof_of_ownership(payment):
    payment['customer'] = payment['latest_charge']['customer'] = None
    with pytest.raises(refund.Refused, match='customer is missing'):
        refund.verified_payment(payment, None, False)


def test_multiple_successful_refunds_may_total_one_full_refund(payment):
    first = payment['latest_charge']['refunds']['data'][0]
    second = {**first, 'id': 're_second', 'amount': 499}
    first['amount'] = 1000
    payment['latest_charge']['refunds']['data'].append(second)
    assert refund.verified_payment(payment, 'cus_fixture', False)['refunded_cents'] == 1499


@pytest.fixture(scope='session')
def local_database():
    dsn = os.environ.get('CHANGEROOM_REFUND_TEST_DSN')
    if not dsn:
        pytest.skip('Set CHANGEROOM_REFUND_TEST_DSN for isolated local PostgreSQL coverage')
    psycopg = pytest.importorskip('psycopg')
    from psycopg.conninfo import conninfo_to_dict, make_conninfo
    from psycopg import sql
    params = conninfo_to_dict(dsn)
    assert params.get('host') == '127.0.0.1' and params.get('hostaddr', '127.0.0.1') == '127.0.0.1'
    assert params.get('dbname') == 'refund_test' and params.get('user') == 'crtest'
    database = 'refund_fixture_' + uuid.uuid4().hex
    with psycopg.connect(dsn, autocommit=True, connect_timeout=3) as admin:
        assert admin.execute("SELECT current_database()='refund_test' AND current_user='crtest' AND inet_server_addr()='127.0.0.1'::inet").fetchone()[0]
        admin.execute(sql.SQL("CREATE DATABASE {} ENCODING 'UTF8' TEMPLATE template0").format(sql.Identifier(database)))
        fixture_dsn = make_conninfo(dsn, dbname=database)
        try:
            with psycopg.connect(fixture_dsn, autocommit=True) as conn:
                for name in ('schema.sql', 'migration_tryon_jobs.sql'):
                    conn.execute((ROOT / 'database' / name).read_text())
            yield fixture_dsn
        finally:
            admin.execute(sql.SQL('DROP DATABASE {}').format(sql.Identifier(database)))


@pytest.fixture
def db(local_database):
    import psycopg
    from psycopg.types.json import Jsonb
    with psycopg.connect(local_database, autocommit=True) as conn:
        conn.execute('TRUNCATE tryon_jobs, credit_ledger_entries, credit_holds, users_billing')
        conn.execute("INSERT INTO users_billing (user_id,stripe_customer_id,credits_available,trials_remaining) VALUES ('user_fixture','cus_fixture',10,0)")
        conn.execute("INSERT INTO credit_ledger_entries (user_id,request_id,entry_type,credits_change,balance_after,metadata) VALUES ('user_fixture','pi_fixture','grant',10,10,%s)",
                     (Jsonb({'source': 'stripe', 'reason': 'credit_pack_purchase', 'payment_intent_id': 'pi_fixture', 'price_id': 'price_fixture', 'session_id': 'cs_fixture'}),))
        yield conn


def state(conn):
    return {
        'wallets': conn.execute('SELECT user_id,credits_available,updated_at FROM users_billing ORDER BY user_id').fetchall(),
        'ledger': conn.execute('SELECT user_id,request_id,entry_type,credits_change,balance_after,metadata FROM credit_ledger_entries ORDER BY request_id,entry_type').fetchall(),
    }


def dry_run(conn, payment, credits=10, case='CASE_TEST'):
    return refund.reconcile(conn, payment, credits, case, False)


def test_pg_dry_run_and_wrong_hash_do_not_mutate(db, payment):
    before = state(db)
    plan = dry_run(db, payment)
    assert plan['status'] == 'dry_run' and plan['balance_after'] == 0
    assert state(db) == before
    with pytest.raises(refund.Refused, match='hash is wrong'):
        refund.reconcile(db, payment, 10, 'CASE_TEST', False, 'wrong')
    assert state(db) == before


def test_pg_apply_commits_once_and_preserves_original_grant(db, payment, local_database):
    import psycopg
    original = state(db)['ledger'][0]
    plan = dry_run(db, payment)
    applied = refund.reconcile(db, payment, 10, 'CASE_TEST', False, plan['plan_sha256'])
    assert applied['status'] == 'reconciled' and applied['balance'] == 0
    # A separate connection observes the actual commit, not only an outer test transaction.
    with psycopg.connect(local_database, autocommit=True) as observer:
        committed = state(observer)
    assert original in committed['ledger'] and len(committed['ledger']) == 2
    assert db.execute('SELECT sum(credits_change) FROM credit_ledger_entries').fetchone()[0] == 0
    assert refund.reconcile(db, payment, 10, 'CASE_TEST', False, plan['plan_sha256'])['status'] == 'already_reconciled'
    assert state(db) == committed
    for credits, case in ((9, 'CASE_TEST'), (10, 'CASE_DIFFERENT')):
        with pytest.raises(refund.Refused, match='different instructions'):
            refund.reconcile(db, payment, credits, case, False, plan['plan_sha256'])
    assert state(db) == committed


@pytest.mark.parametrize('mutation,reason', [
    ("DELETE FROM credit_ledger_entries", 'Exactly one original'),
    ("UPDATE credit_ledger_entries SET metadata=metadata || '{\"reason\":\"subscription\"}'", 'not a verified Stripe pack'),
    ("UPDATE credit_ledger_entries SET metadata=metadata || '{\"source\":\"manual\"}'", 'not a verified Stripe pack'),
    ("UPDATE credit_ledger_entries SET metadata=metadata || '{\"payment_intent_id\":\"pi_other\"}'", 'not a verified Stripe pack'),
    ("UPDATE credit_ledger_entries SET user_id='user_missing'", 'wallet is missing'),
    ("UPDATE users_billing SET stripe_customer_id='cus_other'", 'recorded customer'),
    ("INSERT INTO users_billing (user_id,stripe_customer_id,credits_available) VALUES ('user_other','cus_other',10); UPDATE credit_ledger_entries SET user_id='user_other'", 'recorded customer'),
])
def test_pg_grant_and_customer_mismatch_do_not_mutate(db, payment, mutation, reason):
    db.execute(mutation)
    before = state(db)
    with pytest.raises(refund.Refused, match=reason):
        dry_run(db, payment)
    assert state(db) == before


@pytest.mark.parametrize('field,value', [('refunded', False), ('amount_refunded', 500), ('paid', False), ('disputed', True)])
def test_pg_provider_refusal_never_changes_wallet(db, payment, field, value):
    payment['latest_charge'][field] = value
    before = state(db)
    with pytest.raises(refund.Refused):
        refund.reconcile(db, payment, 10, 'CASE_TEST', False, 'arbitrary')
    assert state(db) == before


def test_pg_consumed_credits_require_explicit_affordable_choice(db, payment):
    db.execute("UPDATE users_billing SET credits_available=7; INSERT INTO credit_ledger_entries (user_id,request_id,entry_type,credits_change,balance_after) VALUES ('user_fixture','spent_fixture','hold',-3,7)")
    before = state(db)
    with pytest.raises(refund.Refused, match='Insufficient available'):
        dry_run(db, payment, 10)
    assert state(db) == before
    # Do not guess a partial decision from current balance: the operator selects seven.
    plan = dry_run(db, payment, 7)
    assert plan['credits_to_revoke'] == 7 and plan['unrevoked_grant_credits'] == 3
    refund.reconcile(db, payment, 7, 'CASE_TEST', False, plan['plan_sha256'])
    assert db.execute('SELECT credits_available FROM users_billing').fetchone()[0] == 0
    assert db.execute('SELECT sum(credits_change) FROM credit_ledger_entries').fetchone()[0] == 0


@pytest.mark.parametrize('credits', [-1, True, 11])
def test_pg_invalid_or_excess_revocation_is_refused(db, payment, credits):
    before = state(db)
    with pytest.raises(refund.Refused):
        dry_run(db, payment, credits)
    assert state(db) == before


def test_pg_running_job_blocks_until_real_settlement(db, payment):
    job = db.execute("INSERT INTO tryon_jobs (user_id,trial_eligible,privileged) VALUES ('user_fixture',false,false) RETURNING id").fetchone()[0]
    assert db.execute('SELECT tryon_claim(%s,%s)', (job, 'user_fixture')).fetchone()[0] == 'credits'
    before = state(db)
    with pytest.raises(refund.Refused, match='in-flight jobs'):
        dry_run(db, payment, 9)
    assert state(db) == before
    assert db.execute('SELECT tryon_settle(%s,%s,NULL)', (job, 'user_fixture')).fetchone()[0] is True
    assert dry_run(db, payment, 10)['balance_after'] == 0


def test_pg_active_legacy_hold_blocks_until_released(db, payment):
    db.execute("INSERT INTO credit_holds (user_id,request_id,amount,status) VALUES ('user_fixture','hold_fixture',1,'active')")
    before = state(db)
    with pytest.raises(refund.Refused, match='active credit holds'):
        dry_run(db, payment)
    assert state(db) == before
    db.execute("UPDATE credit_holds SET status='released'")
    assert dry_run(db, payment)['status'] == 'dry_run'


def test_pg_balance_change_invalidates_reviewed_hash(db, payment):
    plan = dry_run(db, payment, 5)
    db.execute('UPDATE users_billing SET credits_available=9')
    before = state(db)
    with pytest.raises(refund.Refused, match='Plan changed'):
        refund.reconcile(db, payment, 5, 'CASE_TEST', False, plan['plan_sha256'])
    assert state(db) == before


def test_pg_ledger_failure_rolls_back_wallet_update(db, payment):
    import psycopg
    plan = dry_run(db, payment)
    before = state(db)
    db.execute("ALTER TABLE credit_ledger_entries ADD CONSTRAINT test_reject_adjustment CHECK (entry_type <> 'adjustment')")
    try:
        with pytest.raises(psycopg.errors.CheckViolation):
            refund.reconcile(db, payment, 10, 'CASE_TEST', False, plan['plan_sha256'])
        assert state(db) == before
    finally:
        db.execute('ALTER TABLE credit_ledger_entries DROP CONSTRAINT test_reject_adjustment')


def test_pg_concurrent_apply_commits_one_adjustment(db, payment, local_database):
    import psycopg
    plan = dry_run(db, payment)
    def apply():
        with psycopg.connect(local_database, autocommit=True) as conn:
            return refund.reconcile(conn, deepcopy(payment), 10, 'CASE_TEST', False, plan['plan_sha256'])['status']
    with ThreadPoolExecutor(max_workers=2) as executor:
        statuses = list(executor.map(lambda _: apply(), range(2)))
    assert sorted(statuses) == ['already_reconciled', 'reconciled']
    assert db.execute('SELECT credits_available FROM users_billing').fetchone()[0] == 0
    assert db.execute("SELECT count(*) FROM credit_ledger_entries WHERE entry_type='adjustment'").fetchone()[0] == 1
