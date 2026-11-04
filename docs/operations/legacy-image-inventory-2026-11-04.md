# Legacy image inventory — 4 November 2026

This is a metadata-only production review, not evidence that all legacy files were erased. No customer image, full image URL, storage key, user identifier or image bytes were fetched or included in the report. No production data or bucket settings were changed.

## Production database evidence

At 05:42 UTC, a connection to the independently identified production Neon database used certificate verification, `default_transaction_read_only=on` (checked in the session) and an eight-second statement timeout. Only aggregate counts and coarse URL/key classes were returned.

| Table | Rows / owners | Stored representation |
| --- | --- | --- |
| `clothing_items` | 343 / 4 | 341 URLs shaped like Render `/uploads/` locations and garment-prefixed keys; two other HTTP URLs/other key prefixes. |
| `person_images` | 0 / 0 | No stored references in this table. |
| `tryon_sessions` | 0 / 0 | No stored result references in this table. |
| `user_outfits` | 92 / 4 | All 92 `image_url` values are inline `data:image/…`, not remotely fetchable HTTP image locations. |
| `tryon_jobs` | 0 | No candidate jobs in production at the time of this read. |

The legacy outfit GET route requires Clerk authentication and calls `getUserOutfits(userId)`, whose query filters by owner. The inline values therefore do not establish a publicly accessible result URL. This review did not repeat a cross-account penetration test of the legacy deployment. A garment-prefix or garment-table record is a classification, not proof that its pixels contain only clothing or that publication was consented to.

No R2 configuration values were available in the scoped Vercel runtime used for this check. Vercel also warned that sensitive environment values cannot be pulled. This **does not establish that R2 is absent** from the old Render service or that a bucket is empty. No bucket enumeration or object availability test was performed.

Private aggregate evidence and the guarded read-only script are retained under the operator's `production-readiness-20261104` state directory. They contain no image locators or bytes.

## Candidate call sites

- `frontend/app/page.tsx`: `preprocessModelPhotos` only changes local state. Person and garment files remain local until Generate; the canonical multipart request still targets the worker. A successful response must match the issued job ID, and the displayed result is the app's `/api/try-on/jobs/{id}/result`, rather than an arbitrary worker URL.
- `backend/main.py`: the preprocessing/analysis/storage endpoints return 410; there is no `/uploads` static mount. The subscriber endpoint rejects saved garment URLs, processes uploads in memory and settles result bytes through `services/tryon_jobs.py`. The legacy `services/storage.py` and `model_photo_processor.py` files still exist but are not called by this route.
- `frontend/app/api/try-on/jobs/[id]/result/route.ts`: requires the current user, an owned successful job, stored result bytes and a result less than 24 hours old. Responses use `Cache-Control: private, no-store`. `/api/try-on/recent` is likewise owner-scoped and age-limited.
- `frontend/app/api/save-person-image/route.ts`, `/api/my/clothing-items` POST and `/api/my/outfits` POST return 410. Legacy owner-scoped GETs remain for existing records. Merely returning an old HTTP URL through an authenticated API does not make the storage object private.
- `database/migration_account_closure.sql` deletes owned inline outfits and candidate results, and separately inventories legacy key/HTTP references for reviewed external cleanup. It does not delete files from Render or a bucket. `migration_tryon_jobs.sql` removes expired result bytes in bounded batches; verify the deployed scheduled sweep independently of access expiry.

These findings describe candidate source. Until its matching worker and frontend are released, the paused production site still has the old behavior. The old `52893dd` worker mounts `/uploads` without an ownership check and preprocessing writes model references under `model/<date>/…`, independently of the `person_images` table. Consequently, an empty person table cannot exclude orphaned person photos on the old service or its storage backend.

## Customer-facing scope

The candidate pricing table says garments remain in the current session and results are recoverable for 24 hours; About and How It Works make the same limit explicit. `MyOutfits` has no current homepage mount. The old Shop & Save selector is inside the homepage's hidden legacy layout; its code and legacy bookmarking APIs are not a verified new persistent-wardrobe feature.

At 05:45 UTC, the live canonical pricing page still showed sales paused and billing/cancellation access. Live About still described AI garment tagging and reusing saved looks. Those are old-release claims, already replaced by narrower candidate copy. Release the matching candidate marketing/help pages with the new flow; do not reopen sales while retaining the old feature promises. No additional copy change was needed for this finding.

## Smallest remaining verification and response

1. Identify the **old** worker's effective storage type, bucket/custom-domain settings and local upload persistence from its provider configuration. Record counts by approved garment, person/model and result prefixes; do not export photos or customer filenames. Confirm whether that service remains suspended or reachable.
2. If person/model/result objects remain publicly readable, quarantine those specific prefixes or move them behind owner authorization before restoring the legacy service. Verify with a disposable/synthetic object. Preserve unrelated catalog assets; do not bulk-delete a bucket based on a client-supplied key.
3. For the candidate production release, verify owner access succeeds, anonymous access returns 401, another account returns 404, results older than 24 hours are unavailable, and the scheduled sweep removes expired bytes. Keep the existing deletion queue's external-cleanup gate until provider/file/backup checks are complete.

No public exposure of a person/result was demonstrated by this inventory. Legacy static storage exposure remains a concrete architectural risk requiring configuration/object metadata validation. A new subscriber flow using the protected result route does not by itself remediate or erase old objects.

## Provider follow-up at 07:42 UTC

The original Render workspace reports suspension for non-payment. Its ChangeRoom service `srv-d4l1p4ali9vc73e21c5g` is **Suspended by Render**, with last successfully deployed source `1253b345fcb80f69895a97df3b167ae05157275c`. That actual deployed source still mounts `/uploads`; the earlier source review remains relevant but is not the deployed revision identifier. HEAD requests to the service root and a nonexistent synthetic uploads path both returned 503. The service was not resumed or modified.

The current service environment has no `STORAGE_TYPE` setting and no linked environment groups. Its `.env` secret file contains nonempty R2 configuration entries, but likewise no `STORAGE_TYPE`; the deployed storage module defaults to local storage. This supports local storage as the configured default, not a proof of historical runtime state or file erasure. The Disk page says disks are unsupported with the service's scaling configuration; it did not provide a file inventory.

A read-only request to the exact R2 account/bucket configured in that secret file returned **404** from `HeadBucket`. No object listing was possible, and no objects, customer filenames, image bytes or public object URLs were downloaded or emitted. A missing/inaccessible configured bucket is not proof that all historical buckets or uploads are gone. Keep the legacy service suspended; any future resumption must first remove its public static-media path and complete the historical storage review. Private evidence: `legacy-render-containment-proof.json` and `legacy-r2-metadata-proof.json`.
