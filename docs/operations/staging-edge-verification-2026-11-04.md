# Staging edge verification — 4 November 2026

Sales remain paused. These checks add evidence for the candidate; they do not establish full production readiness. No additional real model request, Stripe write, production deployment or production database write was made by this verification harness.

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
