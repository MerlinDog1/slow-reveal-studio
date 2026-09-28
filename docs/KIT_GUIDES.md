# Making guides and packing records

The kit guide is a **draft for physical trials**, generated from the saved artwork. It is not an approved customer instruction sheet, a marker specification or confirmation that a kit has been packed. The full physical and commercial gates in [PRODUCTION.md](PRODUCTION.md) still apply.

## Contents and source of truth

`lib/kit-guide.ts` builds a deterministic model from `RenderGeometry`; `lib/kit-guide-svg.ts` produces two A4 pages with the same licensed outlined lettering used by the renderer. Page one explains the physical action and shows selected whole marks from the saved geometry in template and finished views. Positions, radii, cells and paths are retained, with one shared display scale; the caption states that scale and that other marks and personal lettering are omitted. The examples are digital targets. They are neither a full-canvas proof nor hand-completed samples.

Each mode has distinct instructions: fill Dots circles; fill Mosaic cells using the numbered key where present; trace Contour paths without filling between them; fill Line Amplification strips using a ruler or straight edge. The current Lines renderer makes horizontal bounded strips, so the guide does not describe unsupported vertical or wave activities.

Page two records the digital colour key and unconfirmed packing requirements. Numbered Mosaic entries preserve the saved palette's IDs, colours and per-colour cell counts, including unused entries. Unknown labels or mismatched cell colours fail before rendering a potentially incorrect key. Unmarked canvas is not an extra numbered pen. Monochrome modes list their actual selected ink. Required markers correspond to used numbered colours; supplier, SKU, lot and quantity remain unassigned. Every Line Amplification pack includes a ruler requirement.

## Immutable production archive

New production packages contain:

```text
kit/guide.json
kit/making-guide.txt
kit/making-guide-page-1.svg
kit/making-guide-page-2.svg
kit/making-guide.pdf
kit/packing-list.json
kit/packing-list.txt
```

The server wrapper binds the guide model to the exact order, revision, artwork snapshot and geometry hashes. Packing records contain the selected product/finish/ink, canonical settings, palette mapping and required materials; assignments and packing confirmations remain blank. The guide itself omits personal lettering, original photographs, tokens and order identifiers. Private production archives still contain their existing source and settings files and must remain private.

The manifest records guide version, draft status, two A4 pages, 300 DPI and each file's path, MIME type, byte count and SHA-256. These files remain inside the existing revision-owned private archive, covered by its integrity check and retention/deletion policy. No additional public customer asset or storage permission is introduced. Existing paid archives are not changed: regenerate a new reviewable revision to obtain the new guide. The operator desk reports whether the current revision has the guide files recorded in its manifest; it does not fall back to another revision's files.

Local lab **Full package** exports carry the same guide/key and an explicitly unpaid prototype packing record, with geometry binding and file hashes. They confer no payment, print or fulfilment authority. Separate SVG/PNG/PDF artwork downloads retain the chosen artwork view; a package's template PDF is always labelled as the template even when exported from Finished view.

## Deterministic PDF output

`lib/artwork-pdf.ts` supplies the shared raster PDF implementation. Both the browser artwork export and server production artwork use it; it also combines guide pages. The PDF's physical page size is explicit in millimetres, and every PNG's IHDR dimensions must match `round(mm / 25.4 * dpi)`. Artwork uses 150 DPI in local exports and 300 DPI in production. The separate guide uses two 210 x 297 mm pages at 300 DPI.

The previous artwork PDF writer used a current creation date and random document ID. Repeated production of identical pixels therefore changed its bytes despite identical SVG/PNG/geometry. The shared writer now uses a fixed UTC metadata date and a content-derived ID, with stable metadata and compression. The date is reproducibility metadata, not an order, print, trial or approval date. The document ID is not an authentication or proof token.

Byte reproducibility applies to identical PNG payloads, dimensions, metadata and dependency/runtime build. Browser Canvas and server Sharp can rasterize differently; cross-rasterizer byte identity is not promised. Separate production packages retain their own order/revision identity, so whole ZIP files are not asserted to be byte-identical across revisions. The authoritative artwork snapshot and actual stored file hashes remain distinct.

## Reviewable examples

Run `npm run kit-guides` to rebuild the eight-page example PDF at `output/pdf/srs-kit-guide-drafts.pdf`, its manifest and the individual mode models/SVGs. Four mode examples derive from the existing licensed Joe Gardner portrait fixture; the manifest preserves the exact source attribution, licence record, source hash, crop, renderer version and generator inputs. These are documentation examples, not customer orders or physical kit evidence. Review PNGs remain under ignored `.data/qa/kit-guides/`.

Before release, trial the draft with first-time participants; confirm every instruction and number is readable and understood, match swatches to real markers, choose quantities from measured coverage, add supplier-approved handling/drying guidance, and test ruler use and packing. No measured drying time, pen yield, marker match, comfort or completion-time promise is supplied by this software increment.
