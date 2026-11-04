# Production environment plan

Prepared 2026-11-04. **No deployment, paid service, credential change or sales reopening is authorized by this file.** The cost review is in the operator's private `~/.local/state/changeroom/production-readiness-20261104/cost-review.md`. Production topology and migration proof are in the [cutover inventory](production-cutover-inventory-2026-11-04.md).

Apply service configuration only after cost review and final source pin. The production schema and restricted database logins described below were prepared and verified on 4 November; deployment and complete customer-journey checks are separate gates. Values below are public configuration or secret names; real keys/DSNs belong in provider secret stores.

## Vercel: existing production project only

Project: `changeroom`, team `gerard-grenvilles-projects`. Runtime target: Production. Root directory `frontend`; existing Node 24.x. Rebuild after changing public variables because Next.js embeds them in the frontend bundle.

| Variable | Intended assignment / verification |
|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://igetdressed.online`; exact origin used by owned Checkout, cancel and portal return URLs. |
| `NEXT_PUBLIC_API_URL` | Exact HTTPS origin of the **new approved production Render worker**, after its deployment is verified. Do not use the rehearsal worker or continue pointing at legacy `changeroom.onrender.com`. The new service URL is not yet assumed. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Existing live app's publishable key; decoded issuer must remain `clerk.igetdressed.online`. It is intentionally public, but do not paste it in reports. |
| `NEXT_PUBLIC_CLERK_FRONTEND_API` | If retained, `clerk.igetdressed.online`, consistent with the publishable key. |
| `CLERK_SECRET_KEY` | Secret for the same live Clerk application. Check environment and instance ownership without printing. |
| `CLERK_WEBHOOK_SECRET` | Secret for the exact live signed Clerk endpoint. A configured name is not proof of delivery; test account-deletion/retry behavior in sandbox first. |
| `STRIPE_SECRET_KEY` | Existing live account `acct_1SZUOrDWNatk2HyV`; no staging/sandbox key on Production. |
| `STRIPE_WEBHOOK_SECRET` | Exact enabled endpoint at `https://igetdressed.online/api/webhooks/stripe`; reconcile candidate event types before cutover. |
| `STRIPE_STARTER_PRICE_ID` | `price_1SedQEDWNatk2HyVhW5pzkXv`: A$14.99 / 10. |
| `STRIPE_VALUE_PRICE_ID` | `price_1SedQGDWNatk2HyVNCmHUgOH`: A$34.99 / 30. |
| `STRIPE_PRO_PRICE_ID` | `price_1SedQGDWNatk2HyVbeZDkHUI`: A$89.99 / 100. |
| Historical Stripe IDs | Preserve existing Christmas/Creator/Power IDs for historical settlement and account management; they must not become new purchasable offers. |
| `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `DATABASE_URL`, `POSTGRES_URL_NON_POOLING` | Every defined candidate must point to `neondb` on the same production endpoint: direct `ep-proud-bonus-a778rjt6.ap-southeast-2.aws.neon.tech` or its `-pooler` hostname. `frontend/lib/db.ts` prefers a pooled candidate, so validating only `DATABASE_URL` is insufficient. Web requires the reviewed app-owner role for this release. |
| Other provider-injected DB aliases | Check `DATABASE_URL_UNPOOLED`, `PGHOST`, `PGHOST_UNPOOLED`, `PGDATABASE` against the same mapping. Do not overwrite masked values just to inspect them. |
| `TRYON_FREE_CREDITS` | `0`: one free preview is represented by `trials_remaining=1`, not a new paid-credit grant. Preserve existing customer balances. |
| Staging switches | Production should not receive `CHANGEROOM_TEST_CHECKOUT`, `CHANGEROOM_ISOLATED_PREVIEW` or `CHANGEROOM_STAGING_*` pins. Keep test-only configuration in the separate rehearsal project. |
| Optional admin/demo/analytics | Audit only features being retained. Keep operator IDs/secrets server-side. If Frontrunner demo remains enabled, prefer a distinct `FRONTRUNNER_DEMO_COOKIE_SECRET`; this is configuration hardening, not evidence of a paid-generation bypass. Existing analytics/provider settings need consent/retention and necessity review, not blind removal. |

`NEW_PURCHASES_ENABLED=false` remains source-controlled in `frontend/lib/purchase-availability.ts`. There is no production env override that should be used to bypass the gate. Signed webhooks and billing management remain available. Reopening requires a reviewed source change after all launch gates pass; new subscriptions remain rejected independently.

Existing production-project Preview has not been proved isolated and previously shared live credentials. Do not enable candidate branch preview builds there. Continue with separate `changeroom-rehearsal` test services. Vercel sensitive values could not all be exported during inventory; use scoped runtime assertions/metadata with only pass/fail output to verify them.

## Render: one new production worker, after approval

Prepared manifest: `render.production.yaml`. One Docker web service, Singapore, manual deployments, initially Starter 512 MB with concurrency one. Keep exact deployment commit/image digest in the private release record; `branch: main` alone does not identify a tested build.

| Setting | Intended value / secret boundary |
|---|---|
| `BACKEND_AUTH_MODE` | `clerk` |
| `CLERK_ISSUER` | `https://clerk.igetdressed.online` |
| `CLERK_JWKS_URL` | Omit to derive from issuer, or exact `https://clerk.igetdressed.online/.well-known/jwks.json`. |
| `CLERK_AUDIENCE` | Set only if the actual live Clerk session token has the corresponding audience; do not invent a value. Verify token issuer/audience privately. |
| `ALLOWED_ORIGINS` | Manifest currently allows `https://igetdressed.online,https://www.igetdressed.online`. Verify alias redirect behavior and supported customer origins; include other owned origins only if they intentionally serve the app. |
| `ALLOWED_ORIGIN_REGEX` | Absent; container validation rejects origin regexes. |
| `MAX_TOTAL_SIZE` | `31457280` (30 MiB multipart file total); request middleware adds its bounded multipart overhead. |
| `MAX_FILE_SIZE` | Default 10 MiB unless the final tested release explicitly sets another limit. |
| `TRYON_CONCURRENCY` | `1`; capacity testing, not autoscaling, determines whether a larger plan is needed. |
| `TRYON_DATABASE_URL` | TLS DSN for a dedicated non-owner production worker login on the exact live DB. Only CONNECT, schema USAGE, and EXECUTE on claim/settle/extra functions. No customer table reads, owner membership, superuser or BYPASSRLS. |
| `OPENAI_API_KEY` | Production-scoped Images credential with verified account/model access, budget, quota and expiry. Staging's one-day key is not a production credential. |
| `GEMINI_API_KEY` | Optional separate fallback credential; production availability, retention and spend reviewed independently. No hidden default fallback-only deployment. |
| `PORT` | Render-injected; Docker entrypoint validates it. |

Do not copy web database-owner credentials, Stripe secrets or Clerk secret keys into the worker; JWKS verifies its bearer tokens. The subscriber result path persists in PostgreSQL and needs no new persistent disk, Redis or R2 bucket. Legacy image cleanup still requires inventory of the original external store.

## Database and GitHub operations

Current live endpoint → branch is `ep-proud-bonus-a778rjt6` → `br-snowy-brook-a7slxiau`. Recheck immediately before any change: the snapshot restore incident demonstrated that branch names alone are unsafe.

Two separate production logins, `tryon_production_worker` and `tryon_production_ops`, were created with explicit SQL `CREATE ROLE ... LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION`, separate privately generated random passwords, and verified effective grants. **Do not use Neon Console/API/CLI role creation for runtime credentials**: those interfaces grant administrator membership. Follow the [restricted role provisioning and actual-login checks](restricted-database-roles.md) for replacements; do not rerun provisioning or rotate verified credentials merely to inspect them. Root has verified SQL-created staging login `tryon_rehearsal_ops`; the unused API-created `tryon_rehearsal_sweeper` must not be installed.

Required role separation:

- Worker: CONNECT, public schema USAGE; EXECUTE only `tryon_claim(uuid,text)`, `tryon_settle(uuid,text,bytea)`, `tryon_extra(uuid,text,text)`.
- Sweeper: CONNECT, public schema USAGE; EXECUTE only `tryon_sweep()`, `tryon_ops_counts()`, `closure_ops_counts()`.
- Both: no public table SELECT, no role membership granting broader privileges, no function-owner/superuser/BYPASSRLS rights. Confirm the relevant functions remain revoked from PUBLIC.

Actual TLS logins, not owner-session `SET ROLE`, passed these checks on production: all elevated attributes false; no memberships or owned objects; no public table/sequence privileges; exact worker-three/ops-three function grants; five representative direct table reads denied. Absent-job worker probes returned denied/false/false without creating or funding rows; both operations aggregate functions returned zero. `tryon_sweep()` execution was granted but not run or scheduled during provisioning. Private `production-credentials.env` contains only `TRYON_DATABASE_URL` and `CHANGEROOM_SWEEP_DSN`; it and `production-role-proof.json` are mode 0600 in the mode-0700 operator directory. These credentials had not been installed to Render or GitHub at this verification point.

The five reviewed migrations from commit `75abce1e2fce3840ea120cebd279eca67db26391` applied to the asserted live target as 41 statements in one transaction after fresh snapshot `snap-autumn-math-a7hxpx0y` (created 05:25:17 UTC, expires 11 November). All ten preexisting tables retained identical complete-row fingerprints immediately after migration and again after role verification. The future-row free-trial default changed from two to one; existing values were untouched. Exact checksums, snapshot metadata and before/after aggregate evidence are in private `production-launch-migration-evidence.json`. No historical bulk migrations or data cleanup ran.

GitHub Environment `production`, trusted default branch only:

| Type | Name | Assignment |
|---|---|---|
| Environment secret | `CHANGEROOM_SWEEP_DSN` | Verified-TLS unpooled DSN for the restricted sweeper login, never web owner/worker. |
| Environment variable | `CHANGEROOM_APP_ORIGIN` | `https://igetdressed.online`. |
| Environment variable | `CHANGEROOM_API_ORIGIN` | Exact approved new production worker HTTPS origin. |
| Environment secret | `CHANGEROOM_APP_PROTECTION_BYPASS` | Leave absent for public production custom domain. It is used only in access-controlled staging; monitor never forwards it to worker. |
| Repository variable | `SUBSCRIBER_OPS_ENABLED` | Keep absent/false until required SQL/grants exist and manual staging/production checks pass; set `true` only for approved scheduled operation. |

Protect the production environment/default branch; make the five-minute scheduled job noninteractive on trusted code. Configure failure and dead-man notifications to the named operator and prove receipt. GitHub tests use only their disposable local database, never any of these secrets.

Read-only GitHub inventory on 4 November found only `Preview` and `Production`, both without environment protections or branch policy, no environment secrets/vars, no repository rulesets, and unprotected `main`. The repository-scoped `NEON_API_KEY` and `NEON_PROJECT_ID` exist but have no references in current candidate code or GitHub's default-branch code search. Treat their scope/necessity as unresolved; environment controls do not retroactively restrict a repository secret. No secrets or settings were changed during this inventory. See the [safe staging operations setup and split plan](staging-operations-setup.md).

Subsequent authorized hardening enabled `main` PR protection with zero required reviewers, administrator enforcement, blocked force pushes/deletion, and required conversation resolution. No required CI contexts or bypass allowances were added. Fresh exact-tree audits found no Neon API-key references in the three default-branch workflows or the four candidate workflows. The repository secret remains unchanged; see the [verified controls, deliberate exceptions and audit scope](github-protection-2026-11-04.md).

The five-minute sweep can prevent Neon auto-suspend, so the cost review budgets continuous minimum compute. The user approved 0.25–1 CU / 300-second suspension; this exact change was applied to `ep-proud-bonus-a778rjt6` and independently verified at **2026-11-04 05:22:46 UTC**, with the branch mapping and complete wallet/ledger row digests unchanged. No schema/data/role change accompanied the sizing update. Production cold-start/load acceptance remains separate. Private receipt: `approved-neon-sizing-evidence.json` in the cost-review directory.

## Verification before promotion

1. Confirm each secret's provider account/environment and every DB alias endpoint with redacted booleans. Record release IDs privately.
2. Confirm exact origin allowlist and Clerk issuer with a signed-in ordinary staging user; verify auth across mobile and desktop, including the signup challenge.
3. Run restricted-role allow/deny checks, webhook event coverage, wallet/ledger invariants and job recovery.
4. Prove no new Checkout while paused, billing/portal access, private results and retention, and human receipt of alert/support messages.
5. Only deploy the compatible final pin after costs are accepted; repeat production configuration checks with sales still closed. Reopen owned packs only after the full checklist in the launch runbook passes.
