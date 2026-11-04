# Customer support and journey acceptance

This is the operator's guide for the packs-only release. It is not a record that every check has passed. New subscriptions remain unavailable. Support, existing subscription cancellation and signed webhooks must remain available while new purchases are paused.

## Contact and ownership

The owner selected **gerard@aihuntrconsulting.com** for customer support. The candidate public support, pricing, billing-related help, privacy and terms pages use the shared `SupportEmail` component. A separate one-line production patch, PR #16, updated the paused live pricing page's displayed contact and mailto; the release operator verified the new address, purchase-pause notice and existing billing/cancellation link after deployment. Before release, separately verify the support address shown in Stripe's live public business details, hosted Checkout/receipts and billing portal. Changing app text does not update those destinations.

On 4 November 2026, an expressly authorized, labelled message was sent through the connected support mailbox to the same mailbox. Gmail reported the message as both sent and received in Inbox, establishing connected-mailbox access and self-delivery. The later ordinary signup/recovery rehearsal also delivered real Clerk emails from `notifications@accounts.dev` to a unique plus-alias of that support mailbox, with Inbox labels. This verifies one external provider's delivery path; it does not establish delivery from every customer, absence of spam filtering, monitored coverage or a response-time SLA. Keep private message references in the operator handover.

Record the responsible operator, coverage and backup in the private handover. Do not publish a response-time promise until that coverage is agreed. Store support records in access-controlled tools with a documented retention period; do not include photos, card details, passwords, keys or sign-in links in test evidence or tickets.

## Minimal checks still required before the first paid customer

| Journey | Evidence available in this candidate | Final check and measurable pass condition |
| --- | --- | --- |
| Signup, verification and recovery | Ordinary staging signup passed with a distinct mailbox alias and human-completed challenge, real Inbox verification, sign-out/password sign-in, and emailed password recovery. The old password was rejected; the new password restored the same account. Zero credits and the unused free-trial indicator survived recovery/reload; returns stayed on staging. No Clerk testing helper/token was used. | Verify the production Clerk instance has the same intended flow, correct product/sender branding and approved production return URLs. Repeat its safe signup/recovery smoke check before opening; the staging development instance still labels emails/sign-in as “My Application.” |
| Trial | Worker and hold routes require a verified account; failed jobs restore a trial and successful trials receive a watermarked preview. | A newly verified, non-admin user gets exactly one free trial without a card. Success consumes it once, refresh/recovery doesn't consume it again, and another trial is rejected or quotes a paid credit before generation. |
| Pack prices and successful payment | All three sandbox packs passed actual Checkout: Starter +10, Value +30 and Pro +100, with exactly one grant each and no subscriptions. Repeated success-page returns did not grant twice. | Reconfirm live mappings and one-time mode at cutover: AUD14.99/10, AUD34.99/30, AUD89.99/100. Sandbox proof does not authorize a live charge. A cancelled/abandoned Checkout must not grant credits. |
| Decline and retry | Actual sandbox Value Checkout declined with insufficient funds and left the balance at 8; a successful retry on the same payment intent raised it to 38 exactly once. | Preserve the tested behavior through release and confirm the production price catalog matches the tested pack mappings. This evidence is actual test-card Checkout, not a synthetic webhook-only test. |
| Receipt | The Starter hosted receipt opened with the right amount. | Inspect provider receipt-email settings and customer-facing support details. Stripe does not automatically email test-payment receipts; use its manual test-receipt flow for an authorized deliverable recipient. If email receipts will be promised, prove that delivery and verify the live successful-payment setting; do not call a hosted receipt an email receipt. |
| Result use and recovery | Local and hosted real output and ownership tests are separately recorded by the release operator. | In the ordinary browser, retrieve/download the completed look, reload and reopen it from recent looks without another debit. A second account gets no history entry or image; expired results are inaccessible. Test the stated mobile upload formats and generation failure/refund. |
| Refund/support remedy | A genuine sandbox full Value refund and explicit operator adjustment passed: AUD34.99 refunded, 30 credits revoked once, wallet 138→108. Repeating reconciliation returned already_reconciled. Stripe redelivered the original paid event with HTTP200 and did not restore revoked credits. There is no automatic refund/dispute entitlement revocation handler. | Name the operator who reconciles each approved money refund with used and unused credits. Use the tested dry-run/hash/apply procedure for each subsequently authorized remedy; preserve the original grant for paid-event replay protection. Record whether a partial refund leaves any purchased credits. Do not promise automated adjustment. |
| Existing subscriber cancellation | Signed lifecycle handlers preserve purchased credits and portal access; unit/DB tests cover cancellation, stale events and failure recovery. | Reconfirm whether live subscriptions exist. For each supported legacy price, use an isolated legacy subscription fixture to test portal cancellation, its effective date and the absence of a next invoice; failed renewal then successful recovery must preserve purchased credits and grant once. With no live subscribers, keep new subscriptions closed and document this narrower launch scope rather than inventing a renewal obligation. |
| Account deletion | Signed Clerk deletion removes app media/jobs, tombstones the account and checks owned Stripe obligations. The packs-only closure bug was corrected and focused regression tests were added. | On a disposable staging user, execute the actual Clerk deletion flow and verify its signed webhook 200, no recoverable results/profile PII, no new jobs with old credentials, and closure billing state resolved only after Stripe confirms no remaining charge obligation. Replay that signed event. Unknown/mixed recurring items must remain in review; a transient provider failure must remain pending for retry. Verify external media/provider/backup cleanup independently before saying deletion is complete. |

These are acceptance checks, not blanket approval to charge a live card or to contact customers. Use isolated test records and the expressly authorized operator mailbox.

## Ordinary signup rehearsal

On 4 November 2026, an isolated browser context opened the protected staging storefront's real `/sign-up` page with no Clerk testing helper or testing token. It used a new plus-alias of the owner-approved support mailbox, distinct from the existing paid sandbox buyer. Clerk displayed its ordinary email/password form and Development mode.

The first attempt stopped at request verification. Browser diagnostics showed that `script-src` blocked `https://challenges.cloudflare.com/turnstile/v0/api.js`; the UI displayed “Verification didn't complete.” A narrow Gmail search found no verification email for this test alias at that point. This was a confirmed storefront configuration defect, not evidence that email delivery is disabled in test mode. The candidate `frontend/next.config.ts` now permits the exact challenge origin in `script-src` and `frame-src`; the existing connection policy already permits it. The evaluated production header and ESLint checks passed.

After the staging alias was updated to revision `01ccc0a`, its served CSP contained both exact-origin entries. The ordinary signup then loaded the Cloudflare “Verify you are human” challenge with no recorded CSP/network errors. The user completed the challenge and verification flow; the browser reached the staging homepage with the expected test alias and Clerk's email status `verified`. Real verification messages were observed in the approved mailbox's Inbox (latest at 05:23:18 UTC).

The subsequent ordinary account menu sign-out and password sign-in returned the same user to the staging origin. The real “Forgot password?” → “Reset your password” flow sent a recovery message received in Inbox at 05:27:22 UTC. Its code was accepted and a new password was set only for this disposable staging account. After sign-out, the superseded password was rejected at the password-factor step; the replacement password restored the same user. The billing screen showed zero credits and “Free Try-On Available” before and after recovery, including a reload. No generation or payment was performed, so this does not test consuming the free trial. The test finished signed out and its isolated browser was closed. Sanitized aggregate evidence and the disposable fixture reference are in the private operator handover; no password or verification code is stored in this document.

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

Local automated evidence on 4 November 2026: 43 focused cases passed, including 22 checks against a freshly created local PostgreSQL database using the checked-in wallet/ledger and try-on job schema. The suite verified wrong/stale hashes and dry-runs make no changes, ownership/provider refusals, explicit partially consumed-credit decisions, running jobs and legacy holds, one committed adjustment under concurrent application, and rollback of the wallet update when the ledger write fails. That automated suite used local fixtures. A separate hosted sandbox rehearsal subsequently verified the real Stripe refund and replay as described below. To rerun, set `CHANGEROOM_REFUND_TEST_DSN` to a disposable loopback `127.0.0.1` database named `refund_test`, owned by `crtest` with permission to create databases, then run `python -m pytest scripts/ops/tests/test_reconcile_pack_refund.py -q`. The integration fixture creates and drops its own uniquely named database; without this variable those 22 cases are explicitly skipped.

## Public promises requiring owner validation

The candidate does not establish the legal seller name, registered/business address, tax treatment, sale countries, the governing-law jurisdiction, or actual provider/backup retention periods. The owner must validate the public terms and privacy notice against those facts and the intended customers. The existing terms limit outputs to personal use; confirm that this matches the offer rather than silently advertising commercial rights. The notice preserves non-excludable consumer rights and offers a refund contact; this guide does not invent a blanket refund window or promise legal compliance.

Useful current sources: [Stripe testing](https://docs.stripe.com/testing), [Stripe receipts](https://docs.stripe.com/receipts), [ACCC consumer guarantees](https://www.accc.gov.au/consumers/buying-products-and-services/consumer-rights-and-guarantees), [OAIC privacy policy guidance](https://www.oaic.gov.au/privacy/your-privacy-rights/your-personal-information/what-is-a-privacy-policy).

## Hosted sandbox refund rehearsal — 4 November 2026

The operator verified the Value Checkout, exact test account/price/customer, AUD34.99 settled payment and original +30 grant before issuing an idempotent full sandbox refund. The reviewed reconciliation plan revoked exactly 30 available credits (138→108), appended one adjustment and preserved the original grant. A repeated apply returned `already_reconciled` with balance108. Stripe CLI redelivered the original checkout completion; Vercel request logs recorded POST `/api/webhooks/stripe` HTTP200 at 05:14:44 UTC. The wallet remained108 with16 ledger rows/net108, one original Value grant and one -30 refund adjustment. Starter and Pro grants remained intact; no live payment was touched. Private provider references and receipts remain outside the repository.
