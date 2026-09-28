# Making guide content and provenance

Added 28 September 2026 for README sections 23 and 26. These pages provide substantive guidance without claiming physical product validation or creating duplicate category copy.

## Routes and homepage components

- `/photo-guide`: one licensed photograph shown at two crops, corresponding actual dot output, subject-specific checks for people/pets/groups/places, supported file limits, bounded local-analysis explanation and the saved-proof checklist.
- `/canvas-guide`: the five initial planned sizes in a common proportional SVG, dimensions/ratios/areas, crop and making-space considerations, provisional finish comparison and a real renderer personalisation example.
- `components/making-guides.tsx` exports `PersonalisationSection`, `PhotoSuitabilitySection`, `CanvasChoiceSection`, `PhotoCropExamples` and `CanvasSizeDiagram`. The homepage includes the three sections; footer navigation and the guarded public sitemap include both guides.
- Styling is appended to `app/globals.css` under `srs-guide-*` classes. The scale drawing has its own focusable horizontal scroll area on small screens; it does not force the page wider.

The diagram reads the five baseline `PRODUCTS` sizes from `lib/catalog.ts`. Each rectangle width/height equals the corresponding nominal millimetres in a shared viewBox; no independent per-rectangle resizing is applied. The page explicitly calls these **planned** sizes, refers to current studio choices and says the diagram is **not life-size on a display**. It is not a measurement of a manufactured sample, not a frame specification and not an image of installed artwork. The comparison table uses width × height / 100 for cm². Provisional finish descriptions omit unapproved canvas weights, frame/board depth, supplied fittings, prices and performance claims.

## Image sources and exact versions

No AI images or new external photographs were created or downloaded for these guides. The two existing public lab references are licensed under the [Unsplash License](https://unsplash.com/license); the source author pages and prior licence check are preserved in `public/references/manifest.json`.

| Source    | Photographer's original page                                                                   | Exact local source SHA-256                                         |
| --------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Light pet | [Linoleum Creative Collective](https://unsplash.com/photos/adult-golden-retriever-hhD4BT2OIIY) | `c66b4096a305f0905da0bbd1d850264018f1410a759452e488ac0f0a94c8e510` |
| Black dog | [Mac Gaither](https://unsplash.com/photos/black-labrador-retriever-ITGs9TnB9og)                | `c3e1934e51602caa222557eb9d916b1f4fe2985a29bf8739d2dba8b34df7dcfe` |

Run `node --import tsx scripts/build-guide-assets.mjs`. The script verifies both original hashes, applies the recorded crops and renders using the shared `renderImage`/`toSvg` implementation. Determinism is asserted. The close pet crop extracts `{left:320, top:990, width:850, height:1062}` source pixels before a centred 4:5 resize; the wide crop uses a centred 4:5 cover. Both are presented as **crops**, not uncropped originals or retouched “before/after” results. Both finished dot studies use the same 400 × 500 mm Standard settings.

Personalisation uses “Always by my side” as explicitly fictional sample wording, in the current serif outline font, 8 mm nominal size, bottom-centre placement. Finished and template use one identical geometry snapshot including lettering. Font outlines keep the existing licensed provenance described in RENDERER.md; no new fonts are introduced.

`public/guides/manifest.json` records the source licence/URL/hash, crop, renderer version, geometry hash and SHA-256/dimensions/bytes of each 640/1280 WebP. The six specimen IDs are `photo-wide`, `photo-closer`, `dots-wide`, `dots-closer`, `personalisation-finished` and `personalisation-template`. Geometry snapshots and the personalisation SVGs support reproduction. Web pages load the small WebP derivatives, not geometry JSON or full SVG. Original marketing assets remain untouched.

Visible captions identify digital examples and licensed photo sources. Nothing here is a customer result, testimonial, physical completion sample or proof of material performance. Statistical photo advice is conditional; native possible-face detection is optional and cannot guarantee counts or suitability.

## Validation boundary

Independent read-only verification matched every recorded hash, dimension, format and byte count for all 12 WebPs, the two licensed sources and three geometry snapshots. There were no missing or duplicate specimen entries. The WebPs total 3,891,210 bytes; geometry uses 400 × 500 mm at renderer 1.1.0.

Asset generation/determinism assertions and TypeScript checks passed. New routes and sampled WebPs returned HTTP 200 locally. Generated crops, dot specimens and personalisation views were visually inspected. The final integrated suite passed 62 of 64 cases with two optional browser checks skipped, and the production build passed. The root agent inspected desktop photo comparison and homepage lettering, mobile photo/canvas guides and the homepage size section in the actual browser. At 390px the pages did not overflow; the size diagram scrolls within its own labelled region. Captures and remaining real-device/accessibility limits are recorded in [VERIFICATION.md](VERIFICATION.md).
