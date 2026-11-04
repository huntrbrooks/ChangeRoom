# Staging account deletion — 4 November 2026

Sales remain paused. This verification uses only the disposable synthetic account created by the staged signup/recovery test. It does not delete the paid fixture, the ordinary-email test account, or any production account. No model call or Stripe mutation is part of this test.

## Configuration and target

The protected staging Clerk webhook initially returned HTTP 500 `webhook_not_configured`. The Preview environment lacked `CLERK_WEBHOOK_SECRET`, and Clerk reported `svix_app_missing`. Both were real configuration gaps, rather than failed deletion events; no account was deleted at that point.

The authorized remediation created the development Clerk instance's Svix application through the official Clerk API and exactly one enabled endpoint:

- URL: `https://changeroom-rehearsal-stage.vercel.app/api/webhooks/clerk`
- Event filter: only `user.deleted`
- Deployment protection access: a private Svix custom header; no access-bearing query string
- Matching generated signing secret: sensitive **Preview-only** Vercel variable

The frontend was archived from exact revision `75abce1e2fce3840ea120cebd279eca67db26391`, built in isolated project `changeroom-rehearsal`, and assigned only to the protected staging alias. Deployment: `dpl_F7W1AHgGzSvS6uqZRUr5U41uoAxj`. Pending documentation edits were excluded. The immutable URL remained protected before aliasing. The initial deploy harness stopped before aliasing because the CLI returned a full URL; the result was normalized and the existing deployment was reused without another build.

The final no-mutation preflight verified that the staged endpoint returns HTTP 400 `missing_svix_headers` for an unsigned request, the closure migration exists on the authoritative staging database endpoint, and the recovered synthetic account has exactly 0 credits, 1 unused trial, no Stripe customer/subscription, no credit ledger, no assets/jobs/checkouts, and no existing closure. The API key, issuer, endpoint/branch, project, alias, and exact disposable identity are guarded by the private harness.

## Evidence

Private receipts and scripts are in `~/.local/state/changeroom/staging-20261104/deletion-verification/`. Credentials and raw provider payloads stay there and are not committed.

The real Clerk API deletion returned 200 with `deleted=true` for the exact disposable ID. Svix's actual resulting `user.deleted` message reached the hosted route and received HTTP 200. No locally signed or synthesized event is described as provider delivery.

The focused live integration assertions **passed** after the first delivery and again after one provider Replay of that same message:

| Assertion | Observed result |
| --- | --- |
| Original signed delivery | HTTP 200; exact `{received: true, type: "user.deleted"}` response |
| Provider Replay | A distinct second HTTP-200 delivery attempt of the same message; no second deletion or synthetic event |
| Closure | Exactly one row, `billing_state=resolved`, no error |
| Duplicate behavior | Closure `requested_at`, profile deletion timestamp, billing and data counts unchanged by Replay |
| Profile | One tombstone; email, first name, last name and image URL all null |
| Product data | No jobs, saved outfits, sessions, person/garment records, affiliate clicks or outstanding media cleanup |
| Financial state | 0 credits, 1 unused trial, no Stripe mapping, zero ledger entries; unchanged |
| Authentication provider | Clerk GET for the deleted ID returned 404 |

Commands executed from the private directory, using the isolated Python environment and installed official Svix SDK:

```sh
python test_actual_deletion.py preflight
python test_actual_deletion.py delete
node svix-stage.cjs messages
python test_actual_deletion.py verify-first
node svix-stage.cjs replay
node svix-stage.cjs messages
python test_actual_deletion.py verify-replay
```

All completed successfully. `delete` and `replay` have exclusive attempt journals and intentionally refuse automatic repeat submissions. The verification commands are read-only. Receipts include `closure-deployment.json`, `preflight.json`, `deletion-response.json`, `provider-deletion-proof.private.json`, `first-delivery.json` and `replay-verification.json`. Python compilation and `node --check svix-stage.cjs` also passed. These commands are focused real integration assertions, not a claim that the entire repository suite was rerun.

## Limits

This account has no stored media, active generation, paid credits or recurring subscription. This provider-path proof does not independently prove refunding an in-flight job, external media removal, closing a Stripe subscription or handling an ordinary user's delete-account UI. Those behaviors need their separate integration and unit evidence. Production Clerk configuration has not been changed or verified by this task.

The endpoint's private deployment-protection header must be updated on future staging bypass rotations. The signing secret does not need to change for that access-token rotation. This endpoint subscribes only to deletion; it is not evidence that created/updated user synchronization is configured.


## Staging bypass rotation and provider delivery

After all browser checks finished, the staging deployment-protection bypass was rotated using the official [Vercel project API](https://vercel.com/docs/rest-api/projects/update-protection-bypass-for-automation). Only the isolated staging project was targeted. The replacement was generated while the old secret was valid; the **existing** Stripe sandbox endpoint URL and Svix custom header were updated and re-read before old-secret revocation. No webhook endpoint was duplicated, no signing secret changed, and deployment protection stayed enabled for all deployments. Local private `bypass.env`, `stripe-stage-webhook-url` and browser-access cookie files now hold the replacement.

Verified after propagation:

- New header: **200**; fresh browser cookie: **200**.
- Revoked old header: **401**; old browser cookie: **401**.
- No header/cookie: **401** with `Accept: application/json`; browser-style access redirects to Vercel sign-in.
- Project configuration: exactly one remaining valid bypass and protection still set to `all`.
- Svix's stored custom header matches the replacement. No extra deletion event was generated for rotation.

The rotation harness stopped safely at an initial browser/API content-negotiation difference and at transient propagation assertions. It reconciled phase receipts and completed only the remaining steps; it did not generate additional replacements or revoke the new secret. Final read-only access assertions passed.

One real Stripe CLI resend of the **original paid Starter Checkout completion event** then exercised the rotated endpoint. Vercel request logs record exactly one POST to `/api/webhooks/stripe` on deployment `dpl_F7W1AHgGzSvS6uqZRUr5U41uoAxj`, **HTTP 200 at 05:36:40.445 UTC**. Stripe reported zero pending webhooks. The paid fixture remained at the post-refund **108 credits**, with the same complete ledger snapshot and exactly one original Starter grant. This action created no purchase or refund. The separate Value refund had already been performed by the lead operator.

Private proofs: `rotation-access-proof.json`, `rotation-provider-proof.json`, `rotated-stripe-resend.json` and the raw private Vercel request log. The focused `test_rotated_stripe.py` assertions and request-log assertion passed. The scoped Svix portal session was logged out after verifying the new header; provider deliveries do not depend on that administrative session. Future administrative changes require a fresh authorized Clerk/Svix portal session.
