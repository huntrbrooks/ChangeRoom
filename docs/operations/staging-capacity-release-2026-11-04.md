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

At 06:17 UTC, the existing ordinary-email signup fixture had **0 credits, 1 unused trial, no ledger entries and no jobs**. Its password was accepted by the new browser, which then requested new-device email verification. The message reached the business inbox. The connector withheld its authentication code, so the browser was handed to the owner. No trial generation was submitted or claimed complete. Ordinary signup/recovery evidence from the preceding test remains valid; actual trial consumption still requires completion.

## Remaining boundary

The bounded container measurements are in [the capacity report](worker-capacity-2026-11-04.md). Production credentials, model budget enforcement, compatible production deployment, live callbacks, scheduled operations/received alerts and the owner confirmations remain release gates in [the runbook](subscriber-launch.md). An always-on production worker has different CPU and cold-start behavior from this free staging service.

Private screenshots, sanitized network timings, fixture dimensions and deployment receipts are under `~/.local/state/changeroom/staging-20261104/capacity-release/`. Local validation logs are under `/private/tmp/changeroom-full-validation-20261104/efb86f03/`. Keep credential-bearing handoffs separate; do not publish them with this report.
