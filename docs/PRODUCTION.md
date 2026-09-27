# Production protocol and release gates

The production method is **intended to be UV print directly onto canvas**. This protocol defines what must be proven; it does not certify the current renderer, export or material combination. Physical samples, hand-completion trials, printer/RIP acceptance and commercial fulfilment remain unfulfilled external gates. [BUILD_STATUS.md](BUILD_STATUS.md) is the current implementation ledger; [PRODUCT_SPEC.md](PRODUCT_SPEC.md) preserves the full brief.

## One artwork, shared physical geometry

Keep all art geometry in millimetres. Preview resolution must not become a second geometry system. The finished preview fills/strokes the same circles, cells and paths the template outlines. Record exact width/height, safe margin, bleed, guide stroke width/colour/opacity, palette, text settings, crop, renderer version and deterministic settings in every snapshot.

At 300 DPI, 400 × 500mm is approximately 4724 × 5906 pixels: `round(mm / 25.4 * dpi)`. Pixel count alone is insufficient: raster physical-size metadata and RIP interpretation must be checked. SVG must carry millimetre width/height and a matching viewBox; PDF page boxes must match the intended art/bleed dimensions (`points = mm * 72 / 25.4`). No “fit to page” scaling. Print a 100mm calibration rule and measure it before artwork approval. Suggested geometric tolerance is ±0.1mm in exported vector geometry; acceptable physical printer tolerance must be established with the printer operator.

Bleed is external to the finished face. Canvas wrapping allowance is a separate production decision and is not a generic 3mm paper bleed. Confirm stretcher depth, printable flat area, fixture clearance and whether guides continue onto edges. Registration/trim marks must be outside finished art and enabled only when the operator requests them. They are not customer marks to fill.

Personalisation must remain within the safe region and the same position in both views. Curated fonts need a controlled production path (embedded font, licensed outlined paths, or deterministic rasterisation); browser-dependent fallback glyphs are not proof of production consistency. Inspect long names, punctuation, accents and unsupported scripts before approval.

White-on-dark, metallic and colour-underlay jobs require separate approved material profiles. An RGB white shape does not create a white-ink separation. Do not describe an SVG/PDF as a RIP-certified white-ink file until the named spot channel, layer order and overprint settings have been tested with the actual RIP. Likewise, screen palette colours are illustrations until matched to supplied marker lots.

## Immutable job package

Only verified Stripe payment events can establish payment. The checkout return page and browser-submitted prices, payment flags, artwork or order identifiers are untrusted. Use server-side catalogue prices and ownership checks. Persist a frozen paid design revision; subsequent crop/text/settings edits produce a **new revision** with its own review state and audit trail. Never overwrite the file originally approved or paid for.

The full target package is:

```text
ORDER-1042/revision-0001/
  source/original.jpg
  source/cropped.png
  preview/finished.png
  preview/template.png
  production/ORDER-1042_dots_400x500mm_black_portrait_template.pdf
  production/ORDER-1042_dots_400x500mm_black_portrait_template.svg
  production/ORDER-1042_dots_400x500mm_black_portrait_template.png
  order.json
  render-settings.json
  manifest.json
```

Preserve the true original file type; names here are examples. Include source and crop hashes, renderer/manifest schema versions, canonical settings, geometry hash, physical dimensions, DPI, palette-to-marker mapping, file SHA-256 hashes, byte lengths and MIME types. Avoid names/customer details in filenames. Manifest integrity checks should fail after any byte modification. A client-generated ZIP is an experiment/export; production authority must come from the server's verified revision and validated package.

Store originals and production files privately. Issue short-lived URLs only after owner/admin authorisation. Never log image bytes, signing tokens or customer details. Production staff receive the minimum access needed. Deletion must reconcile active orders, documented retention and access revocation, including signed URL expiry and backups. Do not put a private original in a public preview bucket.

## Review and handoff checklist

For each paid job, the operator needs source, crop, finished view, exact template, dimensions, kit contents, text, warnings, revision and production files. Available decisions are approve, hold, request another photo, edit crop and regenerate. Editing/regeneration creates a new reviewable revision. Only the explicitly approved revision can progress to print; a paid status alone is insufficient.

Before approval, compare the package against the order and check: geometry hash/renderer version, orientation, face/subject crop, intentional negative space, collision spacing, minimum/maximum marks, guide readability, text clipping, colour legend, safe area/bleed, file dimensions and required kit items. Line Amplification always includes a ruler/straight edge. Record operator, time, revision and reason for hold/rejection. Test cancellation/refund and dispatch-state changes before commercial use; do not infer them from UI labels.

## Physical coupon matrix

These values are **test candidates**, not approved customer presets. Run a coupon before every new substrate/ink/marker combination and after meaningful lot or machine changes.

| Factor | Candidate sweep | Capture |
|---|---|---|
| Circle diameter | 0.8, 1.0, 1.2, 1.5, 2, 3, 4, 5, 6mm | Filling accuracy, comfortable minimum/maximum, single-press versus colouring action |
| Gap between marks | 0.2, 0.4, 0.6, 0.8, 1mm | Accidental joins, guide separation, marker spread |
| Guide width | 0.08, 0.12, 0.16, 0.20, 0.30mm | Line continuity across grain and visibility after completion |
| Guide opacity/colour | 10/20/30/40%; neutral and warm greys | Indoor readability, show-through and RIP treatment |
| Substrate | Fine/medium primed cotton, roll, board, stretched | Print flatness, grain, adhesion, deflection and stretching cracks |
| Marker | Fine/broad black, white, metallic; then limited colours | Dot shape, coverage, ink yield, bleed, drag, odour, smudge and drying time |
| Inversion / white ink | Approved dark substrate and ink sequence only | Opaque coverage, curing, registration and guide visibility |
| Mosaic | Square, rounded square, hexagon; 1/2/4/6/8 colours | Fill reach, symbol readability, colour confusion, overpainting and waste |
| Contour | Several simplification/line widths | Trace continuity, false paths, ambiguous crossings and pen lifts |
| Lines | Horizontal/vertical/wave/interrupted variations | Ruler slip, smearing, hand clearance, precision and fatigue |

For every coupon, record printer/RIP version, ink set and lot, profile/pass/curing settings, substrate supplier/SKU/lot, pretreatment, pen SKU/lot, humidity/temperature, print date, cure interval, images and measurements. Test adhesion/abrasion using an operator-agreed method appropriate to the substrate; do not describe informal testing as certification. Compare before/after filling under normal indoor light and at intended viewing distance.

## Full-canvas user trial

Print the eight reference subjects after coupon limits are chosen. At least three novice participants should complete multiple dot canvases across Easy/Standard/Detailed, including a dark pet and multiple faces. This is a proposed starting study, not a statistical validation claim. Record session duration excluding breaks, total duration including breaks, errors/overspill, pen consumption, discarded pens, grip discomfort, fatigue, missed/ambiguous guides, ability to resume and willingness to display the result. Ask participants to identify the subject without seeing the original, then compare the two.

Release each size/preset/material combination only after an accountable human reviews the evidence. Calibrate the displayed time range from measured percentiles; until then show “estimated” and the assumptions. Check larger canvases for reach, table space and shipping damage, not merely more image detail. Simulate packaged transport with real filled/unfilled canvases and confirm corner/frame protection, marker leakage and instructions.

## Launch gates

- Accepted UV printer/RIP files at exact physical size and tested bleed/wrap/registration behaviour.
- Real completed dot prototypes; chosen pen/substrate inventory, batch controls and per-kit quantities.
- Separate physical approval before public Mosaic or Contour sales; Line Amplification stays R&D until ruler trials pass.
- Verified service configuration, migrations/RLS, private storage, retention/deletion operations, real test-mode payment/webhook retry sequence and transactional email delivery.
- Immutable package recovery, duplicate event handling, alternate photo, holds, revisions, approvals and dispatch tested by an operator.
- Supplier quotes and landed cost; actual prices/tax/shipping, operational turnaround and replacement policy approved.
- Brand/rights/privacy/legal review, genuine photography and consented customer evidence.

There is no physical evidence in this repository yet. Software tests can prove geometry and trust boundaries; they cannot prove marker comfort, colour match, UV adhesion or a satisfying making experience.
