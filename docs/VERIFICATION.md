# Verification record — 28 September 2026

This records software checks for the prototype and its follow-up workflow improvements. It is not approval of a physical kit or live commercial service.

## Print calibration, PNG dimensions and proof handoff - 28 September

- Final integrated `npm run typecheck`, `npm test` and `npm run build` passed. Tests: **75 cases, 73 passed, zero failed, two existing opt-in browser checks skipped**. The release still generates only the Dot Lab by default. All 40 production trace manifests exclude private `.data/` files; formatting and `git diff --check` pass.
- Lab PNG export now replaces the browser resolution chunk with matching physical DPI: 150 DPI for the template and 50 DPI for the smaller finished preview in the ZIP. Focused tests decode the result with Sharp, verify pixel/alpha and other PNG chunks are unchanged, validate CRCs and check physical dimensions within pixel/pixels-per-metre rounding. PDF page dimensions remain explicit millimetres.
- Four A4 coupon pages contain 34 unique diameter/gap/guide-width/opacity candidates, shared guide and outlined-font serialization, X/Y 100 mm rules and a 20 mm square. The filled-reference sheets are digital targets. The observation record has no filled measurements or approvals.
- Poppler rendered all four final PDF pages for visual inspection: no clipping/overlap was found. `pdfinfo` and independent `pypdf` checks confirmed four 210 x 297 mm page boxes with 2480 x 3508 pixel image resources. The local public PDF endpoint returned 200, `application/pdf`, and bytes identical to the canonical PDF (1,089,166 bytes; SHA-256 `b17c7549a644bdc481143edcb97e0bec2063abde7842fa11541b34fe64acd32b`). This verifies digital dimensions, not printer scaling or material performance.
- The enlarged preview uses a native modal. In the in-app browser, opening focused Close; background controls disappeared from the accessible modal view; the comparison slider remained keyboard-operable; Escape and Close restored focus to Enlarge. The 390 x 844 check had a 358 px dialog without horizontal content overflow. Closing removes the extra SVG tree. SVG serialization is memoized across comparison-position updates. No console warnings/errors were observed. [Screenshot](enlarged-preview-accessibility.png).
- A lab PNG export was attempted through the in-app browser, but its download-event API timed out without returning a file. No browser error appeared. Automated metadata/export-boundary tests passed; a captured end-to-end browser download is still not claimed.
- Revised customer-proof emails are queued atomically with eligible administrator-generated revisions. Tests cover one stable notification per revision, failure/retry without re-rendering, private-link access, exclusion of internal notes/personalisation/photo metadata, stale revision rejection, suppressed obsolete notices, missing key/email and concurrent delivery. Independent review found no material issue. No real email was sent. An email already accepted by a provider cannot be recalled after a later change; messages identify their revision and point to current order status.
- No dependency or lockfile changes. All physical trials, real service delivery/RLS/auth and commercial/legal approvals remain open. Docker is installed but its local engine was unavailable, so the PostgreSQL migration regression remains unexecuted.

## Operator accounts, shared presets and customer guides — 28 September

- `npm run typecheck`: passed after the final account, preset, catalogue and guide integration.
- `npm test`: **64 cases, 62 passed, zero failed, two optional browser raster/EXIF checks skipped**. The previous separately enabled EXIF/font checks remain historical evidence, not new runs.
- `npm run build`: passed with the new public guides, dynamic administrator page and preset APIs; the default production build still generates only Dot Lab.
- All 40 production file-trace manifests exclude private `.data/` content. Dependencies and lockfile are unchanged. All 12 guide WebPs, two sources and three geometry snapshots matched manifest hashes and dimensions in an independent read-only check.
- New tests verify provider-validated identity and active private membership on each request, operator/reviewer permissions, loopback-only token access, safe public browser credentials, immutable preset versions and publication, stale/concurrent writes, public field projection, catalogue failure/empty/removed/changed selections, explicit legacy-renderer review and device-storage failures.
- Independent review fixed a refresh/mutation race in the operator UI and a SQL NULL comparison in the preset revision trigger. The rollback-only `supabase/tests/preset_revision_guard.sql` exercises the actual trigger/RPC, but **has not been run against PostgreSQL**. Migration 004 and real Supabase sign-in, session refresh, revocation and RLS remain deployment verification gates.

The in-app browser exercised the following against local servers. The operator flow used the isolated ignored local adapter and a synthetic order; no live service credentials, payment or email transport were configured:

1. The ordinary development desk displayed an unconfigured account message with no shared-token form. Explicitly configured loopback QA allowed local operator access. Sign-out removed the private orders and presets and cleared the token input.
2. A new preset stayed absent from the public endpoint until publication. The customer editor displayed and applied public version 1. Saving version 2 kept version 1 public; explicit publication changed it to version 2. Selecting version 1 and reloading preserved that historical view. Unpublishing removed the public entry; archive and restore retained two versions and restored only a draft.
3. The public preset response contained only `id`, `version`, `name`, `description`, `mode`, `settings` and `rendererVersion`. The lab Copy action displayed success; the in-app clipboard read API returned empty, so clipboard payload transfer is not claimed as independently verified. Automated allowlist tests verify the settings projection.
4. A legacy local design required explicit renderer rebuild. It retained its 50 × 40 cm orientation and exact “Moose · September 2026” lettering, and Save/Review remained disabled until current size/finish review. After an explicit save, reopening did not repeat the legacy-renderer warning and still required catalogue review.
5. Existing authenticated order previews loaded after the auth refactor. Changing the crop disabled print approval and package download; undo restored the loaded crop. The fixture's immutable paid original and replacement history were not changed by this check.
6. The photo guide and homepage personalisation were inspected at desktop width. Photo/canvas guides and the homepage size section were inspected at 390px width with no page overflow. The proportional diagram has a labelled, focusable horizontal scroll region. No console warnings or errors were observed in the checked guide, editor or operator flows.
7. A second local review process regenerated the synthetic order while its existing proofs were open. Refresh cleared the old inspection, proof images and download control, and asked for a fresh review. The original paid snapshot was unchanged. Automated route checks reject missing/old revision IDs for all four asset types in both stream and signed-URL forms and compare current-revision bytes with the exact stored assets.

Screenshots: [desktop photo comparison](photo-guide-desktop.png), [mobile photo comparison](photo-guide-mobile.png), [homepage personalisation](home-lettering-preview.png), [local preset version history](admin-presets-preview.png), [stale-proof refresh](admin-stale-proof-preview.png). These show digital renderer studies and local fixtures, not completed physical kits or real customer orders.

Changed live database catalogues, remote auth session lifecycle, real-device accessibility, browser downloads and all physical/service gates remain unverified. The scope map retains these distinctions in [BUILD_STATUS.md](BUILD_STATUS.md).

## Replacement workflow and release policy — 27 September

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
