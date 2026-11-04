# Staging operations workflow setup

Prepared 2026-11-04 from candidate `75abce1e2fce3840ea120cebd279eca67db26391`. [Draft PR #17](https://github.com/huntrbrooks/ChangeRoom/pull/17), commit `a7952ae146c70730b1a114ef2f2ab6eb65fdf3fe`, contains exactly the four operations files below on fresh remote main. No merge, GitHub credential installation or production schedule activation was performed by this preparation.

## Read-only GitHub inventory

Repository `huntrbrooks/ChangeRoom` is public; default branch is `main`. Remote main was `52893dd9810affa3da290f62d03408d89819be53` during inspection. Existing environments are `Preview` and `Production`, each with empty protection rules and no deployment-branch policy. Both have no environment secrets/variables. There is no `staging` environment, branch protection on `main`, or repository ruleset.

Repository secret `NEON_API_KEY` and variable `NEON_PROJECT_ID` exist. Candidate tracked-code search and GitHub default-branch code search found no references; this does not prove what the key can access or whether an external integration needs it. Do not print it to investigate. Review its provider scope and ownership, then remove or relocate an unused/admin key through a separate controlled step. A repository secret can be requested by a modified same-repository workflow; adding environment protection does not constrain that existing repository secret.

Actions defaults: read-only GITHUB_TOKEN, workflow PR approval disabled, all actions allowed, SHA pinning not required, approval for first-time contributors. No `pull_request_target` trigger was found in the reviewed workflows. Candidate CI uses disposable local Postgres with synthetic credentials; it does not load Neon/Vercel/Doppler secrets. Fork PR protection helps with forks but does not replace protection of trusted same-repository code.

The production Vercel project has `previewDeploymentsDisabled=true` and `gitForkProtection=true` per the root operator's raw project read. Main-branch merging still has a production-build consideration. Root separately confirmed current deployed frontend source is the same `52893dd` baseline.

## Small independent PR

Copy only these four files from the reviewed candidate into a **fresh checkout of remote main**, not the unrelated/stale local `main` history:

| File | Source Git blob |
|---|---|
| `.github/workflows/subscriber-operations.yml` | `f257014f18ca7771a760d3c09e649073884268f3` |
| `scripts/ops/sweep.py` | `1303201ad85b8deee0062545f65f5cf84c1980a4` |
| `scripts/ops/monitor_http.py` | `21929b03d855d5d021496705fba51ace843643e3` |
| `scripts/ops/tests/test_monitor_http.py` | `04a57621e26ce471fc80771db17a8f3ca59bccab` |

This introduces no frontend, worker, database migration or model/billing dependency changes. The monitor uses Python's standard library; the sweep requires the runner's `psql`. The three monitor tests require pytest and passed locally; the candidate's full operations suite subsequently passed all 50 cases in GitHub, including PostgreSQL 16 integration, and its recovery drill passed.

The scheduled jobs are gated by absent/false `SUBSCRIBER_OPS_ENABLED`. Dispatch is allowed only from the default branch and requires target `staging` or `production`; the PR branch cannot exercise the privileged job. No environment credentials are part of the PR.

Review the four-file diff and pass applicable checks. Coordinate with the separate one-file support-contact PR, which touches only `frontend/app/pricing/page.tsx`; they do not overlap. If that PR merges first, update the ops branch to the new main without importing candidate application changes. Record production deployment and pause state before merge; after any Vercel rebuild verify the pause and billing boundaries again. Do not cherry-pick a mixed candidate release commit just to obtain the ops workflow.

## Configure staging safely, after restricted-role verification

Root has verified SQL-created `tryon_rehearsal_ops`. Do **not** use the unused API-created administrator login `tryon_rehearsal_sweeper`. Follow [actual-login assertions](restricted-database-roles.md).

1. As repository administrator, create `staging` explicitly **before adding secrets**. Select “Selected branches and tags”; add only a **Branch** rule named exactly `main`. Do not add a tag or wildcard. API shape: `deployment_branch_policy={protected_branches:false,custom_branch_policies:true}`, followed by branch policy `{name:"main",type:"branch"}`. Protect/review default-branch workflow and script changes separately.
2. Use the existing `Production` environment for future production jobs; names are case-insensitive. Restrict it to the exact main branch before any production operational secret is installed. Keep scheduled jobs noninteractive on trusted code; a reviewer prompt every five minutes would stop cleanup. Stage manual operation can use an available maintainer review if desired without inventing a new paid team requirement.
3. Configure only the staging values below. Do not install any secret until the root operator confirms the restricted login and exact endpoint mapping again.
4. Keep the repository `SUBSCRIBER_OPS_ENABLED` absent/false. This workflow's automatic schedule targets production, not staging.
5. After the dedicated PR is reviewed and merged, manually dispatch `subscriber-operations.yml --ref main -f target=staging`. Inspect both jobs. The first run must prove protected web health, worker stack marker, bounded cleanup and aggregate monitoring without a model request or Stripe call.
6. Test a controlled staging probe/grant failure and received notification, restore the valid configuration, then prove green. Keep production scheduling off until production migrations/roles and alert delivery are ready. Add a last-success/dead-man alert; a green historical run is not monitoring.

GitHub documents that an implicitly created environment has no protections by default; configure it first. Public repositories support these environment controls without an added paid plan. [GitHub environment configuration](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).

| Scope | Name | Exact staging assignment |
|---|---|---|
| Environment variable | `CHANGEROOM_APP_ORIGIN` | `https://changeroom-rehearsal-stage.vercel.app` |
| Environment variable | `CHANGEROOM_API_ORIGIN` | `https://changeroom-rehearsal-worker.onrender.com` |
| Environment secret | `CHANGEROOM_SWEEP_DSN` | Private DSN for SQL-created `tryon_rehearsal_ops`, database `neondb`, direct host `ep-billowing-bar-bb2324fe.c-15.us-east-1.aws.neon.tech`. |
| Environment secret | `CHANGEROOM_APP_PROTECTION_BYPASS` | Existing scoped staging Vercel protection bypass; pass directly to GitHub secret storage, never a PR, repository-level secret or log. |

Fresh provider metadata confirmed staging endpoint `ep-billowing-bar-bb2324fe` → `br-icy-bread-bbzngw6q` in `empty-bird-73072158`. Production endpoint `ep-proud-bonus-a778rjt6` must not appear in the staging DSN. The workflow forwards the web protection bypass only to the configured app origin, never worker, and refuses redirects.

## Remaining gates

- Main/workflow protection and any unused repository-level Neon administration key need owner review; no compromise or secret disclosure is established by this inventory.
- The exact four-file PR must be reviewed/merged without accidentally importing an old app release or reopening acquisition.
- Environment policy must precede secret installation; actual-login SQL tests must precede DSN installation.
- Manual staging success plus deliberately received failure/dead-man alert is required before calling operations ready.
- Production activation is a later explicit step after its schema, restricted roles, costs and customer journey pass.

## Manual hosted workflow evidence — 4 November 2026

After PR17 merged at `8650138`, root configured the GitHub `staging` environment to accept only the `main` branch, installed the independently verified restricted operations DSN and rotated storefront bypass, and set exact staging origins. No repository-wide or production secret was used. Run [41780421507](https://github.com/huntrbrooks/ChangeRoom/actions/runs/41780421507) passed both availability and cleanup, with all stale/closure counters zero.

For one deliberate failure rehearsal, only the staging `API_ORIGIN` variable temporarily pointed at the protected staging storefront. The worker probe sends no storefront bypass and refuses redirects; [41780755147](https://github.com/huntrbrooks/ChangeRoom/actions/runs/41780755147) correctly failed availability on HTTP302 while cleanup passed. The correct worker origin was restored in a finally block. Recovery run [41780784285](https://github.com/huntrbrooks/ChangeRoom/actions/runs/41780784285) passed both jobs. No purchase, model request, production configuration or data was changed. This proves scheduler execution and failure detection; it does not by itself prove operator notification receipt or an independent missing-heartbeat alert. Production scheduling remains disabled.
