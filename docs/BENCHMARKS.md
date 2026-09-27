# Renderer benchmark protocol

The benchmark set is the eight licensed photos in `public/references/`, described in its README and `manifest.json`. Keep the fixtures stable and record hashes; changing a fixture invalidates comparisons to previous runs. These are reference photos, not customer results. The current execution status belongs in [BUILD_STATUS.md](BUILD_STATUS.md). The criteria here are proposed acceptance targets until measured and signed off.

## Representative subject coverage

| Fixture | Why it is present | Specific failure to inspect |
|---|---|---|
| portrait | Single face with red side lighting and dark hat | Eyes/mouth remain legible; shadow does not become a solid unrecognisable mass |
| couple | Two faces touching against bright sea foam | Faces remain distinct; clothing/foam highlights do not merge away the bodies |
| family | Three different face sizes and a busy patterned background | Each face survives; detail control does not spend most marks on shirt/background texture |
| black-dog | Dark fur on dark background, coloured rim light | Eye catchlights, nose and muzzle separate; no assumption that fur must become pure black |
| light-pet | Golden retriever with relatively small subject and bright architecture | Suitability guidance recommends tighter crop; fur detail is retained without background domination |
| building | Cottage amid branches and stone texture | Roof/windows are recognisable; small high-contrast foliage does not swamp the subject |
| vehicle | Bright car in a shadowed garage | Silhouette, lights and trim preserved; visual identity does not depend on tiny lettering |
| landscape | Broad sky/water gradients and dark foreground | Tonal bands avoid distracting contouring; horizon/mountain shapes remain intentional |

The eight are a minimum regression set, not demographic or photographic coverage. Add consented diverse skin tones, hair, age ranges, glasses, overexposure, blur, low resolution and complex crops before launch. Do not use face detection as identity recognition. Suitability is advisory and a human review remains available.

## Digital matrix

For all eight fixtures, run Dots Easy/Standard/Detailed at 300×400 and 400×500mm. Run the five intended product sizes (300×400, 400×500, 400×600, 500×700, 600×800mm) for geometry/export checks. Add Bold/Fine Portrait/Inverted as lab research cases. For Mosaic, compare square/rounded/hex cells and 1/2/4/6/8 colours. For Contour compare simplification, smoothing and detail retention. Lines requires direction/modulation variants and the ruler workflow; it is not launch-approved because it renders.

For each case save canonical settings, crop, input checksum, renderer version, mark count/path length, render duration, estimated work duration, geometry bounds, minimum/maximum marks and a finished/template pair. Compare small and large preview resolutions to prove they share physical geometry. Repeat the same input to test deterministic output. Use structural or geometry hashes rather than PNG metadata/timestamps as the reproducibility oracle.

## Acceptance evidence

| Area | Proposed target / invariant | Evidence needed |
|---|---|---|
| Determinism | Same source, crop, dimensions, settings and renderer version yields identical geometry | Automated fixtures/hashes and repeated invocation |
| Physical units | SVG mm dimensions, PDF page size, raster pixels/DPI agree within rounding; vector coordinates within 0.1mm serialization tolerance | Parse all exported formats; measure a real 100mm print rule separately |
| Collision safety | No overlapping dots outside explicitly documented test mode; preserve configured physical gap | Neighbour-distance tests on dense/extreme inputs |
| Bounds | Marks and text remain within configured safe geometry; bleed/trim outside intended face | Extreme dimensions, rotated crops, long text, empty/white/black inputs |
| Fidelity | Subject identified by at least 4 of 5 independent reviewers from a set of candidate originals; faces/eyes retain intent | Blind comparison recorded per image and preset, not an agent's aesthetic assertion |
| Activity quality | Every mark has an understandable customer action; confusing marks are counted and resolved | Printed coupon and full-canvas hand-completion studies |
| Difficulty | Easy reduces measured effort; detail presets do not silently exceed usable pen limits | Mark/area/path statistics plus measured sessions |
| Template parity | Finished and template derive from identical primitive positions; text and palette legend consistent | Shared-geometry tests and visual overlays |
| Live response | Aim at median <250ms and p95 <750ms after crop decode on a documented midrange laptop; aim p95 <1500ms on documented mobile | At least 30 warm runs, report cold decode separately; record browser/CPU/image/preview size |
| Robustness | Invalid settings, pathological image dimensions and oversized input fail safely | Unit/integration tests, main-thread responsiveness and memory observation |
| Colour | Legend is readable, palette IDs map to supplied pens and no ambiguous symbols | Export inspection plus real colour/ink trial; RGB alone cannot pass |
| Privacy / trust | No original in public storage/logs; unauthorized access denied; browser cannot mark payment paid or alter paid snapshot | Boundary tests plus deployed service test-mode checks |

Timing values are targets, not measurements. Rendering a photograph without an error does not meet fidelity or physical-completion gates. Record failures openly and use the same fixtures after changes. Synthetic gradient/white/black/checkerboard tests complement the photos by exposing geometry and tone bugs; they cannot replace them.

## Result record

```text
date / commit / operator / browser / device:
fixture ID / SHA-256 / crop / renderer version:
size mm / preset / full settings hash:
mark count or path length / minimum gap / geometry bounds:
decode ms / warm render median / p95 / production export ms:
finished + template + manifest file paths:
recognition panel score / aesthetic comments / template errors:
physical sample ID / pen and substrate lot / measured completion:
pass, fail or not-run / rationale / next action:
```

**Baseline at protocol creation:** all eight downloaded JPEGs decode and were visually inspected; licence/source metadata verified. No renderer timings, blind recognition scores or physical completion results are claimed by this document. The integration agent must record the executed automated/runtime evidence separately.
