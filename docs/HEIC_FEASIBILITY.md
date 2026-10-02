# HEIC import feasibility

Research checked **28 September 2026**. This is a proposed implementation, not an installed decoder or a verified HEIC import feature. No dependency, codec build or runtime was installed during this investigation.

## Requirement and current boundary

[README §6](../README.md#6-upload--editor-experience) requests HEIC support “where practical”; §31 includes smooth mobile upload. Studio currently rejects files outside JPEG, PNG and WebP before attempting decode. The same formats are enforced by local restoration, upload tickets and the server source parser. The browser performs the first preview locally; uploading remains an explicit later action.

Native support is a useful optional capability, but not a portable solution. [WebKit documents HEIC import/edit support in Safari 17](https://webkit.org/blog/14445/webkit-features-in-safari-17-0/). Safari/native HEIC success was not tested on this Windows host. The installed Sharp runtime reports HEIF input suffix `.avif`, so the existing server codec must not be assumed to decode HEVC-based HEIC merely because a `heif` capability exists.

## Decoder candidates and verified versions

The versions below were checked against the npm registry (`npm view … version time.modified license`) and upstream source on the research date. Recheck them before implementation.

| Candidate | Version observed | Fit and limitations |
|---|---|---|
| [libheif-js](https://github.com/catdad-experiments/libheif-js) | npm 1.23.2; registry modified 5 September 2026; LGPL-3.0 | Best integration reference: browser ESM/WASM, image handles and dimensions before pixel decode, explicit image release. Its [build input](https://github.com/catdad-experiments/libheif-js/blob/master/scripts/install.js) pins libheif 1.23.2. The published wrapper is behind the security release below. |
| [heic-to](https://github.com/hoppergee/heic-to) | npm 1.5.2; registry modified 26 May 2026; LGPL-3.0; libheif 1.22.2 | Convenient conversion API, but [worker source](https://github.com/hoppergee/heic-to/blob/main/src/worker.js) selects the first image; the [wrapper](https://github.com/hoppergee/heic-to/blob/main/src/next/index.js) owns a singleton worker and exposes no cancellation or pre-decode limits. Its documented build uses `USE_WASM=0`; it should not be described as a WASM solution without inspecting the actual artifact. |
| [Upstream libheif](https://github.com/strukturag/libheif/releases/tag/v1.23.5) | 1.23.5; released 21 September 2026 | Recommended source for a pinned project-controlled WASM build, with a reviewed libde265 decoder version and a small bounded interface. This requires build/maintenance work; no suitable current binary was built or validated here. |

The npm registry records are available at [libheif-js](https://registry.npmjs.org/libheif-js) and [heic-to](https://registry.npmjs.org/heic-to). Upstream repositories and moving branch links are evidence for this dated assessment, not immutable build inputs; implementation must record exact commits, source archive checksums and build flags.

## Security and resource constraints

[libheif 1.23.5](https://github.com/strukturag/libheif/releases/tag/v1.23.5) fixes a high-severity memory-exhaustion issue: a container can declare small dimensions while its coded image requires a much larger allocation. The release adds coded-size checks before decoding, including HEVC. Checking a handle's width and height in JavaScript is therefore insufficient justification for adopting an older wrapper. Other fixes address allocation accounting and malformed structures.

Recommended engineering constraints:

- Load a pinned, self-hosted decoder only when a HEIC file is selected. Keep it separate from the rendering worker and normal editor bundle; make no third-party request containing photo data.
- Use one disposable conversion worker at a time. Transfer input/output buffers where possible. Abort, timeout or replacement terminates the worker and discards its result before modifying the open design; merely ignoring a promise does not stop synchronous decoding.
- Set compressed-byte, decoded-pixel, image-item, tile, individual-allocation and total decoder-memory limits **before parsing**. Preserve upstream security checks. A small native wrapper is preferable to writing raw offsets into C structures from JavaScript.
- Compile with an explicit maximum WASM heap. The [upstream build script](https://github.com/strukturag/libheif/blob/master/build-emscripten.sh) enables memory growth; a project-specific maximum is additional work. [Security-limit definitions](https://github.com/strukturag/libheif/blob/master/libheif/api/libheif/heif_security.h) expose pixel and total-memory controls. WASM limits do not bound all browser memory: transferred pixels, canvases, encoded output and retained original bytes need a separate budget.
- Start with a documented bounded still-photo subset. Reject sequences and multiple top-level photographs unless an explicit image-selection flow is implemented. Auxiliary depth/alpha images must not automatically count as extra photographs. Do not silently use `data[0]`.
- Free every image handle/context and release canvases/object URLs on success and failure. Do not emit decoder diagnostics containing source data or arbitrary metadata to logs; return bounded user-facing error categories.
- Test the actual deployed Content Security Policy. A no-eval build, same-origin worker and separately served WASM avoid depending on a blob worker or a broad `unsafe-eval` allowance. No CSP compatibility was verified during this research.

Memory caps and timeouts require measured fixtures and representative mobile devices. No proposed numerical memory/performance limit has been validated here.

## Orientation, colour and source preservation

HEIF rotation/mirroring/crop properties are distinct from ordinary JPEG EXIF handling. The [upstream transformation regression](https://github.com/strukturag/libheif/blob/master/tests/clap_decode.cc) verifies that default decoding applies transformations and reports transformed dimensions. Test rotation, mirroring, clean aperture, EXIF-only orientation and conflicting metadata explicitly; do not rotate already transformed pixels a second time. HDR/colour conversion must be described as an editable rendering conversion, not lossless preservation of all original properties.

Proposed source contract:

1. Retain the actual original HEIC bytes locally alongside a normalized JPEG/PNG suitable for the existing editor. Generate the canonical editing image before crop or manual-mask creation, then use those exact bytes throughout local restoration and preview.
2. Continue using the normalized asset as the authoritative rendering source. Its checksum binds the crop/mask and accepted server proof. Add an optional original companion with its own MIME, length and checksum, plus decoder/conversion version and the canonical asset checksum. Do not call a converted JPEG the byte-identical original.
3. When the user explicitly saves/uploads, persist both assets privately. Original companion access, upload limits, retention, erasure, order copying, replacement revisions and package creation must be covered end to end. Neither original bytes nor asset identifiers belong in presets or analytics.
4. Bind both immutable asset references/checksums and the conversion metadata into the paid revision/package. Crop changes do not rewrite the original. Replacement photos create new source/companion pairs and revisions.
5. Clearly distinguish a browser-provided companion association from a server-verified conversion relationship. If that relationship is required to be independently verified, the server needs the same bounded decoder or a verified server conversion service. The existing JPEG/PNG/WebP trust path does not prove that two uploaded files contain the same photograph.

A self-hosted WASM conversion path can be exercised on Windows. A native decoder could be added as an optimization only after output/orientation differences and the source contract are tested; it must not silently choose a different authoritative image on another browser.

## Licence and fixture provenance

`libheif-js`, libheif and libde265 carry LGPL obligations. Consult the actual [libheif-js licence](https://github.com/catdad-experiments/libheif-js/blob/master/LICENSE), [libheif COPYING](https://github.com/strukturag/libheif/blob/master/COPYING) and [libde265 COPYING](https://github.com/strukturag/libde265/blob/master/COPYING). A release plan should include prominent notices, LGPL/GPL texts, exact corresponding source and build instructions, and an appropriate replacement/rebuild mechanism. Keep the decoder distinct from application code. Package metadata alone is not a complete licensing review, and this note does not resolve separate patent questions.

Official upstream test candidates include:

- [`tests/data/rainbow-451x461.heic`](https://github.com/strukturag/libheif/blob/master/tests/data/rainbow-451x461.heic), 7,080 bytes, introduced with [component tests](https://github.com/strukturag/libheif/commit/f1fd74a3a72c324c421005f896d5c87e3b976215).
- [`tests/data/clap_cropped.heic`](https://github.com/strukturag/libheif/blob/master/tests/data/clap_cropped.heic), 2,060 bytes, a 256×256 coded frame with a 64×64 clean aperture, accompanied by the MIT-licensed transformation test above.

The test drivers have explicit MIT headers, but a specific licence grant for these binary image bytes was **not verified**. Do not infer that every sample photograph in an open-source repository is cleared for redistribution. `libheif-js` also downloads its image tests from external Drive links, which were not treated as cleared assets.

The preferable fixture path is to create our own labelled synthetic chart and encode it using the upstream [`heif-enc` tool](https://github.com/strukturag/libheif/blob/master/examples/heif_enc.cc), recording the tool version/flags and fixture licence. Include odd dimensions, orientation/mirroring, a multi-image file, an ordinary photo with cleared rights, malformed/truncated inputs and oversized declared/coded dimensions. Encoder/tool licensing and decoder distribution remain separate from ownership of the generated chart.

## Acceptance evidence and available tooling

Required software evidence before calling HEIC implemented:

- A real fixture decodes through the shipped WASM in the Windows browser; no stub-only success.
- Orientation/chart pixel checks and canonical JPEG/PNG server proof comparison pass, including crop, local/private restoration and manual-mask binding.
- Multiple-image, malformed and resource-limit failures leave the prior design untouched. Cancel/new-upload/timeout terminate work and reject stale results. No photo upload occurs during local conversion.
- Original and canonical hashes survive save, paid snapshot, replacement and production export; deletion/retention removes both with the existing ownership safeguards.
- Licence/source/build notices ship with the exact decoder artifact. Build hashes and a repeatable security-update process are recorded.
- Mobile performance/memory and Safari behaviour are checked separately before promising broad mobile compatibility.

On the inspected Windows host, the Docker CLI is present, but its daemon, image availability and codec build environment were **not checked**. `emcc` and `emcmake` were not found on PATH. No Emscripten SDK, container image, decoder dependency or HEIC fixture was installed/downloaded, and no native Safari, WASM decode or memory benchmark was run. This document establishes a feasible engineering direction, not completion evidence.
