# Renderer implementation and limits

The shared TypeScript renderer produces a serializable, versioned geometry snapshot in **millimetres**. Browser previews, downloadable SVG and server production artwork all use that snapshot. A saved snapshot contains no timestamp, elapsed runtime, random seed from the clock, remote URL or customer image data. The caller may time a render without changing its identity.

## API

`renderImage({data: Uint8ClampedArray, width, height}, settings, subjectMask?)` consumes already cropped RGBA pixels. `toSvg(geometry, "finished" | "template", options)` serializes exactly that geometry. Both are exported by `lib/renderers/index.ts`, together with `RenderSettings`, `RenderGeometry`, `DEFAULT_SETTINGS`, `PRESETS`, `normalizeSettings` and `RENDERER_VERSION`.

The worker accepts `{id, input, settings, subjectMask?}` and responds with `{id, geometry}` or `{id, error}`. Consumers must discard stale IDs and display failures. The worker does not upload or log source pixels.

SVG width and height carry `mm` units and the viewBox uses the same physical coordinates. `background:false` omits the simulated substrate for production; the default warm paper rectangle is a preview aid. `includeSafeArea:true` adds a diagnostic safe-area outline and must not be used in print jobs. Background strings and inks require six-digit hexadecimal colours. Text and metadata are XML-escaped.

## Signature Dots

- Fixed hexagonal centres depend on physical canvas size, margins, spacing and density. Changing display resolution does not add or remove lattice centres.
- Four-sample reduction caps analysis at a 1,000-pixel long edge. Integral-area samples suppress aliasing; a larger neighbourhood restores local contrast around features.
- Bounded automatic exposure lifts dark, non-flat photos. `autoExposure:false` preserves intentional low-key tonal treatment. Brightness, contrast and gamma then apply. This is not face recognition or segmentation.
- Dot area tracks local darkness. Sparse deterministic sampling retains highlights below the printable minimum without making undersize marks. The threshold preserves empty paper.
- Radii are bounded by the chosen minimum and maximum. Effective spacing/maximum diameter are adjusted when required to maintain at least a 0.25 mm clear gap and no more than 60,000 marks. Adjustments appear in warnings and stats.
- Template outlines are inset into the finished footprint so the guide can be covered by the intended filled mark. Guide width is also bounded by half the minimum diameter.

The proposed minimums, gaps and guide settings are engineering defaults, **not material-tested production limits**. Easy, Standard and Detailed change physical workload. Completion estimates use provisional per-mark and filled-area constants and are not customer promises.

### Fine detail sampling (renderer 1.3.0)

`detailPreservation` is a Dots-only lab control from 0 to 1, defaulting to 0 for new and legacy designs. Let `local` be the existing area average at +/-0.30 physical pitches, `fine` the smaller average at +/-0.12 pitches, and `surround` the existing +/-0.90-pitch average. Dots uses `clamp(local + detailPreservation * (fine - local) + (local - surround) * edgeEmphasis)`, followed by the manual mask, threshold and physical mark limits. At zero the fine sample is skipped and the prior arithmetic is unchanged; captured renderer 1.2 primitive hashes remain identical across all four modes. Other modes ignore this parameter.

The detail term is a convex blend between two spatial averages; it can retain a narrow light or dark feature lost in the wider average. Edge emphasis remains a separate broad-neighbourhood term. It is not semantic face enhancement, denoising or a guarantee of likeness. Smaller samples can also retain grain, sharpening artefacts and distracting background texture. Built-in customer presets keep the zero default pending representative human and physical review. See the reproducible eight-photo comparison in `docs/detail-preservation-study.json` and its contact sheet; measured geometry differences do not establish artistic or physical improvement.

### Independent template colour (renderer 1.3.0)

`guideColor` optionally supplies a six-digit hexadecimal template colour. Omission inherits the normalized finished ink, including the light-ink default for inverted artwork. The lab can return to inheritance with **Match guide to marker colour**. Custom guide colour affects every template primitive, outlined Mosaic number and personalised text; finished ink/palette, geometry, opacity and line width are unchanged. This is an RGB preview/export parameter, not an ICC-managed colour, white-ink spot plate or proof of marker coverage.

Local/private designs and local/published presets preserve these settings. Applying a preset without a custom guide resets inheritance rather than retaining the previous design's guide colour. Prototype and server manifests record requested/effective guide colour and canonical detail strength. Administrator changes to detail strength or effective guide colour require a new customer proof; paid originals remain immutable. Older saved renderer versions continue to require explicit rebuild review.

### Manual subject selection (renderer 1.2.0)

Dots accepts a separate private `SubjectMask` input from `lib/subject-mask.ts`. The lab provides keep/remove brushes, undo, a keyboard drawing cursor, overlay and feathering; Apply commits an independent snapshot and Cancel discards the draft. This is manually painted selection, not automatic semantic segmentation. Other modes do not support active masking.

The canonical `cropped-v1` alpha8 raster has a 512-pixel long edge, matching the physical canvas aspect ratio, at most 262,144 bytes. It is bound to SHA-256 of the exact original photo bytes, crop zoom/x/y/quarter-turn, and canvas width/height in millimetres. Strict validation rejects unknown fields, malformed base64, wrong dimensions or stale binding. Feathering uses a deterministic separable box blur with clamped edges and radius `round(feather * min(width, height))`, where feather is 0–0.05; coverage is sampled bilinearly. The overlay shows the raw selection before feathering.

`subjectMaskStrength` is 0–1 (legacy/missing defaults to 0). Dots multiplies the original final darkness, after exposure/inversion/edge processing, by `1 - strength * (1 - coverage)`. Zero strength leaves primitives unchanged; one removes marks outside the selection. Mask edges do not create photographic edges or change exposure statistics. Physical centres, minimum mark diameter, gaps, safe bounds, outlined text and the 60,000-mark cap remain shared with unmasked rendering. The selected photo is still mapped into the artwork bounds, including any reserved lettering band.

Selection data is separate from renderer settings, geometry, analytics and preset exports. Local projects retain it privately in IndexedDB. Restore verifies the original blob checksum before opening the selection; a new photo clears the selection and strength. Crop, mode and canvas-size changes require explicitly clearing it first. A private design save validates against the decoded upload and authoritative catalogue dimensions, then stores canonical selection JSON as a separate private asset. Paid snapshots retain the asset reference, enabling artwork erasure; they never inline the alpha pixels. Each production revision owns a mask copy, and its archive contains `source/subject-mask.json`. Local prototype ZIPs include that file and its checksum too.

The canonical server proof hash binds the mask digest even when strength is zero or two masks produce identical geometry. Admin regeneration preserves the current revision's mask; changing its crop requires explicit removal. Removing a mask or changing active strength requires new customer proof approval and queues the revised-proof notice. Replacement photos clear inherited masks. Historical paid snapshots stay immutable; saved projects from an earlier renderer require the existing explicit rebuild review. Production services, representative selection usability and physical outcomes remain unverified.

### Effective guide width

The serializer uses `min(requested guideWidthMm (default 0.15), minDiameterMm / 2)` for the base guide width. The production manifest records that clamped value as `guideWidthMm` and retains the original request as `requestedGuideWidthMm`. Circle/cell outlines use the base value; path guides use `min(path.width, base guide width)` and can therefore be narrower. The manifest value is a base/maximum guide width, not a guarantee of uniform stroke width throughout every mode. For example, a requested 0.5 mm guide with a 0.5 mm minimum dot diameter yields a 0.25 mm outline. Opacity and width still require an actual printed proof.

## Local photo advice and orientation

`lib/photo-analysis.ts` provides advisory statistics from the current crop, capped at a 256-pixel long edge. The editor recalculates after crop, canvas size and safe-margin changes. Advice covers retained source pixels and approximate PPI at the selected physical size, exposure, tonal range, sparse detail/possible softness, fine detail near the image edges and strongly contrasting regions. A 16×16 contrast grid can suggest that a small or edge-touching region deserves inspection, but it does not identify the subject, remove a background or perform semantic segmentation. The language remains conditional and the customer can continue after checking the previews.

Where the browser supplies its native `FaceDetector`, an optional local check records normalized possible-face boxes transiently and maps them through the same crop/rotation transform. It can offer advice about small, trimmed or multiple possible faces. The request is bounded to twelve detections and a 1.4-second timeout; unavailable, failed and timed-out states are explicit. An unavailable detector reports an unknown count, not zero. No detector model is downloaded, no image/boxes are sent to a remote service, and no identity or recognition result is produced. This is not a robust or universal face-count guarantee; false positives and missed faces remain possible, and API availability depends on the browser/OS configuration.

`lib/image-processing.ts` uses the modern browser decoder's EXIF-oriented dimensions and does not apply a second EXIF rotation. The server calls Sharp `autoOrient()` before applying the user's quarter-turn rotation. Both use the same cover/zoom/pan convention, with browser/server resampling differences still resolved by the final accepted server proof. HEIC conversion is not implemented. `tests/photo-analysis.test.ts` includes bounded-statistics/crop/detector-failure cases and an opt-in eight-orientation browser fixture: `$env:PHOTO_BROWSER_QA='1'; node --import tsx --test tests/photo-analysis.test.ts` (PowerShell, installed Edge required). Test existence is not evidence of every real device/decoder combination; final executed results belong in BUILD_STATUS/VERIFICATION.

## Other modes

**Mosaic:** square, rounded or hexagonal cells; monochrome area modulation or 2–8 supplied marker colours. Palette mapping picks the nearest weighted RGB colour, with unmarked white as a paper tone. Numbers on the template identify supplied colours; a separate key is required in the kit. This does not simulate pigment mixing, marker opacity or ink colour management.

**Contour:** two smoothed tonal-boundary levels, joined into connected paths and simplified with an iterative Douglas–Peucker pass. Tiny components are removed. It is an experimental tracing activity, without semantic face detail, subject segmentation or a continuous single-line claim.

**Line Amplification:** horizontal, quantized-thickness strips. The template outlines the regions to fill using a ruler. Every kit requires a ruler or straight edge. Physical usability remains untested.

Alternative modes remain experimental until hand-completed prototypes pass review. Local development exposes all four labs. In production, `getAvailableModes()` exposes Signature Dots by default and permits another mode only when `PHYSICAL_VALIDATION_APPROVED=true` and that mode is explicitly listed in `PHYSICALLY_VALIDATED_MODES`. Public mode choices, catalogue/API availability and links use this policy. Lab routes use `generateStaticParams` with `dynamicParams=false`, so changing the approved list requires a rebuild/redeployment. These flags are operator assertions; setting them does not supply the missing physical evidence or independently open live checkout.

## Personalisation

Text is limited to 80 characters, curated serif/sans-serif choices and four placements. It reserves a band outside the dot image and uses actual glyph bounds, advances and pair kerning to fit. Both personalisation and mosaic numerals serialize as SVG paths. Browser previews and libvips/server exports consume identical vectors without a font download, installed system font, browser text measurement or platform substitution.

Renderer `1.2.0` uses the licensed **SRS Serif Outline** and **SRS Sans Outline** sets derived from the 400-weight Fontsource Playfair Display and DM Sans WOFFs, both package version 5.3.0. These internal derivative names respect the Playfair Display Reserved Font Name. Copyright, attribution and complete SIL OFL 1.1 licences are retained in `public/fonts/`. The outline data remains OFL licensed; finished documents are not required to adopt that licence.

The common repertoire contains **339 characters**: printable ASCII, supported Latin-1/extended Latin accents, typographic quotes, en/em dashes, ellipsis, common symbols and currencies including £, €, ¥ and ₹. The exact list is exported as `SUPPORTED_TEXT_CHARACTERS` and recorded in `lib/renderers/font-data.json`. NFC normalization makes composed and decomposed equivalents (such as `é` and `e` + combining acute) produce identical geometry. Unsupported characters, including emoji and currently unsupported non-Latin scripts, fail with an explicit codepoint message instead of silently substituting a glyph. This is a Latin lettering subset, not a complete international shaping engine.

Run `node scripts/build-font-data.mjs` to reproduce the glyph data. Build-only `opentype.js@2.0.0` extracts outlines; `fontkit@2.0.4` reads pair positioning, including Playfair's GPOS extension table. Both tools are MIT licensed and neither ships in the runtime renderer. Source hashes and a deterministic font revision identify the vectors. The generated file is 542,753 bytes (158,768 gzip bytes) for both fonts together. A saved text geometry includes its font revision; a mismatched revision requires a new design revision. Very long text can become too small and produces a warning.

The opt-in regression command `$env:RENDERER_BROWSER_QA='1'; node --import tsx --test tests/renderers.test.ts` (PowerShell, installed Edge required) compares headless Chromium/Edge with sharp/libvips at identical output dimensions. The accented/currency lettering fixture measured **97.52% serif and 97.99% sans-serif dark-pixel mask overlap**. The SVG path geometry is identical; residual pixel differences are rasterizer antialiasing. Tests also verify exact preview/template path agreement, safe bounds at every anchor, pair kerning, NFC equivalence, JSON serialization and unsupported-script errors. The server comparison rasterizes directly at the final pixel size, matching the production PNG pipeline.

## Reproducible benchmarks

Run `node --import tsx tests/benchmark-renderers.ts` from the repository root. It reads all eight licensed fixture photographs, verifies deterministic output and physical gaps, and writes `docs/renderer-benchmarks.json` and `docs/renderer-contact-sheet.png`. The source hashes identify the exact fixtures; defaults and renderer version are stored in the report.

The tonal correlation compares coarse 12×16 source darkness bins against relative filled dot area. It is a limited image-structure metric, **not** evidence of recognisable faces, an enjoyable activity, colour accuracy or manufacturability. The contact sheet must be inspected alongside the numbers. Full-canvas template thumbnails look faint by design; judge guide visibility at 1:1 and on real canvas.

Visual review found a recognisable subject/scene in all eight default renderings. The dark portrait and black dog benefit from bounded exposure normalization but retain challenging shadow details. The light-pet source has a small subject and busy background, so a tighter crop is preferable. The building and vehicle contain fine texture that a coarse kit simplifies. These limitations must stay visible rather than replacing difficult benchmark photos.

## Remaining physical and algorithmic gates

1. Print and hand-complete real UV/canvas/marker samples, calibrate minimum sizes, guide contrast, ink adhesion, smudging, fatigue and completion time.
2. Confirm eight representative results with human likeness and activity-quality scoring, including accessibility and mobile viewing.
3. Approve printer-specific bleed, white ink, ICC/colour handling and registration marks, and proof the outlined lettering on real material before claiming production readiness.
4. Evaluate the local crop/statistical advice and optional browser detector across representative photos and devices. Semantic subject/background segmentation, robust universal face counting and dependable likeness prediction remain absent; the current contrast-region heuristic and possible-face advice must not be presented as those capabilities.
5. Preserve paid geometry snapshots and renderer versions. A crop, preset or algorithm change creates a new revision for review rather than mutating an approved job.
