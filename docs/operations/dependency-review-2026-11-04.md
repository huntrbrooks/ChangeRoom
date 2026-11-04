# Dependency review — 4 November 2026

Frontend `npm audit --omit=dev` reported zero known advisories. This is a package audit, not a complete application security guarantee. Frontend Jest: 151 passed, 9 integration tests skipped without the dedicated Postgres test configuration; do not count skipped tests as passes.

The worker's lock was captured from the Linux/amd64 image used for the successful staging rehearsal. Its 52 pinned package entries and pinned Python base digest now prevent floating package resolution on deploy. Rebuild validation is required before promoting the new Dockerfile.

`pip-audit` reported two distinct advisories (one duplicated by the advisory feed):

| Advisory | Actual application use and decision |
| --- | --- |
| `GHSA-wj6h-64fc-37mp` / `CVE-2024-23342`, ecdsa 0.19.2 | A signing/key-generation/ECDH timing issue. The application verifies Clerk RSA signatures and does not use ECDSA signing or key generation. Not applicable to the current call path; package remains a transitive python-jose dependency. |
| `GHSA-3qf3-8w2g-rqmx` / `CVE-2026-85394`, python-jose 3.5.0 | Algorithm confusion when callers accept HMAC with an asymmetric public key. `backend/services/auth.py` pins `algorithms=['RS256']`. A new real-signature regression test constructs the HMAC forgery using DER RSA public bytes and confirms HTTP 401. Real RS256 succeeds; expired/wrong-issuer tokens fail. No available fixed version was reported. |

Ten focused authentication tests passed. These are documented, scoped non-applicability decisions, not suppressed findings or a claim that the packages have no vulnerabilities. Reassess if algorithm support, token signing or crypto use changes. Never remove the RS256 allowlist to accommodate another token type.

Run `uvx pip-audit -r backend/requirements.lock` during dependency maintenance. Keep audit output private when it contains local environment details. Original audit receipts are in the operator's temporary release-validation files.
