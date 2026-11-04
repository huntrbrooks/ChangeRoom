# Dependency review — 4 November 2026

Frontend `npm audit --omit=dev` reported zero known advisories. This is a package audit, not a complete application security guarantee. Frontend Jest initially passed 151 cases with 9 integration cases skipped. A separate disposable PostgreSQL run then passed all 9 integration cases (160 across the two runs). Backend verification similarly passed 78 offline and 9 real-database cases. Skipped cases were not counted until that separate database run succeeded.

The worker's lock was captured from the Linux/amd64 image used for the successful staging rehearsal. Its 52 pinned package entries and pinned Python base digest now prevent floating package resolution on deploy. The pinned image rebuilt successfully for Linux/amd64 and passed the actual container checks: non-root UID 10001, startup refusal with missing configuration or fallback-only configuration, health/auth/CORS and HEIF handling. GitHub’s Linux container check also passed for revision `01ccc0a`. The release operator subsequently verified hosted staging deployment `dep-dblc0mbm8hqs738rm7a0` at revision `75abce1`. That revision uses the same pinned lock. This is staging evidence, not a production promotion.

`pip-audit` reported two distinct advisories (one duplicated by the advisory feed):

| Advisory | Actual application use and decision |
| --- | --- |
| `GHSA-wj6h-64fc-37mp` / `CVE-2024-23342`, ecdsa 0.19.2 | A signing/key-generation/ECDH timing issue. The application verifies Clerk RSA signatures and does not use ECDSA signing or key generation. Not applicable to the current call path; package remains a transitive python-jose dependency. |
| `GHSA-3qf3-8w2g-rqmx` / `CVE-2026-85394`, python-jose 3.5.0 | Algorithm confusion when callers accept HMAC with an asymmetric public key. `backend/services/auth.py` pins `algorithms=['RS256']`. A new real-signature regression test constructs the HMAC forgery using DER RSA public bytes and confirms HTTP 401. Real RS256 succeeds; expired/wrong-issuer tokens fail. No available fixed version was reported. |

Ten focused authentication tests passed. These are documented, scoped non-applicability decisions, not suppressed findings or a claim that the packages have no vulnerabilities. Reassess if algorithm support, token signing or crypto use changes. Never remove the RS256 allowlist to accommodate another token type.

Run `uvx pip-audit -r backend/requirements.lock` during dependency maintenance. Keep audit output private when it contains local environment details. Original audit receipts are in the operator's temporary release-validation files.

## Default-branch alert triage

A read-only GitHub Dependabot API query on 4 November 2026 independently confirmed 74 open alerts (5 critical, 41 high, 24 moderate, 4 low):

| Manifest | Open alerts | Candidate disposition |
| --- | --- | --- |
| `frontend/package-lock.json` | 1 moderate, 1 low | Development-only `minimatch` and `deepmerge`; see below. |
| `my-yolov8-app/backend/requirements.txt` | 5 critical, 33 high, 16 moderate | Separate YOLO application's Pillow 12.2.0. Candidate worker pins Pillow 13.0.0, which matched **none** of the 54 advisory ranges in this API snapshot. |
| `my-yolov8-app/frontend/package-lock.json` | 8 high, 7 moderate, 3 low | Separate application's older Vite/transitive packages; canonical frontend versions listed below are outside those advisory ranges. |

The candidate frontend has no Vite or esbuild package. Its matching package versions are `source-map-js` 1.2.2, `browserslist` 4.29.5, `nanoid` 3.3.20, `postcss` 8.5.32, `baseline-browser-mapping` 2.11.35 and `@babel/core` 7.29.7. Every relevant npm advisory range from the snapshot was compared with all canonical lockfile occurrences. All 5 critical and 41 high alerts belong to the separate YOLO manifests; none establishes an additional vulnerability in the selected subscriber artifacts.

This does **not** dismiss the YOLO findings or prove that application is unused: legacy `render.yaml` still defines a separate YOLO service. The subscriber worker's `backend/` build context, allowlisted `.dockerignore`, explicit Dockerfile copies and `render.production.yaml` exclude that tree; frontend CI uses `frontend/`. Do not deploy the legacy multi-service blueprint as the subscriber launch path. Review YOLO separately if it is served.

Canonical development dependencies still include `minimatch` 10.2.6/3.1.5 ([GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249), moderate; fixed in 11.0.1) and `deepmerge` 4.3.1 ([GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4), low; no fixed version listed). No direct subscriber request-path import was found in the reviewed app/lib or worker source. Keep these visible as build/test-tool maintenance, with untrusted PR builds isolated from production secrets; `npm audit --omit=dev` intentionally excludes them. No alert was dismissed and no unrelated application was patched.

## Pinned base-image validation limit

The selected base is `python:3.11-slim-bookworm@sha256:94a8fee35252d06ab75856f15f12c7bae67b10e8a6da93c7fded82b2610926cd`. A read-only command in the local candidate image confirmed Python 3.11.18, Pillow 13.0.0 and Debian 12, including libc6 `2.36-9+deb12u14` and libssl3/openssl `3.0.22-1~deb12u2`. Pinning provides reproducibility; it does not certify that OS packages are vulnerability-free. A requested Docker Scout scan could not run because the local Docker identity was not signed in. Thus this review adds **no verified OS advisory**, but leaves a whole-image/OS advisory scan as an explicit release validation item; the pip/npm audits do not cover it. Record the scanner result against the exact release image before making an all-dependencies-cleared claim. No Docker account, credential, image or deployment settings were changed.
