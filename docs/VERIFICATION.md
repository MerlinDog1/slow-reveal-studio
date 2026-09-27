# Verification record — 27 September 2026

This records software checks for the prototype and its follow-up workflow improvements. It is not approval of a physical kit or live commercial service.

## Current integrated follow-up

- `npm run typecheck`: passed after the replacement, release-policy, photo-analysis and operator-review changes.
- `npm test`: **50 cases, 48 passed, zero failed, two optional browser raster/EXIF checks skipped by default**. The separately enabled photo browser check passed all eight EXIF orientations; that does not cover every mobile camera/browser combination.
- `npm run build`: passed with only the approved default Dot Lab generated. Alternative-mode availability requires explicit physical approval and a rebuild.
- New trust-boundary coverage includes order/request-scoped replacement uploads, immutable paid originals and proof attestations, idempotent submission, concurrent/stale requests, current-source regeneration, uncommitted package cleanup, proof-hash approval and retention of interrupted intake.
- The earlier dependency audit remains applicable to the unchanged dependency lockfile. All 35 final production trace manifests contain zero references to private `.data/` files; `git diff --check` passed. Local fixture data and test credentials remain ignored.

The new guest flow was exercised through the actual UI on an isolated local adapter, with a synthetic paid-order fixture and licensed repository photographs. No payment provider or mail service was configured or called:

1. The production desk displayed exact lettering, current warnings, kit contents and mark count. Editing crop blocked print approval and package download; undo restored the loaded revision.
2. An operator requested an alternate photo. The private order page showed the request note and required photo permission before submission.
3. A different photograph was selected through the file chooser, cropped, privately saved and rendered into a new revision. Both stored proof images loaded; approval stayed disabled until explicit consent.
4. The operator desk showed the replacement source and kept print approval blocked until the customer approved that revision's proof hash. After customer approval, the separate physical-validation gate still rejected print approval.
5. Stored records confirmed the original paid snapshot hash was unchanged, the replacement source differed, and exactly one revision and one matching proof approval were appended. The order stayed `awaiting-review`; an absent customer email left its notification pending rather than falsely claiming delivery.

Screenshots: [replacement proof pair](replacement-proof-preview.png), [mobile approval confirmation](replacement-approval-mobile.png), [restored landscape editor](photo-advice-preview.png), [mobile photo advice](photo-advice-mobile.png). These are local test evidence, not real orders or completed kits.

At 390 × 844, the editor and order proof page had no horizontal overflow; both private proof images loaded. The desktop editor restored the saved 50 × 40 cm photo and lettering, displayed retained-source advice and explicitly reported unavailable face detection. No browser console errors or warnings occurred in these checks. Removed-catalogue-option scenarios were reviewed in source but have not been exercised against a live changed database catalogue.

Release HTTP checks returned 200 for home, creator, Dot Lab and studies, 404 for the three unapproved experimental labs, and 401 for the unauthenticated admin API. The experimental-route 404s emitted Next.js internal `NoFallbackError` diagnostics on the local server; the HTTP responses remained 404 and no lab content was served. The public catalogue exposed only Dots and kept live checkout disabled.

## Earlier baseline checks

- `npm run typecheck`: passed after final code integration.
- `npm test`: 33 cases; 32 passed, zero failed, one optional workstation-browser raster comparison skipped by default.
- Separate font raster QA: shared vector lettering checked with browser and Sharp rasterizers; dark-mask overlap 97.5–98%, with residual antialiasing differences. Supported accented text was visually inspected.
- `npm run build`: passed, including all four static lab routes and dynamic private APIs; no build warnings.
- `npm audit --omit=dev --audit-level=high`: zero vulnerabilities reported.
- All 32 production trace manifests inspected: zero references to private `.data/` files.
- `git diff --cached --check`: passed. The environment file, local photos and development data are ignored; `.env.example` contains placeholders only.
- Eight-photo renderer benchmark and contact sheet regenerated for `slow-reveal-geometry/1.1.0`. Metrics measure digital behaviour, not human recognisability or hand completion.
- All 14 marketing slots and 28 WebP derivatives verified against their manifests. Web derivatives preserve the originals and reduce transfer sizes.

Tests cover geometry limits/gaps/determinism, physical SVG/PDF dimensions, transparent print templates, safe outlined text, authentication, file signatures, pricing and size authority, canonical-proof changes, payment/webhook invariants, immutable revisions, concurrency, quotas, retention/source ownership, notification retries/key rotation, consent and public indexing boundaries. Payment and email transports are fixtures; no real charge or email was made.

## Browser checks

The app was exercised in the Codex in-app browser at 1280 × 900 and 390 × 844:

- Real reference images render into dots; Easy and Standard change workload. Original, finished and template views display; keyboard controls activate.
- A licensed black-dog fixture was loaded through the actual file chooser, rotated to a landscape canvas, personalised, saved locally and reviewed in the basket. Landscape proportions and the 50 × 40 cm summary were inspected.
- Rights confirmation precedes private upload. The private save succeeded; the finished and template server proofs loaded. Proof approval remained disabled until both views were opened.
- The private capability link reopened successfully. Continuing to the studio restored the source, 50 × 40 cm dimensions and personalised lettering.
- Live payment remained unavailable. Test artwork was stored only in the ignored local adapter.
- Desktop/mobile editor screenshots were inspected. The homepage record is [studio-preview.png](studio-preview.png).
- No browser console warnings/errors were observed during these checks. The in-app browser did not expose a completion event for Blob-based SVG downloads, so browser download completion remains unverified. Production archive/SVG/PNG/PDF contents are verified in the automated suite; check customer downloads in a normal desktop/mobile browser before release.

The production server was also started locally on port 3001 for HTTP checks: homepage, creator, Dot Lab, studies, robots and sitemap returned 200; unauthenticated administrator API access returned 401.

## Not established by these checks

Real-device/screen-reader accessibility, remote service credentials and RLS/storage configuration, mail deliverability, live/test Stripe integration, production monitoring, physical print accuracy, marker compatibility, customer completion time, packaging, commercial pricing and legal approval require further evidence. Full scope remains mapped in [BUILD_STATUS.md](BUILD_STATUS.md).
