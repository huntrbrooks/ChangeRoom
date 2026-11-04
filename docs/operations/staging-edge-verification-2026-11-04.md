# Staging edge verification — 4 November 2026

Sales remain paused. These checks add evidence for the candidate; they do not establish full production readiness. No additional real model request, live Stripe write, production deployment or production database write was made by this verification harness. The later checkout section includes expressly authorized **Stripe sandbox** purchases; these do not move real funds.

## Targets and evidence boundaries

- Protected web preview: `https://changeroom-rehearsal-stage.vercel.app`.
- Hosted FastAPI: `https://changeroom-rehearsal-worker.onrender.com`, reviewed backend revision `5dd66cf`.
- Local fault tests: candidate backend at `ec4e63e`, with source-file hashes recorded in the private journal. Clerk JWT verification, Next job issuance and the staging database functions were real. Only provider HTTP transport was replaced with deterministic offline responses; local provider keys were deliberately invalid fixtures.
- Private scripts and receipts: `~/.local/state/changeroom/staging-20261104/edge-verification/` (not committed, no credentials in receipts). The existing successful hosted browser proof is under the sibling `render-browser/` directory.

**Endpoint reconciliation completed before resuming.** The lead operator reported that a Neon restore operation unexpectedly changed endpoint/branch mapping. These tests used the exact previously approved staging endpoint, and never called restore/branch APIs. Tests stopped when notified. The operator then reconciled the baseline and three failed jobs and designated `br-icy-bread-bbzngw6q` as the authoritative staging branch, retaining the old branch as backup. A fresh read-only Neon `get_postgres_endpoint` call independently confirmed `ep-billowing-bar-bb2324fe` points to that branch. The private harness now requires a receipt pinning this mapping, refreshed within one hour.

## Observed hosted behavior

The noncharging matrix ran from **04:45:29 to 04:46:46 UTC**. It never issued a generation intent: accepted image inputs were paired with a random UUID confirmed absent from the staging database. The paid synthetic customer remained at **8 credits, 0 trials, unfrozen**; its ledger remained **5 entries, net 8** throughout that matrix.

| Check | Observed result | Interpretation |
| --- | --- | --- |
| Preview without deployment access | Vercel protection response | Preview remained protected. |
| No bearer / malformed bearer | 401 / 401 | Authentication rejected before generation. |
| Missing person/garment | 422 | Required upload validation. |
| Legacy saved path supplied | 400 | Client cannot substitute a saved file path. |
| Unsupported extension / corrupt JPEG / person smaller than 400px | 415 / 415 / 422 | Invalid inputs rejected. |
| Malformed garment JSON / out-of-range primary index | 400 / 400 | Invalid fields rejected. |
| File over 10 MiB | 413 | Per-file byte limit enforced. |
| Body over 30 MiB plus 256 KiB multipart allowance | 413 | Outer request cap enforced. This response precedes the stack-header middleware. |
| Actual synthetic HEIF bytes | 409 at missing-job authorization | HEIF normalization succeeded far enough to reach job authorization; no model call. This is not a physical iPhone/browser upload test. |
| Valid JPEG with absent job | 409 | Valid media alone cannot authorize generation. |
| Per-user burst beyond 10 accepted attempts/minute | 429 | Current single-worker limiter enforced during the test. |

Every listed application response other than the outer body-limit rejection carried `X-ChangeRoom-Stack: fastapi-worker`.

An additional hosted cross-owner test used a real, newly issued owner intent. A second authenticated synthetic user submitted valid media with that ID and received **409**; the intent remained `issued`, unfunded, with the owner's balance still 8. The local worker subsequently failed/refunded that same intent as described below.

The first upload-count assertion was a **harness error**: it repeated singular `clothing_image` fields, which bind to one file, rather than the plural `clothing_images` field. It therefore observed missing-job 409 instead of the intended count-limit 400. After correction and endpoint reconciliation, the focused follow-up **passed**: six `clothing_images` and six `user_images` each returned 400; metadata over 65,536 characters returned 400; empty JPEG returned 415; malformed job UUID returned 403. These five hosted cases ran **04:51:52–04:52:10 UTC**, with the balance and ledger unchanged at 8 credits / 11 entries / net 8.

## Controlled local fault tests against the real staging ledger

Each intent came from the protected Next `POST /api/try-on/hold` using the existing paid synthetic customer's real Clerk token. The local FastAPI worker used the restricted staging database role to claim and settle it. An independent read observed **8 → 7 during the provider fixture → 8 after failure**. No balance was manually edited. All provider requests were intercepted; a separate guard rejected unexpected async network other than the public staging Clerk JWKS.

| Offline provider scenario | Worker result | Intercepted provider requests | Final ledger/state |
| --- | --- | --- | --- |
| Structured primary 503, fallback unconfigured | 502 | One primary | One hold −1, one release +1; failed, no result bytes. |
| Structured primary 503, configured fallback also 503 | 502 | One primary, one fallback | Same exact refund behavior. |
| Ambiguous primary read timeout, fallback configured | 502 | One primary, no fallback | Same exact refund behavior; no speculative second model attempt. |
| Primary safety block (targeted run after resume) | 422 | One primary, no fallback | One hold −1, one release +1; failed, no result bytes. |

Reposting each completed failed job returned **409** without another provider request. Repeating the failed settlement acknowledgement did not add a second release. The three jobs' timestamps and IDs are retained privately for reconciliation.

The first two scenarios completed from **04:46:34 to 04:47:33 UTC**. The third completed its assertions at **04:47:58 UTC**, but the operator pause interrupted pytest during its final database read. That runner therefore reports **2 passed, interrupted**, not an overall green suite. Cleanup recorded **8 credits, 0 trials, unfrozen, 11 ledger entries/net 8** at **04:48:07 UTC**. Three hold/release pairs account for the six additional ledger entries. No case remained running in the recorded observations. The safety-block scenario subsequently ran by itself and **passed** at **04:52:27–04:53:04 UTC**, including replay denial and repeat-settlement idempotency; final balance remained 8, ledger 13 entries/net 8.

## Commands and outstanding validation

Commands executed with the isolated validation virtualenv:

```sh
python -m pytest -q --tb=line -o asyncio_default_fixture_loop_scope=function test_hosted_edges.py
# 3 passed, 1 failed: incorrect singular count-field fixture described above.

python -m pytest -q --tb=line -o asyncio_default_fixture_loop_scope=function test_local_fault_ledger.py
# 2 passed; interrupted on operator instruction during third case final read.

python -m pytest -q --tb=line -o asyncio_default_fixture_loop_scope=function test_hosted_counts.py
# 1 passed (5 hosted cases).

LOCAL_FAULT_JOURNAL=local-safety-journal.json python -m pytest -q --tb=line \
  -o asyncio_default_fixture_loop_scope=function test_local_fault_ledger.py -k primary_safety_block
# 1 passed, 3 deselected; no additional real provider call.
```

Preserve the existing journals rather than re-running an issued scenario blindly. Before future mutations, refresh the endpoint/branch receipt and read the current buyer balance: later sandbox pack tests may intentionally increase it. The original interrupted pytest result remains recorded; it was not erased or relabelled as a clean full-suite pass.

Previously completed hosted browser evidence remains separate: one real OpenAI result, owner recovery, visible 9 → 8 credit balance, cross-owner empty 404 after owner cache warm and anonymous 401. These edge tests do not replace UI recovery, real-device upload, availability/load, monitoring, backups/recovery, billing, support or legal launch gates.

## Actual sandbox checkout journey

The protected storefront and hosted Stripe Checkout were exercised in Chrome using the existing paid synthetic customer. This used the then-current preview `dpl_TSCthekbTsTq87ycJpx5EEtkCghP`; the subsequent support/account-closure preview was not yet aliased. Every session and price was checked against the isolated Stripe account and `livemode=false` before payment. No live key, real card, new subscription, or refund was used.

1. The actual Value **Buy pack** button created one A$34.99 / 30-credit Checkout Session. The hosted **Back** link returned to pricing while the session remained unpaid and Billing still showed 8 credits.
2. Resuming that same session and submitting Stripe's documented insufficient-funds fixture displayed the hosted decline message. Stripe independently reported `card_declined` / `insufficient_funds`, `requires_payment_method`, and unpaid Checkout. No credit grant occurred.
3. The single successful retry of that same PaymentIntent completed Value. Billing showed **38**, then remained **38** after re-entering the same success URL and exercising the real settlement endpoint again.
4. The actual Pro **Buy pack** button created one A$89.99 / 100-credit Session. One successful sandbox payment raised Billing to **138**, unchanged after repeating its success return.
5. The final read-only audit found exactly **one +30 grant** for Value and **one +100 grant** for Pro, each keyed by its paid PaymentIntent. Value had one failed charge and one successful charge on the same intent. Pro had one successful charge. Customer subscriptions: **zero**. Wallet/ledger at audit: **138 credits, 15 entries, net 138**.

Private evidence is in `checkout-browser/pack-journal.json`, `pack-ledger-proof.json`, `value-declined.png`, `balance-38.png` and `balance-138.png`. The journal includes the private test IDs needed for the separate refund drill; the original Starter payment must not be refunded as part of that drill. Commands:

```sh
node packs.cjs run
# PASS: actual Value decline/retry, Pro purchase, repeated returns, zero subscriptions.
python audit-packs.py
# PASS: read-only Stripe/ledger reconciliation; no refund issued.
```

Early harness runs corrected a navigation/body-capture race, the Stripe card selector's overlay hit area, and the exact decline wording. Each uncertain payment/session outcome was reconciled read-only before continuing. These were harness failures; no duplicate Checkout Session or duplicate payment was created to work around them. The proof is card-only: displayed Klarna/Zip, wallets, 3DS and asynchronous payment success were not exercised here. Email receipt inbox delivery remains outside this synthetic-address proof.

Stripe documents the [sandbox test card behavior](https://docs.stripe.com/testing?testing-method=card-numbers) and cautions that its [frontend automation may encounter protection measures](https://docs.stripe.com/automated-testing). No CAPTCHA was solved or protection bypass installed.

## Synthetic signup

The actual protected storefront sign-up form created a distinct synthetic development account using Clerk's documented `+clerk_test` address and test OTP. The signed-in Billing UI and application API showed **0 credits, exactly 1 trial, nonprivileged**. The fixture was marked synthetic in Clerk private metadata. No image request was submitted and no inbox delivery was claimed; this does not replace the ordinary-email verification test being run separately.

Evidence: `signup-browser/signup-proof.json`, `verified-new-account.png`; command `node onboarding.cjs signup` passed. Clerk's [documented test email/OTP rules](https://clerk.com/docs/guides/development/testing/test-emails-and-phones) explicitly say these test addresses receive no email.

After aliasing the patched preview `dpl_Dh6tTGFXwMtqL2vSTyr1N8RepuRj`, `node onboarding.cjs recover` also **passed**: actual signed-out login → **Forgot password?** → **Reset your password** → documented test OTP → new password → the same signed-in account. Billing and API remained 0 credits / 1 trial. The harness waits for Clerk's reset-preparation response before entering the test code; an earlier immediate-code attempt had raced that preparation and was not counted as a pass. Evidence: `signup-browser/recovery-proof.json`, `recovered-account.png`.

All these browser contexts are closed. No free-trial generation was submitted: this proves signup entitlement and account recovery, not a new hosted free-trial image or email inbox delivery. The separate ordinary-address flow and production auth configuration still need their own evidence.
