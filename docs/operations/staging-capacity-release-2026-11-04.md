# Staged capacity release — 4 November 2026

Sales remain paused. This report covers the isolated staging release, not a production cutover or permission to reopen purchases.

## Matched artifacts

- Source: `efb86f03cc77e03394a7918856cdfec117d60e1f`.
- Render staging service: `srv-dbl70o942hec739ppd6g`, deployment `dep-dblcmqjbc2fs73dtc04g`, reported **Live** after 36.1 seconds.
- Vercel isolated Preview project: `prj_hEBVKwbeBEQpG5ClneU5hQh7a8YZ`, deployment `dpl_9HPnPguNjApMsRDk9FMn5CDhweuk`. The immutable frontend archive was built in that project, then assigned only to `changeroom-rehearsal-stage.vercel.app`. Deployment protection remained enabled.
- Worker health returned 200 with `X-ChangeRoom-Stack: fastapi-worker`; an anonymous try-on returned 401 with correlation and the exact staging CORS origin. Its preflight returned 200.

## Automated verification

All applicable GitHub checks passed on this source: API/database, backend, frontend, lint/test/build, Linux worker container and the configured Snyk check. Skipped review bots were not counted as validation.

Complementary local offline and disposable-PostgreSQL runs passed **93 backend cases, 177 frontend cases and 50 operations cases**, plus the recovery drill, TypeScript, repository-standard ESLint and Next.js production build. The local temporary PostgreSQL 18.6 cluster was restricted to loopback, used only disposable test databases and was stopped afterward. GitHub's database checks used its isolated PostgreSQL environment. There were five existing ESLint internal-navigation warnings and no errors; no warnings were suppressed. These totals combine separate runs rather than describing one invocation.

## Actual browser preparation

The signed-in storefront's active upload controls were used with synthetic files, without generating from the test patterns:

| Input | Browser result |
|---|---|
| 8000 × 6500 JPEG, 1,120,735 bytes | JPEG preview decoded at **2200 × 1788** |
| 4032 × 3024 HEIC, 51,385 bytes | Converted JPEG preview decoded at **2200 × 1650** |

The browser visibly disabled Generate, upload, sample and Change controls during preparation, then restored them. The balance remained 108. This verifies an actual browser/codec path, but the HEIC file was synthetic: it is not evidence of capture, metadata or memory behavior on a physical iPhone.

## Real credit-funded generation

The existing synthetic paid buyer uploaded the approved mannequin and striped-shirt fixtures through the same storefront and submitted one real generation. The Render POST returned 200 in approximately **14.9 seconds** to response headers. The private result and recent-results APIs returned 200. The downloaded JPEG was 1024 × 1536 and visually showed the two-stripe shirt on the mannequin, with no evident missing body region. This is one functional/visual sample, not a statistical quality, p95 latency or provider-cost measurement.

The visible balance changed **108 → 107**. Independent read-only checks against the pinned staging database found one successful credit-funded job, exactly one `hold` entry of -1 and one zero-valued debit marker, and a 40,957-byte private result. Ledger row count changed 16 → 18; net credits changed 108 → 107. There was no release or duplicate charge. After reload and reopening the image from Recent looks, the full ledger and job/result digests remained unchanged. Signing out and navigating to the image required sign-in instead of showing the result.

This staging worker was configured with the OpenAI credential and no Google fallback credential. The database does not store the provider/model name; its settlement record alone is not provider attribution. No fallback request or new Stripe charge was made during this test. Earlier sandbox pack/decline/refund evidence is recorded separately in [the edge verification report](staging-edge-verification-2026-11-04.md).

## Operations and trial follow-up

[Staging operations run 41784295625](https://github.com/huntrbrooks/ChangeRoom/actions/runs/41784295625), dispatched from trusted main `8650138`, passed both availability and database sweep jobs at 06:15 UTC against the new staging release. No production schedule or secret was changed. This proves execution, not receipt of an operator alert.

At 06:17 UTC, the existing ordinary-email signup fixture had **0 credits, 1 unused trial, no ledger entries and no jobs**. The owner completed the new-device email verification in the browser. One actual storefront trial then returned worker HTTP 200 in approximately **14.3 seconds**. Independent read-only database checks at 06:42 UTC verified **trials 1 → 0**, credits unchanged at 0, no ledger entries, and exactly one successful owner-bound trial job with no privileged bypass. The downloaded 1024 × 1536 JPEG visibly contained the trial footer; an independent raster check matched its expected footer and brand text. The UI offered a 1-credit try-on next. A later reload retained zero credits and no free-trial offer; Recent looks reopened the result at 1024 × 1536, and clicking the next 1-credit try-on routed to pricing. Signing out and reopening the result required sign-in. This proves the observed exhausted-trial transition and private-result follow-up, not physical-device behavior.

The deliberate failure notification for run 41780755147 was independently found in the operator’s configured personal Gmail inbox, received at 05:41 UTC. This proves failure-email delivery. A separate actual missing-heartbeat and recovery email drill subsequently passed; see the dated follow-up below.

A later isolated frontend deployment `dpl_2H4drFDQacfZt1tCcqMLFENR1Lm1` served `b4ebea605b8ade0dfe6c0a742445408fe0c89ab2`, adding the owner-approved legal identity and documentation. Worker code remained identical to `efb86f03`; the generation evidence above was collected before this copy-only deployment.

## Hardened-worker and card-Checkout follow-up — 07:35 UTC

The staging worker was manually rebuilt from `7bc2bd821898521abb489f9c00f2d07a75ab5a10`, deployment `dep-dbldqrdbedkc73ab8c40`, and reported Live at 07:24:22 UTC. Its Dockerfile removes unused installation tools after locked dependency installation and validation. All required canonical checks passed; anonymous public probes returned health 200, try-on 401, exact-stage CORS 200, and production/untrusted-origin preflight 400 with no allow-origin header. Correlation/stack headers passed on every probe. The local scanned image digest is not claimed as Render's built-artifact digest; these probes made no model or authenticated job call.

The separate protected frontend deployment `dpl_JT12qmtia8PWnio4TKhkCGneRiKj` serves source `ac085e0e128338be8e73cfb01348845b5e925bef`, whose frontend tree is unchanged in `7bc2bd8`. Its owned Checkout route explicitly sets `payment_method_types: ['card']`; 32 focused tests, targeted lint and TypeScript checks passed. A real route request produced an unpaid sandbox Starter Checkout for A$14.99 / 10 credits with the right owner and return origins. The balance stayed 107, trials 0, ledger 18 rows/net 107. Browser presentation still offered Apple Pay and Link card wallets; no delayed non-card method was shown. This is method/amount/no-grant verification, not another completed payment.

Heartbeat-only PR19 merged into trusted main `7d7110a`. Staging operations run [41790193150](https://github.com/huntrbrooks/ChangeRoom/actions/runs/41790193150) succeeded and pinged at 07:08:37 UTC. Deliberately withholding the next ping triggered the DOWN message in the business Inbox at 07:28:37, exactly 20 minutes later. Recovery run [41792845730](https://github.com/huntrbrooks/ChangeRoom/actions/runs/41792845730) passed; its UP email arrived at 07:31:33, reporting 2m54s downtime. The staging-only check was then paused because staging has no scheduled operations. Production's separate check has never been pinged, and its schedule remains disabled. No production monitoring completion is inferred from this drill.

## Remaining boundary

The bounded container measurements are in [the capacity report](worker-capacity-2026-11-04.md). Production worker credential installation, funded model access, compatible production deployment, live callbacks, operating production cleanup/alerts and remaining owner decisions remain release gates in [the runbook](subscriber-launch.md). An always-on production worker has different CPU and cold-start behavior from this free staging service.

Private screenshots, sanitized network timings, fixture dimensions and deployment receipts are under `~/.local/state/changeroom/staging-20261104/capacity-release/`. Local validation logs are under `/private/tmp/changeroom-full-validation-20261104/efb86f03/`. Keep credential-bearing handoffs separate; do not publish them with this report.
