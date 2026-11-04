# Customer support and journey acceptance

This is the operator's guide for the packs-only release. It is not a record that every check has passed. New subscriptions remain unavailable. Support, existing subscription cancellation and signed webhooks must remain available while new purchases are paused.

## Contact and ownership

The owner selected **gerard@aihuntrconsulting.com** for customer support. The public support, pricing, billing-related help, privacy and terms pages use the shared `SupportEmail` component. Before release, separately verify the support address shown in Stripe's live public business details, hosted Checkout/receipts and billing portal. Changing app text does not update those destinations.

On 4 November 2026, an expressly authorized, labelled message was sent through the connected support mailbox to the same mailbox. Gmail reported the message as both sent and received in Inbox. This establishes connected-mailbox access and self-delivery, not delivery from an external sender, absence of spam filtering or a response-time SLA. Keep its private message reference in the operator handover. Check an ordinary external-sender path before promising support availability to buyers.

Record the responsible operator, coverage and backup in the private handover. Do not publish a response-time promise until that coverage is agreed. Store support records in access-controlled tools with a documented retention period; do not include photos, card details, passwords, keys or sign-in links in test evidence or tickets.

## Minimal checks still required before the first paid customer

| Journey | Evidence available in this candidate | Final check and measurable pass condition |
| --- | --- | --- |
| Signup, verification and recovery | Clerk components and return routes exist. The successful staging buyer was a synthetic, already-verified identity. | In a fresh browser, create a separate test account through the actual sign-up UI, receive the configured verification code/link, reload/sign out/in, and exercise the configured recovery method. The same account and balance survive; redirects stay on the intended origin. Confirm the owned production Clerk instance has the same enabled flow before opening. |
| Trial | Worker and hold routes require a verified account; failed jobs restore a trial and successful trials receive a watermarked preview. | A newly verified, non-admin user gets exactly one free trial without a card. Success consumes it once, refresh/recovery doesn't consume it again, and another trial is rejected or quotes a paid credit before generation. |
| Pack prices and successful payment | Starter sandbox payment, signed delivery/redelivery and exact one-time credit grant were demonstrated. Unit/DB tests cover the three mapped packs. | For every pack offered at launch, confirm exact AUD amount, credits, one-time mode and active test/live mappings. Complete isolated sandbox purchases for Value and Pro if those packs will open; confirm single grants of 30 and 100, respectively. Otherwise keep unverified packs closed. A cancelled/abandoned Checkout must not grant credits. |
| Decline and retry | The webhook refuses unpaid pack fulfillment; local tests cover this invariant. | Submit a documented Stripe decline test in the sandbox, confirm no ledger grant and unchanged balance, then retry that purchase through Checkout using a successful test method. Confirm only the successful payment grants once and no subscription is created. Do not treat a synthetic webhook alone as the card-decline rehearsal. |
| Receipt | The Starter hosted receipt opened with the right amount. | Inspect provider receipt-email settings and customer-facing support details. Stripe does not automatically email test-payment receipts; use its manual test-receipt flow for an authorized deliverable recipient. If email receipts will be promised, prove that delivery and verify the live successful-payment setting; do not call a hosted receipt an email receipt. |
| Result use and recovery | Local and hosted real output and ownership tests are separately recorded by the release operator. | In the ordinary browser, retrieve/download the completed look, reload and reopen it from recent looks without another debit. A second account gets no history entry or image; expired results are inaccessible. Test the stated mobile upload formats and generation failure/refund. |
| Refund/support remedy | Support accepts requests. There is no automatic Stripe refund/dispute entitlement revocation handler in the candidate. | Name the operator who reconciles each approved money refund with used and unused credits. In sandbox, carry out one approved full refund and reconcile its explicit ledger adjustment. Replay of the original paid event must not recreate revoked credits. Record whether a partial refund leaves any purchased credits. Do not promise automated adjustment. |
| Existing subscriber cancellation | Signed lifecycle handlers preserve purchased credits and portal access; unit/DB tests cover cancellation, stale events and failure recovery. | Reconfirm whether live subscriptions exist. For each supported legacy price, use an isolated legacy subscription fixture to test portal cancellation, its effective date and the absence of a next invoice; failed renewal then successful recovery must preserve purchased credits and grant once. With no live subscribers, keep new subscriptions closed and document this narrower launch scope rather than inventing a renewal obligation. |
| Account deletion | Signed Clerk deletion removes app media/jobs, tombstones the account and checks owned Stripe obligations. The packs-only closure bug was corrected and focused regression tests were added. | On a disposable staging user, execute the actual Clerk deletion flow and verify its signed webhook 200, no recoverable results/profile PII, no new jobs with old credentials, and closure billing state resolved only after Stripe confirms no remaining charge obligation. Replay that signed event. Unknown/mixed recurring items must remain in review; a transient provider failure must remain pending for retry. Verify external media/provider/backup cleanup independently before saying deletion is complete. |

These are acceptance checks, not blanket approval to charge a live card or to contact customers. Use isolated test records and the expressly authorized operator mailbox.

## Ordinary signup rehearsal

On 4 November 2026, an isolated browser context opened the protected staging storefront's real `/sign-up` page with no Clerk testing helper or testing token. It used a new plus-alias of the owner-approved support mailbox, distinct from the existing paid sandbox buyer. Clerk displayed its ordinary email/password form and Development mode.

The first attempt stopped at request verification. Browser diagnostics showed that `script-src` blocked `https://challenges.cloudflare.com/turnstile/v0/api.js`; the UI displayed “Verification didn't complete.” A narrow Gmail search found no verification email for this test alias at that point. This was a confirmed storefront configuration defect, not evidence that email delivery is disabled in test mode. The candidate `frontend/next.config.ts` now permits the exact challenge origin in `script-src` and `frame-src`; the existing connection policy already permits it. The evaluated production header and ESLint checks passed, but hosted signup, email verification, sign-out/in and password recovery remain pending deployment and retest.

Configuration sources: [Clerk CSP requirements](https://clerk.com/docs/guides/secure/best-practices/csp-headers), [Cloudflare Turnstile CSP requirements](https://developers.cloudflare.com/turnstile/reference/content-security-policy/). Do not bypass bot protection or mark a testing-token login as proof of the ordinary customer flow.

## Handling a customer report

1. **Identify the account and event.** Request the account email, time/time zone and request or receipt reference. Use the authenticated portal/provider records to verify ownership. If they cannot sign in, offer the configured recovery route; never ask for their password or a sign-in token.
2. **Prevent duplicate purchases or model calls.** For an unknown payment outcome, inspect the original Checkout, payment intent and ledger before asking for another payment. For a missing look, inspect the original job and recent private result before suggesting another Generate.
3. **Reconcile money and credits separately.** A failed generation restores the consumed trial or credit through settlement/recovery; it is not a Stripe money refund. A refunded card charge does not automatically remove credits in this candidate. Record paid amount, refunded amount, original grant, consumed credits and any separate idempotent credit adjustment. For disputes, preserve financial evidence and escalate to the responsible operator. Never rewrite historical grants or bulk-zero wallets.
4. **Confirm cancellation at the provider.** Use the portal or an authorized operator action. Verify subscription status/effective date and future charges, and then tell the customer what was actually done. A support/deletion request alone is not confirmation of cancellation. Packs never renew and have no subscription to cancel.
5. **Finish deletion against all relevant systems.** The app's closure queue inventories legacy media references. Verify bucket, object ownership and provider retention before acting on a supplied locator. Resolve `pending`/`review` billing obligations and external cleanup; retain only required financial evidence and the minimal tombstone. Do not report complete backup/provider erasure while it is merely scheduled.

## Reconciling a completed full pack refund

`scripts/ops/reconcile_pack_refund.py` adjusts app credits **after** an authorized money refund has completed at Stripe. It does not issue money refunds, email customers, cancel subscriptions, or resolve disputes. Partial money refunds, unsettled refunds, disputed charges and an incomplete refund list are refused. Handle those cases separately; do not change records to make this command accept them.

Before running it, verify the payment, account owner, original pack grant and approved support outcome. Credits are pooled: the current wallet alone does not identify which pack was spent. Choose the number of credits to revoke explicitly, between zero and the original grant, without exceeding the available balance. If some credits have already been used, the responsible operator must decide and record the remedy in the case; the script will not silently choose a smaller revocation. Wait for running generation jobs and active legacy holds to settle before proceeding.

Use an environment with Python 3 and `psycopg` installed. Supply `STRIPE_SECRET_KEY` and `CHANGEROOM_RECONCILE_DSN` through the approved private secret mechanism, without printing or committing them. Pin the exact hosted database name/address from the reviewed target configuration; the CLI checks the host and verifies the server TLS certificate. Use the matching sandbox key/database for the rehearsal. Replace the identifiers below with that case's verified values:

```sh
python scripts/ops/reconcile_pack_refund.py \
  --payment-intent pi_REPLACE \
  --revoke-credits 10 \
  --case CR_REFUND_20261104_01 \
  --expected-db-host REPLACE_WITH_DATABASE_HOST
```

This is a dry-run. Review its environment, payment/charge/refund IDs, refunded cents/currency, original grant, chosen revocation, `unrevoked_grant_credits`, and before/after balances. The user identifier is hashed in output, but payment references are still private support evidence. Keep the output with the case. The case reference must contain no personal information.

Only after reviewing that exact plan, repeat the same command with `--apply-plan` and the returned hash:

```sh
python scripts/ops/reconcile_pack_refund.py \
  --payment-intent pi_REPLACE \
  --revoke-credits 10 \
  --case CR_REFUND_20261104_01 \
  --expected-db-host REPLACE_WITH_DATABASE_HOST \
  --apply-plan REPLACE_WITH_REVIEWED_PLAN_SHA256
```

A changed balance or plan invalidates the hash and requires a fresh dry-run/review. A successful apply appends one `adjustment` with request ID `pack-refund:<payment_intent>`, preserves the original grant, and commits it atomically with the wallet decrement. Repeating the same instructions returns `already_reconciled`; changed credit counts or case references are refused. Never delete the original purchase grant, because paid-event redelivery relies on it for idempotency. Verify the resulting wallet and ledger, redeliver the original sandbox paid event, and confirm the balance stays unchanged before declaring the rehearsal complete.

The CLI defaults to Stripe test mode. A subsequently authorized live operation requires both `--live` and a live key, plus the reviewed live database target. Having a passing sandbox rehearsal does not itself authorize a live refund or unpausing sales.

Local automated evidence on 4 November 2026: 43 focused cases passed, including 22 checks against a freshly created local PostgreSQL database using the checked-in wallet/ledger and try-on job schema. The suite verified wrong/stale hashes and dry-runs make no changes, ownership/provider refusals, explicit partially consumed-credit decisions, running jobs and legacy holds, one committed adjustment under concurrent application, and rollback of the wallet update when the ledger write fails. It did not exercise real Stripe refunds or hosted credentials. To rerun, set `CHANGEROOM_REFUND_TEST_DSN` to a disposable loopback `127.0.0.1` database named `refund_test`, owned by `crtest` with permission to create databases, then run `python -m pytest scripts/ops/tests/test_reconcile_pack_refund.py -q`. The integration fixture creates and drops its own uniquely named database; without this variable those 22 cases are explicitly skipped.

## Public promises requiring owner validation

The candidate does not establish the legal seller name, registered/business address, tax treatment, sale countries, the governing-law jurisdiction, or actual provider/backup retention periods. The owner must validate the public terms and privacy notice against those facts and the intended customers. The existing terms limit outputs to personal use; confirm that this matches the offer rather than silently advertising commercial rights. The notice preserves non-excludable consumer rights and offers a refund contact; this guide does not invent a blanket refund window or promise legal compliance.

Useful current sources: [Stripe testing](https://docs.stripe.com/testing), [Stripe receipts](https://docs.stripe.com/receipts), [ACCC consumer guarantees](https://www.accc.gov.au/consumers/buying-products-and-services/consumer-rights-and-guarantees), [OAIC privacy policy guidance](https://www.oaic.gov.au/privacy/your-privacy-rights/your-personal-information/what-is-a-privacy-policy).
