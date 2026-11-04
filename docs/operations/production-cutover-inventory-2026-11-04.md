# Production cutover inventory — 2026-11-04

**Decision: keep purchases closed.** This records the initial inspection and the dated production preparation update below. It is not a production application release or proof of a live customer journey. New acquisition is one-time packs only; recurring checkout remains closed.

## Production preparation update — 4 November 2026

The user approved the US$7/month production worker and reduced production database capacity. Endpoint `ep-proud-bonus-a778rjt6` remains mapped to `br-snowy-brook-a7slxiau`; its minimum/maximum compute is now 0.25–1 CU with 300-second auto-suspend. The original recovery branch was not modified. Scheduled five-minute operations can keep minimum compute awake; see the private cost review before assuming idle savings.

After a fresh endpoint assertion and snapshot **creation only**, the exact five migrations listed below were applied to production from reviewed commit `75abce1e2fce3840ea120cebd279eca67db26391`, as 41 statements in one transaction. Snapshot `snap-autumn-math-a7hxpx0y` was created at 05:25:17 UTC and expires 11 November 2026. All ten preexisting tables retained identical row counts and whole-table fingerprints after migration and after role verification; no historical bulk migration, customer-row update/delete, or restore ran. The free-trial default changed from two to one for future rows only. Production now has the six new checkout/job/closure/prerequisite tables and their reviewed functions.

New SQL-created logins `tryon_production_worker` and `tryon_production_ops` authenticated independently over verified TLS. Both have no elevated role attributes, memberships, owned objects, or public-table/sequence privileges. Worker has only the three job-function grants; ops only the sweep and two aggregate-function grants. Direct table probes were denied, nonexistent-job calls had no effects, and operations counters were zero. No service received these credentials during preparation and the cleanup function was not executed. Private mode-0600 files `production-credentials.env`, `production-role-proof.json`, and `production-launch-migration-evidence.json` record the handoff without placing secrets in this repository. Provider installation, scheduled operations and application verification remain release-operator tasks.

The following initial inspection and rehearsal sections are historical evidence; their statements that production schema/roles were absent are superseded by this update. The P0 schema/least-privilege preparation item is satisfied; deployment, monitoring and customer-journey gates remain independent.

Inspection window: 2026-11-04, approximately 15:25–15:55 Australia/Melbourne. Candidate baseline was `ec4e63e2bdc57df5b4b515c8def23ac082663a8b`; the shared candidate has additional uncommitted launch changes. Re-pin and test the final commit before deployment.

## Exact services and access

| Component | Verified configuration | Cutover implication |
|---|---|---|
| Production web | Vercel team `gerard-grenvilles-projects`, project `changeroom` (`prj_vHVn6DTeEW2wnWGdYO3SwKILmGrn`), Next.js root `frontend`, Node 24.x. Production deployment observed: `dpl_C8AqUTpY1vhGzCg7TbiVW1NPZipo`. Domains include `igetdressed.online`, `getdressed.online`. | Existing production is the paused legacy release; do not interpret candidate tests as its deployed behavior. |
| Separate web staging | Vercel project `changeroom-rehearsal` (`prj_hEBVKwbeBEQpG5ClneU5hQh7a8YZ`). | Continue isolated builds. Legacy production-project Preview has live credential exposure; it is unsuitable for rehearsals. |
| Production worker pointer | Production web `NEXT_PUBLIC_API_URL=https://changeroom.onrender.com`. The checked-in root `render.yaml` includes a legacy Python service and an unrelated paid YOLO service. | Do not deploy the whole root blueprint. Root operator owns the new Render worker. Record its actual account, service ID, plan, immutable source/image, region, and CORS before repointing web. |
| Live Clerk | Publishable key is live, issuer `https://clerk.igetdressed.online`; public JWKS returned 200 with one key. Vercel has a configured live secret and sensitive webhook secret. | Worker must use this exact issuer, its JWKS, and exact authorized frontend origins. A reachable JWKS is not proof that sign-in, sessions, or deletion callbacks work. |
| Live Stripe | Account `acct_1SZUOrDWNatk2HyV`, AU; charges and payouts enabled, details submitted. Read-only listing returned no subscriptions in this account. | Preserve portal/webhooks. Do not change historical recurring prices to imitate the obsolete storefront. |
| Production database | Neon project `polished-glade-65760282`, **I Get Dressed Online**, Sydney `aws-ap-southeast-2`, PostgreSQL 17.11, database `neondb`. Current live endpoint `ep-proud-bonus-a778rjt6.ap-southeast-2.aws.neon.tech`. | The separate US project named `changeroom` (`super-art-61913747`) is not this production database. Match the endpoint, not project display name. |
| Secret access | Documented Doppler wrapper failed because no token was available. Scoped Vercel CLI read access worked; its runtime environment command cannot pull eight sensitive variables. | A sensitive variable being unpullable does not mean missing. Verify all DB aliases at runtime without logging them. Do not replace a secret merely to inspect it. |

Public checks at the end of this inspection: `GET /pricing` returned 200 with “New subscriptions and credit packs are paused” and a billing link. An invalid, unauthenticated `POST /api/billing/create-checkout-session` returned 403; `POST /api/billing/portal` returned 401. This proves the observed acquisition block and authenticated portal boundary, not signed-in cancellation. All eight Stripe Payment Links were inactive. The application gate, edge gate and Payment Links are independent.

## Database state, restore incident, and rehearsal

The source/API flow is: Next.js `/api/try-on/hold` issues an owner-bound job; the browser sends its job and photos directly to FastAPI; the worker claims/settles the job in PostgreSQL; authenticated Next.js recent/result routes recover the private image. New generation does not depend on legacy R2 public image storage.

Before rehearsal, live tables included `users_billing`, `credit_holds`, `credit_ledger_entries`, `user_profiles`, `clothing_items`, `clothing_item_offers`, `saved_clothing_items`, `person_images`, `tryon_sessions`, and `user_outfits`. New checkout/job/closure tables and new job/ops functions were absent. The existing ledger and trial columns were already present; do **not** rerun every old migration alphabetically.

**Restore incident:** the root operator's snapshot restore used the tool's default finalize behavior. It moved the existing production endpoint to restored branch `br-snowy-brook-a7slxiau`, which is now named `production`. Original branch `br-summer-art-a715znpw` is retained as a recovery copy. A name intended to describe a rehearsal did not establish isolation. No launch migration was applied to either branch. Read-only comparison found identical row counts and whole-table row digests across all ten existing public tables, including billing wallets, ledger and holds; production billing schema still lacked the new tables. This supports equality at the comparison times, not an indefinite guarantee against later writes. Keep both copies until the root operator finishes reconciliation. Do not swap endpoints again merely to restore naming.

A similar restore moved staging's existing endpoint to `br-icy-bread-bbzngw6q`; its original `br-steep-violet-bb6lstl9` is retained. All seven original immutable staging job/ledger rows were still byte-equivalent. The current stage added three deliberately failed jobs and their six hold/release entries, leaving wallet and ledger net at eight. Profile/billing rows were updated during staging tests; no rows disappeared. Do not mistake those intentional test differences for loss.

**Actual isolated migration target:** `br-summer-poetry-a73kmtww`, endpoint `ep-odd-cake-a7hknz3c.ap-southeast-2.aws.neon.tech`, min/max 0.25 CU and suspend after 300 seconds. Immediately before writes, provider metadata confirmed:
- live `ep-proud-bonus-a778rjt6` → `br-snowy-brook-a7slxiau`;
- clone `ep-odd-cake-a7hknz3c` → `br-summer-poetry-a73kmtww`.

Only this clone received the following sequence, as 41 statements in one transaction:

1. `database/migration_subscriber_billing_v2.sql`
2. `database/migration_tryon_jobs.sql`
3. `database/migration_account_closure_prerequisites.sql` **(new)**
4. `database/migration_account_closure.sql`
5. `database/migration_tryon_ops.sql`

All statements succeeded; a second application also succeeded. `database/tests/launch-migration-prerequisites.sql` passed against the clone: a synthetic user with an affiliate click was closed, personal profile fields cleared and click removed, while financial balance was retained. Its subtransaction rolled back the fixture. Existing billing, ledger, hold and customer-table digests were unchanged afterward.

The new prerequisite is necessary: production lacked `affiliate_clicks`, while `request_account_closure` deletes from it. PL/pgSQL function creation can succeed despite that missing relation and fail only when invoked. The migration materializes the same table/FK/index structure already created lazily by `frontend/lib/db-access.ts:createAffiliateClicksTable`. Existing `clothing_item_offers`, `user_profiles` and `user_outfits` satisfy its other inspected prerequisites.

Worker/monitor functions on the clone are `SECURITY DEFINER`, fix `search_path=pg_catalog`, and revoke public execution. Actual dedicated runtime logins/grants remain to be provisioned and tested for production. No live roles matching the intended worker/sweeper naming were found.

Private evidence and reusable read-only scripts are under the operator's `~/.local/state/changeroom/production-readiness-20261104/`; they contain no DSNs or API keys. Before any future migration, obtain a fresh provider endpoint mapping and compare it with the production runtime host. Never infer isolation from a branch name or the restore request's name parameter.

Reproduce on the **isolated clone only** after provider mapping assertions. Have the secret manager inject `CHANGEROOM_MIGRATION_DSN`; do not paste a URL or use a live-target default. From repository root:

```sh
set -e
python3 - <<'PY'
import os
from urllib.parse import urlsplit
u = urlsplit(os.environ['CHANGEROOM_MIGRATION_DSN'])
assert u.hostname == 'ep-odd-cake-a7hknz3c.ap-southeast-2.aws.neon.tech'
assert u.path == '/neondb'
PY
for migration in migration_subscriber_billing_v2 migration_tryon_jobs migration_account_closure_prerequisites migration_account_closure migration_tryon_ops; do
  psql "$CHANGEROOM_MIGRATION_DSN" -X --set ON_ERROR_STOP=on --file "database/$migration.sql"
done
psql "$CHANGEROOM_MIGRATION_DSN" -X --set ON_ERROR_STOP=on --file database/tests/launch-migration-prerequisites.sql
```

Use verified TLS for the injected DSN. Stop on any migration failure; do not run the test or later migration afterward. Production execution requires a separately reviewed target assertion and fresh snapshot; do not edit this rehearsal hostname into a general default.

## Stripe catalogue and callbacks

Verified live price IDs and intended candidate pack amounts:

| SKU | Live price ID | Price | Candidate grant |
|---|---|---:|---:|
| Starter | `price_1SedQEDWNatk2HyVhW5pzkXv` | A$14.99, one-time | 10 credits |
| Value | `price_1SedQGDWNatk2HyVNCmHUgOH` | A$34.99, one-time | 30 credits |
| Pro | `price_1SedQGDWNatk2HyVbeZDkHUI` | A$89.99, one-time | 100 credits |

All three prices/products were active, AUD, with `tax_behavior=unspecified`. Amount agreement is proven; tax inclusion and merchant disclosures need owner confirmation. The historical Christmas price remains mapped only for settlement, not acquisition. Creator/Power live recurring prices are A$49.99/A$129.99 monthly, while old app labels differed; neither is offered by candidate checkout.

Live webhook `we_1Se4xfDWNatk2HyVJpD9gov8` is enabled at `https://igetdressed.online/api/webhooks/stripe`, API version `2025-11-17.clover`. It currently subscribes to checkout completed, subscription created/deleted/paused/updated, payment-intent succeeded, invoice paid/payment-failed, trial-will-end and charge-failed. Candidate code also handles events not presently subscribed:
- `checkout.session.async_payment_succeeded`;
- `customer.subscription.resumed`;
- `invoice.payment_succeeded`;
- `invoice.payment_action_required`;
- `invoice.marked_uncollectible`.

Before cutover, reconcile the required event set with supported payment methods and candidate handling, verify signing secret and delivery, then rehearse signed events in sandbox. Missing events are a verified configuration gap; actual missed customer events are not established. Do not replay live events blindly.

Default portal `bpc_1SeNAODWNatk2HyVbCzdHPlD` permits invoice history, customer/card updates, cancellation at period end without proration, and subscription price changes with immediate invoicing. No live subscriptions were listed, but sandbox legacy-subscription cancellation/recovery must still pass. Merchant support email did **not** match the owner-selected `gerard@aihuntrconsulting.com`; app copy cannot update Stripe's customer-facing support profile.

## Production gaps in order

Efforts below are engineering estimates excluding owner/provider wait time, unexpected defects and paid model runs.

| Priority / gap | Evidence and impact | Required action / owner / dependency | Measurable gate / estimate |
|---|---|---|---|
| P0: approved capacity and provider credentials | Production still points at the legacy Render URL. A free/staging run does not establish paid-service capacity. Code requires OpenAI primary; Gemini fallback is optional. | Root/platform operator: approve hosting and model budget first; record actual new service plan/limits and production-scoped keys, quotas, spend alerts, expiry and processor settings. Do not reuse the one-day staging key. | Representative cold request plus agreed concurrency test meets owner-approved latency/failure/cost bounds; fallback/refund proved. 0.5–1 day after credentials/cost decision. |
| P0: production schema and least privilege | New tables/functions absent; rehearsal now passes on a separate clone. | Database owner: fresh pre-cutover recovery point and mapping assertions; apply exact reviewed sequence. Create separate worker and monitor logins with grants below. | Existing wallet/ledger counts, sums and row digests unchanged by migration; real-role deny/allow checks pass. 2–4 hours after release pin. |
| P0: matching web/worker deployment | Runtime public API pointer is legacy; root blueprint is unsafe for a targeted subscriber deploy. | Release operator: deploy worker from final tested pin, exact live Clerk/CORS; deploy compatible web and all DB aliases; keep all acquisition gates closed. | Public health stack marker, authenticated trial/job settlement/recovery, owner isolation and billing portal all pass against intended hosts. 2–4 hours plus provider deploy time. |
| P0: callbacks and billing ownership | Stripe event set differs; Clerk deletion delivery unverified; support merchant profile mismatches. | Payments/auth operator: correct scoped webhook setup and merchant contact, preserve cancellation; owner confirms tax/refund disclosures. | Signed sandbox duplicate/late/failure/cancel/deletion events produce exactly one intended effect; receipt/price/grant agree. 2–4 hours; owner sign-off separate. |
| P0: cleanup and alert operation | Candidate workflow is not on live default branch. GitHub Production environment has no ops secret/vars; repository ops-enable variable absent. No received-alert proof. | Platform operator: configure restricted sweep login, environment secrets/origins, schedule and human notifications; protect environment/default branch. | Two scheduled sweeps succeed; injected staging failure reaches named operator; expired images are inaccessible and physically cleared; dead-man alarm fires after agreed gap. 2–4 hours plus timer observation. |
| P0: support/privacy/recovery | Mailbox roundtrip, legacy object lifecycle/deletion, provider retention and restored-media behavior are not proven. | Owner/support + platform: confirm primary/substitute coverage, test mailbox; inventory legacy buckets/media; finish isolated restore/reconciliation including deletion suppression. | Customer can reach support and get answer; named operator can restore an agreed fixture within approved RPO/RTO; deletion removes app media and queues external cleanup accurately. 0.5–1 day plus owner confirmation. |
| P0: complete paid journey | Catalogue/read-only checks are not an authenticated checkout/receipt/result/cancellation proof. | QA/release operator: final pinned isolated release tests; root retains detailed staging evidence. | Signup → trial → sandbox pack → exactly-once ledger grant → use → recover/download → support → failed payment/retry → account deletion; separate legacy renewal/cancel fixture passes. 0.5 day after prior gates. |
| Later: wider operational controls | No evidence of traffic requiring autoscaling/multiple worker replicas or enterprise tooling. | Add only when measured demand requires; decide longer recovery retention based on loss tolerance and cost. | Revisit after initial paying cohort and measured load. Not a reason to delay the verified small launch. |

Required worker database privileges: CONNECT, schema USAGE, and EXECUTE of only `tryon_claim(uuid,text)`, `tryon_settle(uuid,text,bytea)`, `tryon_extra(uuid,text,text)`. It must not own tables, be superuser/BYPASSRLS, or read customer tables. Sweeper: separate login with only `tryon_sweep()`, `tryon_ops_counts()`, `closure_ops_counts()`; deny worker functions and table reads. Web remains the owning backend for issue/read/billing operations in this release.

Worker settings: Docker entrypoint from `backend/Dockerfile`; `BACKEND_AUTH_MODE=clerk`, exact live `CLERK_ISSUER`/JWKS, exact `ALLOWED_ORIGINS` (no regex), restricted `TRYON_DATABASE_URL`, `OPENAI_API_KEY`, optional distinct Google fallback key, `TRYON_CONCURRENCY=1` initially, approved upload limits. The active `subscriber_image.py` pins primary `gpt-image-2.5-sunburst` and fallback `gemini-3.1-flash-image`; provider access and price are separate validation, not inferred from names or environment presence. Limits are per instance; do not add replicas before measuring DB/provider capacity.

## Monitoring, retention and backups

- Production Neon reported 24-hour point-in-time history, PostgreSQL 17, and endpoint min 1/max 8 CU with suspend setting 0 at inspection. Cost exposure must be checked against actual marketplace billing; an idle state is not proof of zero spend. Root controls any cost changes.
- Snapshot schedule and snapshot list were empty at initial read. Root subsequently created a pre-migration snapshot and retained original/recovered branches. This is distinct from proving a repeatable recovery runbook. The user's tolerated data loss/recovery time remains a business decision; do not claim the runbook's suggested 24-hour/4-hour targets are achieved.
- Candidate private generated images are bounded to 2.5 MB and expire at 24 hours; job metadata cleanup is 30 days. Five-minute sweep cadence and a last-success alarm are required. Database backups can outlive app deletion; record actual expiry and suppress deleted identities when recovering.
- Legacy tables still reference external media. Their actual R2/S3/local storage location, access policy, lifecycle and independent recoverability are unverified. No new R2 bucket is required for the subscriber DB-backed result path; do not add one merely because legacy code contains storage helpers.
- GitHub repo had only a Neon API secret, no configured Production ops secrets/vars; `main` protection API returned unprotected, and Preview/Production environments had no protection rules. Restrict production operational secrets to trusted default-branch jobs. This is a concrete secret-boundary fix, not a request for enterprise process.
- Weekly metrics email and HTTP health alone do not detect payment/generation quality. Prove Stripe failed-delivery notifications, provider budget/quota alerts and operator receipt; avoid photo/receipt/email/token payloads in logs.

## Ordered cutover and go/no-go

Run in parallel: approved cost/credential setup; mailbox/merchant/policy confirmation; sandbox payment/journey work; alert wiring. Database migration and web/worker cutover are sequential dependencies.

1. Finish final source pin and full required checks. Review new prerequisite migration/test. Record final frontend/worker digests; keep isolated staging and production credentials separate.
2. Finish sandbox journey, load/failure/refund evidence, and received-alert test. Resolve failures before touching production schema.
3. Freshly assert live endpoint/branch mapping, record aggregate baseline and recovery point. Execute only the rehearsed additive migrations on the explicitly authorized production target. Compare billing invariants; configure/test restricted roles.
4. Deploy compatible worker and web with purchases closed. Verify exact runtime hosts, Clerk issuer, CORS, webhook signatures/delivery, signed-in portal, result ownership/recovery, retention and deletion queues.
5. Recheck all gates below and obtain recorded owner go/no-go. Only then change the application purchase flag/edge gate for owned one-time pack checkout. Keep standalone links and all recurring acquisition off. Observe the first sales window with a named operator.

Launch gate:

- [ ] Final pinned web/worker/migrations deployed to intended account/hosts; costs accepted.
- [ ] Signup, sign-in/out and one free trial work from desktop and real mobile HEIF.
- [ ] Starter/Value/Pro display, sandbox Checkout, receipt and ledger agree; duplicate/abandoned/declined/late payment cannot grant twice.
- [ ] Model failure/timeout restores funding once; result download/reopen does not charge again; another user cannot retrieve it.
- [ ] Failed-payment recovery, billing history and legacy renewal/cancellation remain available; new recurring checkout rejected.
- [ ] Support roundtrip received; app and merchant contact correct; primary/substitute, coverage and refund escalation recorded privately.
- [ ] Account deletion blocks stale sessions/new reservations, purges app media and records external cleanup; signed callback retry works.
- [ ] Sweep, stale-job/refund/image expiry, dead-man alarm, failed webhook and budget alert reach the operator.
- [ ] Recovery mapping/restore procedure rehearsed without promoting a clone; financial/media/deletion reconciliation passes with approved recovery targets.
- [ ] Public status/privacy/terms/tax/refund/processor claims match actual behavior.
- [ ] Pack acquisition remains closed until all applicable boxes pass; first paying-customer observation and pause procedure ready.
