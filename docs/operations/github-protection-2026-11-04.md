# GitHub main protection — 4 November 2026

The release operator authorized a minimal protection rule for `huntrbrooks/ChangeRoom`'s default branch, `main`. Fresh REST reads found no branch protection and no repository rulesets. Those conditions were checked again immediately before the targeted update; the script would stop if a concurrent rule appeared. No existing rule was replaced.

Independent REST readback verified:

| Control | Effective setting |
|---|---|
| Pull request before merge | Required |
| Required approving reviews | 0 |
| Apply protections to administrators | Enabled |
| Force pushes | Blocked |
| Branch deletion | Blocked |
| Resolve review conversations | Required |
| Explicit PR bypass users/teams/apps | None |
| Required status checks | None |
| Separate repository rulesets | None before or after |

The API supports zero required reviewers while retaining the pull-request requirement. The exact REST field meanings and update contract are documented in [GitHub's branch-protection API](https://docs.github.com/en/rest/branches/branch-protection#update-branch-protection).

## Deliberate exceptions and operating limits

- There is one repository owner/collaborator, `huntrbrooks`. Zero approvals allows this sole owner to merge a reviewed PR; it does not provide independent human review. Code-owner review and last-push approval are disabled for the same reason. The owner must still use a PR and resolve conversations.
- No new status contexts were made mandatory. The existing default-branch YOLO checks do not represent the canonical ChangeRoom application. The release operator must inspect the intended candidate's frontend/backend/refund/recovery results before merging. Configure exact required canonical contexts only after the corresponding workflows are on `main` and reliably report those names.
- Signed commits, linear history and branch locking were not added. The rule preserves normal PR merge operation. This task did not change merge methods, GitHub Actions policies, collaborators, service credentials or repository secrets.
- Administrative enforcement is enabled with no configured bypass allowance. A repository owner can still edit protection settings; the rule is protection against accidental/direct writes, not a boundary against the account owner changing policy.

## Repository Neon secret audit

The audit fetched the exact remote `main` tree at `8650138f40b6330fae85895c3fb7bc5ffa65d13d` and each workflow blob. Its three workflow files were `ci.yml`, `frontend-ci.yml` and `subscriber-operations.yml`. No `NEON_API_KEY` or `NEON_PROJECT_ID` reference was found. No whole-secret JSON, indexed-secret access or inherited-secret pattern was found in those files.

Candidate `75abce1e2fce3840ea120cebd279eca67db26391` contains those workflows plus `changeroom-backend.yml`; the same reference scan was empty. GitHub's workflow listing includes this backend workflow even though its file is not yet on `main`, so the two source pins are recorded separately. The two dynamically managed Dependabot workflows are not repository YAML and were not treated as application workflows.

The repository-scoped `NEON_API_KEY` remains unchanged. Current inspected application workflows do not need that broad credential; the operations workflow uses a restricted database login in its explicit environment. Recommend removing the unused repository-secret copy after checking any other maintained branch or external workflow dependency. This is not a recommendation to revoke a provider key used elsewhere without an ownership check. This audit does not prove the key was never used historically or that an arbitrary future workflow could not reference it.

Private before/after API receipts and pinned workflow-blob audit are in `~/.local/state/changeroom/production-readiness-20261104/github-main-protection-{before,after}.json` and `github-current-workflows-neon-audit.json`. No secret values are in these files.
