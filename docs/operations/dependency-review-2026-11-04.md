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

## Whole-image scan and minimal hardening follow-up

The earlier Docker Scout sign-in block is superseded by a completed local Grype 0.121.1 scan using its 3 November database. The selected base remains `python:3.11-slim-bookworm@sha256:94a8fee35252d06ab75856f15f12c7bae67b10e8a6da93c7fded82b2610926cd`: Python 3.11.18, Debian 12.15, libc6 `2.36-9+deb12u14`, OpenSSL `3.0.22-1~deb12u2`. Pinning provides reproducibility, not vulnerability clearance.

Hardening commit `fc97cd9fe93d7057df56bfb470f1fd8e9f6b902b` removes pip, setuptools and wheel **after** locked installation and `pip check`. The final runtime has no package-build requirement. This removes setuptools' separate vendored jaraco.context and wheel findings; changing top-level wheel alone would not remove its vendored copy. The verified local image is `sha256:bd10bc3caa5a41d811eee8df00b1c8c73f9ecfad9c5c73141daeca130f72cf08`.

| Controlled scan | Critical | High | Medium | Low | Negligible |
| --- | ---: | ---: | ---: | ---: | ---: |
| Before installer removal | 4 | 60 | 113 | 17 | 87 |
| After installer removal | 4 | 58 | 107 | 15 | 87 |

Exactly ten findings disappeared and none were added. The remaining 62 critical/high package matches collapse to **26 unique advisories**; package/source duplicates inflate raw counts. No findings were suppressed. Scanner exit 0 means successful execution, not zero vulnerabilities.

The new image passed non-root/installer-absence/HEIF/auth/CORS/container smoke and **84 offline backend cases inside a network-disabled, 512 MiB container**; nine PostgreSQL cases were intentionally skipped there, not counted as new passes. All 52 locked versions, all 20 application Python files, all 598 native shared-library hashes and the dpkg inventory match the earlier capacity-tested processing path. This supports carrying that bounded capacity evidence forward, without inventing a new worst-case peak measurement.

### Residual findings and limits

| Finding group | Current evidence and remaining action |
| --- | --- |
| python-jose algorithm confusion; ecdsa timing | The scoped RS256-only/verification-only decisions above still apply. Re-review on any algorithm/signing change. |
| glibc `CVE-2026-5450` (critical) | Requires scanf-family `%mc` with explicit width greater than 1024. No such app interface or operation was found. This is not an exhaustive proof over all bundled native codecs. Bookworm has no listed fix; trixie fixes this issue but not every residual finding. |
| SQLite `CVE-2025-7458` (critical) and four high matches | The worker uses PostgreSQL and accepts neither SQLite SQL, database files nor session changesets. SQLite was not loaded in the representative app/HEIF/auth/driver smoke. FTS5 and SESSION are compiled in, so compile-time absence must not be claimed. One newer advisory's version applicability remains inconsistent. |
| libstdc++ aligned allocation/heap findings | Native image codecs load the library. No triggering operation was demonstrated, but exact native build/call-path proof is incomplete. This is a material reachability limit; a library-name search alone cannot dismiss it. No fixed stable-distro version was listed. |
| Other glibc, libtasn1, zlib and utility findings | Prerequisites include special locale/format operations, ASN.1 expansion, nonblocking gzip-file writes, or local privileged/archive/terminal operations not demonstrated in the worker. zlib has a documented version-mapping conflict. Preserve the individual prerequisites and vendor status rather than declaring the image clean. |

The full private `dependency-review/REVIEW.md` records all 26 advisories, primary vendor links, exact prerequisites and patch limitations. No same-release Debian fixed version was reported for the remaining high/critical OS matches. A pinned base-release upgrade would fix some but not all and requires native compatibility/capacity validation. Do not mix distribution releases or downgrade decoders solely to reduce counts.

Candidate `7bc2bd8` contains identical Dockerfile/lock/smoke blobs to the reviewed hardening commit. Canonical CI and hosted staging deployment `dep-dbldqrdbedkc73ab8c40` passed; [staging evidence](staging-capacity-release-2026-11-04.md) records the exact boundary. Render built from source: the local scanned image digest is **not** proof of its hosted artifact digest. The frontend runtime audit similarly does not attest Vercel artifact contents.

Whole-image scanning is now completed, with unused installer vulnerabilities removed and named residuals assessed with explicit limits. Record a dependency-maintenance owner/date and each residual technical disposition before launch; do not treat this report as blanket business risk acceptance or a claim that a remote exploit was established. Repeat the review when relevant native/auth behavior changes or maintained distro fixes become available.
