// Public licensed photograph only. Run: npx tsx scripts/build-reveal-studies.ts
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  CROSS_STITCH_PRESETS,
  DEFAULT_SETTINGS,
  PRESETS,
  RENDERER_VERSION,
  renderImage,
  toSvg,
  type RenderSettings,
} from "../lib/renderers";
import {
  DEFAULT_MARKER_PROFILE_ID,
  getMarkerPalette,
  getMarkerPaletteProfile,
} from "../lib/marker-palettes";

const hash = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const modes = [
  "colour-blend",
  "tv-weave",
  "fibonacci",
  "cross-stitch",
] as const;

async function sourceHashes() {
  const files = [
    "scripts/build-reveal-studies.ts",
    "lib/marker-palettes.ts",
    "lib/mosaic-palette.ts",
    "lib/optical-palette.ts",
    "lib/subject-mask.ts",
    ...(await readdir("lib/renderers"))
      .filter((file) => /\.(ts|json)$/.test(file))
      .map((file) => `lib/renderers/${file}`),
  ].sort();
  return Object.fromEntries(
    await Promise.all(
      files.map(async (file) => [file, hash(await readFile(file))]),
    ),
  );
}

async function main() {
  const destination = "public/marketing/reveal";
  const provenance = JSON.parse(
    await readFile("public/references/manifest.json", "utf8"),
  ) as { id: string; file: string; sha256: string; [key: string]: unknown }[];
  const source = provenance.find((reference) => reference.id === "portrait");
  assert.ok(source, "Licensed portrait provenance must exist");
  const sourceBytes = await readFile(path.join("public", source.file));
  assert.equal(
    hash(sourceBytes),
    source.sha256,
    "Licensed source hash matches",
  );
  const before = await sourceHashes();
  const { data, info } = await sharp(sourceBytes)
    .autoOrient()
    .resize(800, 1000, { fit: "cover", position: "centre" })
    .flatten({ background: "#ffffff" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const input = {
    data: new Uint8ClampedArray(data),
    width: info.width,
    height: info.height,
  };
  const profile = getMarkerPaletteProfile(DEFAULT_MARKER_PROFILE_ID);
  const studies = [];
  await mkdir(destination, { recursive: true });
  for (const mode of modes) {
    const settings: RenderSettings = {
      ...DEFAULT_SETTINGS,
      ...PRESETS.standard,
      ...(mode === "cross-stitch" ? CROSS_STITCH_PRESETS.standard : {}),
      mode,
      widthMm: 400,
      heightMm: 500,
      palette: getMarkerPalette(profile.id, 16),
    };
    const geometry = renderImage(input, settings);
    const serialized = JSON.stringify(geometry);
    assert.equal(
      hash(serialized),
      hash(JSON.stringify(renderImage(input, settings))),
      `${mode} geometry must be deterministic`,
    );
    assert.deepEqual(
      geometry.settings.palette,
      getMarkerPalette(profile.id, 16),
    );
    assert.ok(geometry.cells.length > 0);
    const assets = [];
    for (const variant of ["template", "finished"] as const) {
      const svg = toSvg(geometry, variant);
      assert.ok(svg.includes('width="400mm" height="500mm"'));
      const highResolution = await sharp(Buffer.from(svg), {
        density: (1600 * 25.4) / 400,
        limitInputPixels: 16_000_000,
      })
        .resize(1600, 2000, { fit: "fill" })
        .png()
        .toBuffer();
      const bytes = await sharp(highResolution)
        .resize(640, 800, { kernel: "lanczos3" })
        .webp({ quality: 86, effort: 6 })
        .toBuffer();
      const metadata = await sharp(bytes).metadata();
      assert.equal(metadata.width, 640);
      assert.equal(metadata.height, 800);
      const file = `/marketing/reveal/${mode}-${variant}.webp`;
      await writeFile(path.join("public", file), bytes);
      assets.push({
        variant,
        file,
        width: metadata.width,
        height: metadata.height,
        bytes: bytes.length,
        sha256: hash(bytes),
        svgSha256: hash(svg),
        svgBytes: Buffer.byteLength(svg),
        supersampledPngSha256: hash(highResolution),
        caption:
          variant === "template"
            ? "Digital numbered guide study from exact renderer geometry; physical guide visibility is untested."
            : "Digital finished-colour simulation from the same geometry; not a hand-completed canvas or calibrated paint result.",
      });
    }
    studies.push({
      mode,
      kind: "digital-renderer-study",
      isPhysicalEvidence: false,
      rendererVersion: RENDERER_VERSION,
      settings: geometry.settings,
      geometrySha256: hash(serialized),
      geometryBytes: Buffer.byteLength(serialized),
      stats: geometry.stats,
      warnings: geometry.warnings,
      assets,
    });
    console.log(
      `${mode}: ${geometry.stats.markCount} marks; guide and finished ready`,
    );
  }
  assert.deepEqual(
    before,
    await sourceHashes(),
    "Source files changed during generation; rerun",
  );
  const manifest = {
    schemaVersion: 1,
    title: "Four colour reveal modes — licensed portrait study",
    rendererVersion: RENDERER_VERSION,
    isPhysicalEvidence: false,
    source,
    sourcePreparation: {
      orientation: "EXIF auto orientation",
      crop: "centre cover to 4:5",
      rasterWidth: info.width,
      rasterHeight: info.height,
      rgbaSha256: hash(data),
      transparencyBackground: "#ffffff",
    },
    markerPalette: {
      id: profile.id,
      label: profile.label,
      count: 16,
      status: profile.status,
      disclaimer: profile.disclaimer,
      productUrl: profile.productUrl,
      chart: profile.source,
      colours: profile.colours.slice(0, 16),
    },
    rasterization: {
      supersampling: { width: 1600, height: 2000, format: "png" },
      output: {
        width: 640,
        height: 800,
        format: "webp",
        quality: 86,
        effort: 6,
      },
      kernel: "lanczos3",
      background: "shared toSvg default preview background",
      note: "Each pair serializes one identical geometry object. Geometry and SVG hashes retained; large intermediates are reproducible and not published.",
    },
    reproduction: "npx tsx scripts/build-reveal-studies.ts",
    sourceHashes: before,
    runtime: { node: process.version, sharp: sharp.versions },
    studies,
  };
  await writeFile(
    `${destination}/manifest.json`,
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(
    `Wrote ${studies.length * 2} WebP assets and standalone manifest.`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
