# Verification record — 27 September 2026

This records software checks for the first implementation. It is not approval of a physical kit or live commercial service.

## Automated checks

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
