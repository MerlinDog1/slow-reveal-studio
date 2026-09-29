# Marker sets and versioned colour profiles

Checked **29 September 2026** against manufacturer sources. Recommended **sample candidate: Ohuhu Nahuku 48-pen acrylic pack**, using a Studio selection of 16 or 32 coded colours. Both selections come from this same pack; they are not separately sold 16- and 32-pen products. No markers have been bought or tested by this project.

## UK buying evidence

| Candidate                                                                                                                                          | Observed price and stock                                                                                 | Tip / replenishment                                                                                                                                                                                   | Decision                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| [Ohuhu Nahuku 48, UK variant 51158468559135](https://uk.ohuhu.com/products/ohuhu-direct-ink-acrylic-markers-48-pack-nahuku?variant=51158468559135) | **£33**, tax included, UK warehouse variant available; delivery extra                                    | Soft brush, advertised 1–5 mm; matching individual Nahuku pens/refills not verified                                                                                                                   | Best documented in-budget sample candidate; 42 colours plus three black and three white pens means **44 distinct colours**, not 48 |
| [Ohuhu Hanauma 36](https://uk.ohuhu.com/products/ohuhu-acrylic-paint-markers-refillable-36-colors-hanauma)                                         | UK variant 51576298799391: **£23, unavailable**; default page/other warehouse may show a different price | 2 mm round nib; six spare nibs; matching [Hanauma/Mauna Kea refills](https://ohuhu.com/products/ohuhu-acrylic-marker-ink-refill-for-mauna-kea-hanauma-series) documented, UK availability unconfirmed | Useful replenishment alternative, but stock and small-feature control prevent choosing it now                                      |
| [Ohuhu Kahuku 48](https://uk.ohuhu.com/products/ohuhu-kahuku-series-direct-ink-acrylic-paint-markers)                                              | UK variant 52538581385503: **£25, unavailable**                                                          | Advertised 1–6 mm brush                                                                                                                                                                               | Lower base price, but not a currently available UK substitute                                                                      |
| [Arrtx 32 dual tip](https://arrtx.com/en-gb/collections/fine-tip-markers/products/arrtx-32-colors-acrylic-marker-brush-tip-and-fine-tip-dual-tip)  | Page displayed **$48.57** and stock; delivered GBP price not established                                 | Fine and brush tips; [Arrtx singles](https://arrtx.com/collections/arrtx-single-acrylic-marker) relate to named white-barrel ranges, so compatibility with this black-barrel set was not established  | Exact 32-pack exists, but insufficient UK cost/replacement evidence to prefer it                                                   |

Prices/stock were read from each official UK product `.js` endpoint's **UK Warehouse to UK Only** variant on the check date. Nahuku page currency was independently GBP (`Shopify.currency.active` and price-currency metadata). [Nahuku structured product data](https://uk.ohuhu.com/products/ohuhu-direct-ink-acrylic-markers-48-pack-nahuku.js), [Hanauma data](https://uk.ohuhu.com/products/ohuhu-acrylic-paint-markers-refillable-36-colors-hanauma.js), [Kahuku data](https://uk.ohuhu.com/products/ohuhu-kahuku-series-direct-ink-acrylic-paint-markers.js). Availability is an observation, not a reserved order or supply guarantee.

The £33 is **not a delivered quote**. Ohuhu's UK banner advertised free local-warehouse delivery above £53; its [shipping policy](https://uk.ohuhu.com/pages/shipping-terms) makes the fee depend on weight/destination. The exact fee for this pack was not obtained. No checkout, supplier contact or purchase was performed.

## What the profile means

`lib/marker-palettes.ts` adds **ohuhu-nahuku-48-v1** independently of the existing artwork palette. Existing saved HEX arrays remain authoritative and unchanged. A user must select the new profile to use its colours. Its first sixteen entries are a stable subset of its thirty-two. The selection balances earth/skin-like tones, lights, brights and dark blue/green; this is a design choice, not measured image-reproduction superiority.

The manufacturer [44-code chart image](https://cdn.shopify.com/s/files/1/0555/4212/0735/files/Y30-80601-84Nahuku4.jpg?v=1756708704) verifies the **codes** below. Descriptive names in the app/table are Studio labels, **not official colour names**. Match pens by the code, not a name, screen colour, or the same code from another Ohuhu range. Code **101 white is deliberately excluded**: blank canvas has its own meaning in the artwork. Black is code 120.

**HEX values are digital approximations of a published image, not measured marker paint, manufacturer RGB specifications, or a guarantee of finished colour.** Photography, lighting, primer, ink thickness, drying and display settings can all change the apparent result. Manufacturer surface/coverage claims do not validate these pens on the project's primed canvas or UV guide.

| Key | Pen code | Studio description | Approximate HEX | Selection |
| --- | -------- | ------------------ | --------------- | --------- |
| 1   | 120      | Black              | #22262b         | 16 / 32   |
| 2   | BR519    | Brown              | #583b33         | 16 / 32   |
| 3   | BR87     | Tan                | #dea576         | 16 / 32   |
| 4   | Y211     | Ochre              | #cd880a         | 16 / 32   |
| 5   | G321     | Deep green         | #084e42         | 16 / 32   |
| 6   | B719     | Blue               | #016abc         | 16 / 32   |
| 7   | BGY012   | Slate grey         | #7d93a0         | 16 / 32   |
| 8   | Y03      | Peach              | #fcc99d         | 16 / 32   |
| 9   | R416     | Red                | #e21117         | 16 / 32   |
| 10  | YR310    | Orange             | #fe8302         | 16 / 32   |
| 11  | Y45      | Golden yellow      | #ffc605         | 16 / 32   |
| 12  | YG57     | Light green        | #95cc78         | 16 / 32   |
| 13  | BG28     | Turquoise          | #23c9c9         | 16 / 32   |
| 14  | BG85     | Light blue         | #85d2e2         | 16 / 32   |
| 15  | V017     | Violet             | #6a5cb9         | 16 / 32   |
| 16  | R610     | Coral              | #f98e8b         | 16 / 32   |
| 17  | R621     | Deep red           | #831e1f         | 32        |
| 18  | R19      | Pink               | #fb99a5         | 32        |
| 19  | RV513    | Rose               | #e05081         | 32        |
| 20  | Y05      | Apricot            | #ffc06b         | 32        |
| 21  | BR419    | Red brown          | #4d1c15         | 32        |
| 22  | Y53      | Bright yellow      | #ffdd03         | 32        |
| 23  | G43      | Mint               | #a3e2d0         | 32        |
| 24  | G115     | Green              | #03a761         | 32        |
| 25  | BG316    | Teal               | #028a97         | 32        |
| 26  | BGY021   | Deep blue grey     | #26495f         | 32        |
| 27  | BV210    | Periwinkle         | #8da6e0         | 32        |
| 28  | V119     | Deep violet        | #383187         | 32        |
| 29  | RV08     | Orchid             | #e091ca         | 32        |
| 30  | BGY19    | Blue grey          | #9bbbc7         | 32        |
| 31  | BGY15    | Pale blue grey     | #bed2d9         | 32        |
| 32  | Y71      | Cream yellow       | #f6e9b4         | 32        |

## Approximation provenance and reproduction

The chart's original JPEG was 1600 × 1600 pixels. SHA-256: `ffbbf7782d647ff756ddbb96573cdeb86998b73438a166687ec26604a89c3d4a`. Original source image remains linked to the manufacturer; it is not republished as a project asset. Inspection copies are under ignored `.data/research/markers/` only.

Each entry records a 21 × 21 pixel rectangle (`sample.left`, `sample.top`, `sample.width`, `sample.height`) within the upper-left solid-colour portion of its swatch. Decode the original bytes with Sharp 0.35.5 to RGB8 (`removeAlpha().raw()`), sort each of the three channels independently across its 441 pixels, and select zero-based element 220. Format those three median bytes as lowercase hexadecimal. Do not sample the black-background decorative marks. No resizing, colour correction, blending, physical measurement or conversion from an alcohol-marker chart was performed. Black was sampled from its black swatch by the same recipe.

Before rebuilding approximations, verify the source SHA. A different source, physical measurement, selection order or revised approximation needs a **new profile ID**; never silently replace this version or the palette stored with an artwork. `identifyMarkerPalette` recognises only an exact ordered 16-/32-colour array, so historical and edited palettes cannot acquire a false marker-set claim. Key labels should show the manufacturer code alongside the artwork's existing 1-based key.

## Sample acceptance still required

The brush's advertised 1–5 mm stroke range does not establish a repeatable 2 mm filled feature. A flexible tip can widen under pressure; this makes it a sample candidate rather than an approved production tool. Test the actual smallest dots, cells and X strokes on the chosen primed canvas with its UV guide before promising suitability. Record each code and lot, coverage over the guide, drag/fraying, edge control, bleed, touch-dry and smudge behaviour, and fill-area/pen consumption. Include first-use and partly used pens, light-over-dark strokes, between-batch differences and at least one whole small artwork. Use the existing [production coupon protocol](PRODUCTION.md); leave approval empty until real results exist.

For colour calibration, retain labelled dried swatches on the exact substrate and record the measurement or controlled-image method, lighting, device/profile and batch. A future physically measured palette should be versioned separately. Supplier lightfastness/waterproof claims have not been independently verified here. Kit-level pen quantities, lifetime, refill compatibility, repeat supply, physical quality and landed costs remain open.
