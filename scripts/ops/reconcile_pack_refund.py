"""Reconcile an already-refunded pack. Read-only unless its exact plan is approved.

Does not refund money, call a model, send mail, or operate on subscriptions.
Credentials come from STRIPE_SECRET_KEY and CHANGEROOM_RECONCILE_DSN only.
"""
import argparse
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.request
from urllib.parse import urlsplit


class Refused(Exception):
    pass


def require(ok, reason):
    if not ok:
        raise Refused(reason)


def verified_payment(payment, customer, live):
    charge = payment.get('latest_charge')
    require(isinstance(customer, str) and customer.startswith('cus_'), 'Recorded Stripe customer is missing')
    require(payment.get('livemode') is live, 'Stripe mode does not match requested environment')
    require(payment.get('customer') == customer, 'Payment does not belong to the recorded customer')
    require(payment.get('status') == 'succeeded', 'Payment was not settled')
    require(isinstance(charge, dict), 'Expanded charge is required')
    require(charge.get('livemode') is live and charge.get('payment_intent') == payment['id'], 'Charge identity mismatch')
    require(charge.get('customer') == customer and not charge.get('disputed'), 'Customer mismatch or disputed charge needs manual review')
    require(charge.get('paid') is True and charge.get('refunded') is True, 'Only a completed full refund can be reconciled')
    amount = payment.get('amount_received', 0)
    require(type(amount) is int and amount > 0 and charge.get('amount') == amount and charge.get('amount_refunded') == amount, 'Partial or unsettled refund needs manual review')
    require(payment.get('currency') and charge.get('currency') == payment['currency'], 'Payment and charge currency mismatch')
    refunds = charge.get('refunds', {})
    require(refunds.get('has_more') is False, 'Refund list is incomplete')
    items = refunds.get('data', [])
    require(bool(items) and all(r.get('status') == 'succeeded' and r.get('charge') == charge['id'] and r.get('currency') == payment['currency'] and type(r.get('amount')) is int and r['amount'] > 0 for r in items), 'Refunds are not all settled on this charge')
    require(sum(r.get('amount', 0) for r in items) == amount, 'Refund totals do not match the captured payment')
    return {'payment_intent': payment['id'], 'charge': charge['id'], 'refund_ids': sorted(r['id'] for r in items),
            'refunded_cents': amount, 'currency': payment['currency']}


def stripe_payment(key, payment_id):
    url = 'https://api.stripe.com/v1/payment_intents/' + payment_id + '?expand%5B%5D=latest_charge.refunds'
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={'Authorization': 'Bearer ' + key}), timeout=15) as res:
            return json.load(res)
    except (OSError, ValueError):
        raise Refused('Stripe read failed; no database change was made') from None


def plan_digest(plan):
    return hashlib.sha256(json.dumps(plan, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def reconcile(conn, payment, credits, reference, live, approve=None):
    """Wallet lock serializes refunds with job claims and all normal credit grants."""
    from psycopg.types.json import Jsonb
    require(type(credits) is int and credits >= 0, 'Revoked credit count must be a nonnegative integer')
    require(bool(re.fullmatch(r'[A-Za-z0-9_-]{3,80}', reference)), 'Use a nonpersonal case reference (letters, numbers, underscore, dash)')
    request_id = 'pack-refund:' + payment['id']
    with conn.transaction():
        grants = conn.execute("SELECT user_id, credits_change, metadata FROM credit_ledger_entries WHERE request_id=%s AND entry_type='grant'", (payment['id'],)).fetchall()
        require(len(grants) == 1, 'Exactly one original pack grant must exist')
        user_id, granted, metadata = grants[0]
        require(granted > 0 and metadata.get('source') == 'stripe' and metadata.get('reason') == 'credit_pack_purchase' and metadata.get('payment_intent_id') == payment['id'], 'Grant is not a verified Stripe pack')
        wallet = conn.execute('SELECT credits_available, stripe_customer_id FROM users_billing WHERE user_id=%s FOR UPDATE', (user_id,)).fetchone()
        require(wallet is not None, 'Recorded wallet is missing')
        balance, customer = wallet
        proof = verified_payment(payment, customer, live)
        require(credits <= granted, 'Cannot revoke more than the original pack grant')
        existing = conn.execute("SELECT user_id, credits_change, metadata FROM credit_ledger_entries WHERE request_id=%s AND entry_type='adjustment'", (request_id,)).fetchone()
        if existing:
            require(existing[0] == user_id and existing[1] == -credits and existing[2].get('reason') == 'stripe_pack_refund' and existing[2].get('case_reference') == reference, 'Existing reconciliation has different instructions; do not overwrite it')
            return {'status': 'already_reconciled', 'credits_revoked': credits, 'balance': balance}
        require(credits <= balance, 'Insufficient available credits; review consumed credits before choosing the revocation')
        running = conn.execute("SELECT count(*) FROM tryon_jobs WHERE user_id=%s AND state='running'", (user_id,)).fetchone()[0]
        require(running == 0, 'Wait for in-flight jobs to settle before reconciling')
        holds = conn.execute("SELECT count(*) FROM credit_holds WHERE user_id=%s AND status='active'", (user_id,)).fetchone()[0]
        require(holds == 0, 'Wait for active credit holds to settle before reconciling')
        plan = {**proof, 'user_hash': hashlib.sha256(user_id.encode()).hexdigest(), 'environment': 'live' if live else 'test',
                'granted_credits': granted, 'credits_to_revoke': credits, 'unrevoked_grant_credits': granted - credits, 'balance_before': balance,
                'balance_after': balance - credits, 'case_reference': reference}
        digest = plan_digest(plan)
        if approve is None:
            return {'status': 'dry_run', 'plan_sha256': digest, **plan}
        require(approve == digest, 'Plan changed or approval hash is wrong; rerun dry-run and review')
        conn.execute('UPDATE users_billing SET credits_available=%s, updated_at=now() WHERE user_id=%s', (balance - credits, user_id))
        conn.execute("INSERT INTO credit_ledger_entries (id,user_id,request_id,entry_type,credits_change,balance_after,metadata) VALUES (gen_random_uuid(),%s,%s,'adjustment',%s,%s,%s)",
                     (user_id, request_id, -credits, balance - credits, Jsonb({**proof, 'reason': 'stripe_pack_refund', 'case_reference': reference, 'plan_sha256': digest})))
        return {'status': 'reconciled', 'credits_revoked': credits, 'balance': balance - credits, 'plan_sha256': digest}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--payment-intent', required=True)
    parser.add_argument('--revoke-credits', required=True, type=int)
    parser.add_argument('--case', required=True, dest='reference')
    parser.add_argument('--expected-db-host', required=True)
    parser.add_argument('--live', action='store_true', help='Explicitly target live Stripe; still dry-run unless --apply-plan is set')
    parser.add_argument('--apply-plan', help='Exact SHA-256 printed by the reviewed dry-run')
    args = parser.parse_args()
    require(bool(re.fullmatch(r'pi_[A-Za-z0-9]+', args.payment_intent)), 'Invalid payment intent ID')
    key = os.environ.get('STRIPE_SECRET_KEY', '')
    require(key.startswith('sk_live_' if args.live else 'sk_test_'), 'Stripe key mode does not match --live')
    dsn = os.environ.get('CHANGEROOM_RECONCILE_DSN', '')
    uri = urlsplit(dsn)
    require(uri.scheme in ('postgres', 'postgresql') and uri.hostname == args.expected_db_host and uri.username and uri.path.strip('/'), 'Database does not match the explicitly pinned host')
    require(bool(args.expected_db_host) and uri.hostname not in ('localhost', '127.0.0.1', '::1'), 'Operator command requires a pinned hosted database')
    payment = stripe_payment(key, args.payment_intent)
    require(payment.get('id') == args.payment_intent, 'Stripe returned a different payment intent')
    import psycopg
    with psycopg.connect(dsn, sslmode='verify-full', sslrootcert='system', connect_timeout=10,
                          options='-c statement_timeout=20000 -c lock_timeout=4000') as conn:
        print(json.dumps(reconcile(conn, payment, args.revoke_credits, args.reference, args.live, args.apply_plan), sort_keys=True))


if __name__ == '__main__':
    try:
        main()
    except Refused as exc:
        print('REFUSED: ' + str(exc), file=sys.stderr)
        sys.exit(1)
    except Exception as exc:
        # Drivers and HTTP responses can embed credentials or customer data.
        print('Reconciliation failed (' + type(exc).__name__ + '); transaction rolled back. Inspect privately.', file=sys.stderr)
        sys.exit(1)
