# Worker capacity verification — 4 November 2026

**Result:** the original 512 MiB candidate failed a valid boundary input. The revised worker rejects that input before decoding or charging and completes bounded ten-image requests with measured memory headroom. This supports proceeding with the approved single-instance 512 MiB / 0.5-CPU configuration; it is not proof of hosted latency, sustained traffic capacity, or the complete paid journey. Sales remain paused.

## Verified issue and changes

The original image `sha256:110f6652a037c75d73ccd90b17bd1d8c1fbf0f545ef74b9a222eb31c19c93883` accepted 52,000,000-pixel references. A valid 6500×8000 RGBA PNG caused Docker to report `OOMKilled=true`, exit 137, while decoding the first file. It had not reached a database claim or provider call. Compressed file size did not bound the decoded image/EXIF copies.

The corrected code:

- `backend/services/image_normalize.py` rejects input above 6,000,000 pixels before pixel decode, applies EXIF orientation in place, and fails instead of silently continuing after an unsuccessful resize.
- `backend/services/subscriber_image.py` and `backend/main.py` compact a reference before retaining the next upload if its encoded bytes exceed its share of the 13,500,000-byte provider budget. They reuse the existing 1250-pixel, JPEG-quality-78/white-background compaction. This prevents ten normalized RGBA PNGs from accumulating; each stress input expanded from 3 MiB to about 19.36 MB before compaction.
- `backend/services/tryon_jobs.py` rejects provider results above 4,000,000 pixels before result decode. The requested primary output is 1024×1536; the fallback requests 1K. An oversized provider result follows the existing failure/refund path.
- `GenerationAdmission` authenticates and acquires the shared slot before multipart parsing on both `/api/try-on` and `/api/identify-products`. A busy request returns 429 without reading its body, claiming a job or consuming an auxiliary authorization. The existing per-request byte cap remains in effect.
- The active homepage person/garment handlers now prepare images sequentially at at most 2200 pixels on the longest side. They show progress and prevent generation while preparing. Failed conversion cannot silently keep the original file; it offers export/resize guidance. Earlier 2200-pixel settings were in hidden legacy UI, and the previous optimizer skipped small-in-bytes JPEGs regardless of dimensions. They were not evidence that the active uploader already resized phone photos.

Reference rejection returns actionable HTTP 413 before the credit/trial claim. The six-million-pixel server guard remains mandatory even with the browser preparation step. The original 10 MiB per-file client limit is unchanged; files above it require a smaller export. Genuine device/codec acceptance still needs browser validation.

## Offline measurements

Final reviewed image: `changeroom-worker:capacity-reviewed-20261104`, digest **`sha256:f4b32efc1122ee48f840b476fc0a14e6efae96c9aab43250fb15d5e83af8697a`**. It contains the final shared admission guard for both image-bearing routes and preserves correlation/stack headers on early rejects. No image was pushed or deployed by this experiment.

All containers had `--network none`, `--memory 512m --memory-swap 512m`, concurrency one, a read-only root and a 64 MiB `/tmp` tmpfs. The multipart request had five person and five garment files, each 3 MiB, totaling exactly 30 MiB plus allowed framing. The accepted textured input was a 2449×2449 RGBA PNG (5,997,601 pixels), close to the input pixel ceiling while maximizing the normalized 2200-square output. Valid ancillary PNG padding brought compressed files to the upload-byte boundary. No customer photos or credentials were used.

The actual FastAPI parser, normalization, reference preparation, provider serialization/parsing and private JPEG generation ran. Only Clerk identity verification, SQL calls and provider HTTP transport were intercepted. The provider fixture returned a structured primary 503 and a successful fallback image; there was no external network or model charge. The normal stress result was a 2000×2000 noisy RGB PNG, 12,019,084 bytes. A further valid PNG padded to 14,990,000 bytes produced 19,986,668 base64 bytes, close to the existing 20,000,000-byte provider-response cap.

| Image / workload | CPU quota | Outcome | Peak cgroup memory | Peak process RSS | Elapsed offline |
|---|---:|---|---:|---:|---:|
| Original image, accepted 52 MP input | 0.5 | OOM, exit 137 on first decode | At least 510.1 MiB sampled before kill | 452,440 KiB sampled | About 2.3 s before kill |
| Final image, same 52 MP input | 0.5 | HTTP 413; zero claims/provider calls | 99.41 MiB | 90,868 KiB | 1.40 s |
| Final image, two consecutive textured 5+5 requests + 4 MP near-limit encoded response | 0.5 | Both HTTP 200; one claim/settlement each | 352.67 MiB | 351,860 KiB | 18.89 s first; 37.47 s cumulative |
| Same bounded image path, slower rehearsal CPU | 0.1 | HTTP 200; no OOM | 353.93 MiB | 356,940 KiB | 169.80 s |

The 0.1-CPU measurement used intermediate image `sha256:6246b9f9d766f8d4febca9f171437e67547357c54f8fb7ecc1ef417528a48dba`, which has the same bounded image-processing path; the final image additionally extends admission to the auxiliary image route and makes correlation middleware outermost. The final image was then rechecked at 0.5 CPU. Cgroup peaks include tmpfs spooling and the in-process offline client/fixture; process RSS is recorded separately. The largest final test retained about 159 MiB below the hard container limit.

Timing is from a Linux amd64 image under Docker Desktop emulation on an arm64 Mac. Provider latency and real Clerk/DB networking are excluded. These numbers do not establish Render response-time targets. The 480-second generation timeout starts after upload preparation; upstream/client limits must also cover preparation and settlement. A 0.1-CPU free instance is not evidence of acceptable production latency.

## Verification and remaining gate

**Follow-up:** the committed source `efb86f03` subsequently passed full CI and disposable-database checks and was deployed to both staging services. Actual browser JPEG/HEIC preparation and a real credit-funded try-on passed; see [the staged release evidence](staging-capacity-release-2026-11-04.md). The offline results below retain their original scope and do not describe that later hosted run.

- Backend offline suite: **84 passed, 9 PostgreSQL integration tests skipped** because this run supplied no test database. The final source still requires its normal CI PostgreSQL/recovery checks.
- New meaningful tests cover header rejection before decode, inclusive pixel/orientation handling, per-reference byte bounding, actionable rejection without a claim, and overlapping requests. The busy try-on/auxiliary requests and an unauthenticated request read zero multipart bytes; only the admitted request reaches one claim and settlement.
- Frontend: **17 focused tests**, TypeScript and targeted ESLint passed. Active remove/sample/change controls cannot replace state during preparation; cancellation/unmount stops further decoding and ignores late progress/results/errors. Canvas/HEIC behavior in those tests is mocked, so they do not substitute for an actual phone/browser check.
- Final container smoke checks passed for required configuration, primary-provider presence, non-root UID, port/liveness, auth, CORS and real synthetic HEIF decoding.

Keep `TRYON_CONCURRENCY=1`, `MAX_TOTAL_SIZE=31457280` and `MAX_FILE_SIZE=10485760`; do not increase workers/replicas or pixel/response limits using this evidence. Re-pin the reviewed source after commit, pass CI, deploy with sales closed, and confirm actual hosted memory, latency, ordinary signup/photo preparation and paid-job/refund behavior. No 2 GiB upgrade is justified by the measured bounded request path alone.

Private reproducible fixture generators, probe, full Docker exit states, source image pins and `capacity-evidence.json` are under `~/.local/state/changeroom/production-readiness-20261104/capacity/` (the initial generator is `capacity_make_fixtures.py` in its parent). The probe must retain `--network none`; its replacement credentials and identities are literal offline fixtures. These artifacts contain no customer data or service credentials.
