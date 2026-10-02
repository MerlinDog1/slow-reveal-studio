# Image and asset plan

## Presentation additions — 29 September 2026

Two new built-in ImageGen concepts bring the unified manifest to sixteen assets: `family-making-prototype.png` (an invented family with a partly completed dog canvas) and `macaw-on-wall-prototype.png` (an invented room using the studio's digital macaw artwork as the supplied reference). Both were visually inspected, keep their original PNGs and have 640/1280 WebP derivatives. Visible captions remain **Illustrative prototype · AI-generated**. Neither demonstrates a real customer, manufactured kit, calibrated canvas size or pigment result. Exact prompts and the reference are in [PROMPTS-PRESENTATION.md](../public/marketing/PROMPTS-PRESENTATION.md). The room placement may reinterpret fine marks.

The interactive homepage comparison uses four additional **actual renderer** guide/finished pairs under `public/marketing/reveal/`: Colour Blend, TV Weave, colour Fibonacci Spiral and Cross Stitch. Each pair comes from one geometry and the same licensed Joe Gardner portrait, with the coded Ohuhu 16-colour selection. The [separate manifest](../public/marketing/reveal/manifest.json) records source, profile, settings, renderer 1.8.0 and output hashes. Rebuild with `node --import tsx scripts/build-reveal-studies.ts`. Each 640 × 800 WebP is downsampled from 1600 × 2000; eight images total 1.49 MB. These are digital studies, not physical results. The older asset inventory below records its original 27 September scope.

The eight photographs under `public/references/` are licensed **lab fixtures**. Attribution/source data lives in `lib/reference-images.ts`; full provenance and file hashes are in `public/references/manifest.json`. They do not show our kits, customers or physical results. No competitor imagery is included.

The product brief calls for temporary concepts during development, followed by genuine production photographs. **All fourteen requested slots are populated as of 27 September 2026: ten generated lifestyle concepts and four deterministic renderer studies.** This completes concept coverage; real product photography remains unfulfilled for every slot. Generated files require the visible caption **“Illustrative prototype · AI-generated”**. Renderer studies require **“Digital rendering · simulated completion”**, or the colour-specific caption in the manifest. None documents an actual manufactured kit.

## Completed concept files

| Slot | File | Inspection and limitation |
|---|---|---|
| home-hero | `public/marketing/home-hero-prototype.png` | Hands filling a black-dog dot canvas at a sunlit table. Generated artwork and fine mark sizes are illustrative, not the application's output or physically approved geometry. |
| kit-flatlay | `public/marketing/kit-flatlay-prototype.png` | Faint template, two markers, diagram leaflet and kraft packaging. The exact materials, marker quantity and diagram contents are concepts, not a promised bill of materials. |
| dots-guide-macro | `public/marketing/dots-guide-macro-prototype.png` | Marker contacting a partly filled outlined circle, visible canvas weave. This cannot validate UV sharpness, dot diameter, coverage or bleed. |
| dots-hand-detail | `public/marketing/dots-hand-detail-prototype.png` | Close-up of a marker filling a circle. Brown/black generated tones are illustrative, not a claim that one black marker makes multiple colours. |
| finished-in-home | `public/marketing/finished-in-home-prototype.png` | Fictional framed dot portrait on a home sideboard; generated fine stipple is not renderer output. |
| example-pet | `public/marketing/example-pet-prototype.png` | Fictional Labrador and near-complete dot canvas; no customer result or tested likeness claim. |
| example-couple | `public/marketing/example-couple-prototype.png` | Fictional wedding canvas and making hands; no actual customer or wedding subjects. |
| example-place | `public/marketing/example-place-prototype.png` | Fictional British house canvas; small source-photo insert is also generated and is not renderer-parity evidence. |
| lines-progression | `public/marketing/lines-progression-prototype.png` | One line portrait with guide/partial/finished regions and visible transparent straight edge. Concept of the activity, not exact algorithm progression or tested precision. |
| size-comparison | `public/marketing/size-comparison-prototype.png` | Five increasing canvases without measurement labels. Illustrative relative scale only; not a true-scale catalogue-size comparison. |
| dots-progression | `public/marketing/dots-progression-digital.png` | Licensed black-dog photograph and one actual dot geometry: guide, simulated partial completion, finished. |
| mosaic-progression | `public/marketing/mosaic-progression-digital.png` | Licensed building source, numbered four-colour cells, partial and finished stages from the same geometry; palette key shown. |
| contour-progression | `public/marketing/contour-progression-digital.png` | Licensed vehicle source and exact contour paths through guide/partial/finished states. Deliberately shows the current experimental renderer's limitations. |
| colour-options | `public/marketing/colour-options-digital.png` | Identical dog dot coordinates/radii in four proposed inks. Screen colour is not a physical marker swatch. |

All ten generated concepts are 1536 × 1024 PNGs, made with the built-in `image_gen` tool and copied intact into the workspace. Subject, composition, hands/nib, visible ruler where required and absence of fake copy/logos were inspected. Exact prompts are in [PROMPTS.md](../public/marketing/PROMPTS.md) and [PROMPTS-ADDITIONAL.md](../public/marketing/PROMPTS-ADDITIONAL.md). No reference photographs were submitted to the AI generations. Separate generated scenes must not be presented as successive stages of the same exact artwork.

The four digital studies are 2200 × 930 PNGs built with the actual shared renderer and Sharp layout. Reproduce them with `node --import tsx scripts/build-marketing-assets.mjs`, then refresh metadata with `node scripts/update-marketing-manifest.mjs`. The script verifies licensed-source hashes, deterministic full geometry and exact primitive-subset progress. Progress overlays whole completed marks over the full guide; it never clips a circle in half or invents another image. Contour progress selects whole paths by centroid. All four colour views share the same circle geometry. Canonical geometry JSON and individual SVG stages live under `public/marketing/digital/`.

Unified [manifest.json](../public/marketing/manifest.json) records all fourteen slots, actual hashes/dimensions, image type, captions, QA limits and generation provenance. Digital source attribution, licenses, source hashes, renderer version and geometry hashes are also recorded. The source photos and renderer studies are licensed examples, not customer work. Real production photography remains outstanding for all fourteen slots.

## Responsive web versions

All fourteen originals have 640 px and 1280 px wide WebP derivatives, encoded with Sharp at quality 80. Files use `/marketing/web/{slot-id}-640.webp` and `/marketing/web/{slot-id}-1280.webp`; aspect ratios are preserved with ordinary pixel rounding. Original PNGs remain intact. This is resizing/compression only, with no semantic image changes. Keep the same captions and provenance when displaying a derivative.

Each manifest asset has a `derivatives` array with file, format, dimensions, quality, byte count, SHA-256 and original-source SHA-256. Use these in `srcSet`, for example `/marketing/web/home-hero-640.webp 640w, /marketing/web/home-hero-1280.webp 1280w`, with a layout-appropriate `sizes` value. Do not eagerly download all fourteen original PNGs on a gallery page.

Run `node scripts/optimise-marketing-assets.mjs` after changing originals. `scripts/update-marketing-manifest.mjs` preserves derivative metadata only while its source hash matches; changed originals invalidate those entries until optimisation is rerun. Complete rebuild order: build digital assets, update the manifest, then optimise marketing assets.

## Replaceable slots and generation briefs

Use a consistent warm UK home/studio, diffuse daylight, linen/wood surfaces, Ink/Canvas/Sand palette and restrained composition. Place no fabricated brand endorsements, review text, certification badges, measurements or legible pseudo-instructions inside an image. Hands, pens, marks and kit contents must be visually plausible, but visual plausibility is not manufacturing evidence. Use actual renderer exports for artwork close-ups when geometry accuracy matters.

| Stable slot | Temporary concept / required composition | Final evidence to photograph |
|---|---|---|
| home-hero | Adult at a quiet table completing a dot canvas; room for headline; hands and physical action clear | Approved kit in use, release for identifiable person, accurate marker and canvas |
| dots-progression | Same licensed/consented source shown as original, blank template, partly filled, finished | Exact photographed four-state sequence from one approved job |
| dots-hand-detail | Close hand filling a single printed circle with pen held naturally | Real tip and real guide at usable dot size |
| dots-guide-macro | Unfilled circle guides on visible canvas grain, no fake technical specification | Real UV-printed coupon, scale and lighting documented |
| kit-flatlay | Canvas, correct pens, instruction sheet and protective packaging | Exact shipping bill of materials; only items actually supplied |
| finished-in-home | Approved finished portrait framed/displayed in a restrained home | Real completed artwork, dimensions and finish accurately depicted |
| example-pet | Pet source and dot conversion side-by-side, labelled digital preview | Consented pet photo and hand-completed approved canvas |
| example-couple | Couple/wedding memory with corresponding conversion | Subject/photographer permission and completed physical example |
| example-place | Meaningful home/building source and output | Rights-reviewed source, real kit and completed result |
| mosaic-progression | Source, outlined cells, partially filled palette, finished mosaic | Approved palette, matching pen set, legible legend and completed kit |
| contour-progression | Source, faint guides, tracing action, minimal finished result | Real traceable template and pen performance |
| lines-progression | Source, line guides, filling/tracing with transparent ruler, finished image | Approved ruler workflow; every shown kit includes ruler |
| size-comparison | Identical artwork at intended five sizes with honest room perspective | Measured physical canvases; never infer scale from generated furniture |
| colour-options | Identical geometry in black/navy/sepia/green and experimental metallic/inverted treatments | Real marker swatches on approved surface; separate experimental from available stock |

## Workflow and acceptance

Generate temporary images only through the image-generation tool, save original prompt/provenance and display concept status. Do not use generated art to certify guide sharpness, adhesion, colour, completion time or pen quantities. For staged progressions, the source and artwork must remain consistent; visually inspect hands, tools, dot sizes and continuity. A misleading concept should be replaced with an honest digital preview.

When replacing concepts, retain the slot ID, alt text intent and crop options; replace file path, photographer, capture date, product/material revision, permission record and status. Store permission references privately; do not put releases or customer data in the public asset manifest. Optimise site derivatives but retain production-photo originals in controlled storage. Alt text describes the visual action, not promotional claims.

Customer results/reviews and launch photography are unfulfilled gates until real kits exist. The homepage may explain what a planned kit contains, but must not invent verified reviews or use stock family/portrait photos as satisfied customers.
