import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import {
  DEFAULT_SETTINGS,
  RENDERER_VERSION,
  renderImage,
  type RenderMode,
} from "../lib/renderers";
import {
  buildKitGuide,
  kitGuidePages,
  kitGuideText,
  KIT_GUIDE_PAGE,
  KIT_GUIDE_VERSION,
} from "../lib/kit-guide";
import { ARTWORK_PDF_VERSION, createArtworkPdf } from "../lib/artwork-pdf";

const hash = (data: string | Uint8Array) =>
  createHash("sha256").update(data).digest("hex");
const json = (data: unknown) => `${JSON.stringify(data, null, 2)}\n`;

async function main() {
  const sourceRecords = JSON.parse(
    await readFile("public/references/manifest.json", "utf8"),
  );
  const source = (
    Array.isArray(sourceRecords) ? sourceRecords : sourceRecords.images
  ).find((item: { id: string }) => item.id === "portrait");
  assert.ok(source, "Licensed reference record missing");
  const sourceBytes = await readFile(`public${source.file}`);
  assert.equal(hash(sourceBytes), source.sha256);
  const { data, info } = await sharp(sourceBytes)
    .autoOrient()
    .resize(800, 1000, { fit: "cover", position: "centre" })
    .flatten({ background: "#ffffff" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const raster = {
    data: new Uint8ClampedArray(data),
    width: info.width,
    height: info.height,
  };
  const out = "output/pdf/srs-kit-guide-drafts";
  const qa = ".data/qa/kit-guides";
  await mkdir(out, { recursive: true });
  await mkdir(qa, { recursive: true });
  const artifacts: {
    file: string;
    bytes: number;
    sha256: string;
    mime: string;
  }[] = [];
  const artifact = async (
    file: string,
    bytes: string | Uint8Array,
    mime: string,
  ) => {
    const buffer = typeof bytes === "string" ? Buffer.from(bytes) : bytes;
    await writeFile(file, buffer);
    const record = {
      file,
      bytes: buffer.byteLength,
      sha256: hash(buffer),
      mime,
    };
    artifacts.push(record);
    return record;
  };
  const pages: Uint8Array[] = [];
  const records = [];
  const dpi = 300;
  const widthPx = Math.round((KIT_GUIDE_PAGE.widthMm / 25.4) * dpi),
    heightPx = Math.round((KIT_GUIDE_PAGE.heightMm / 25.4) * dpi);
  const modes: RenderMode[] = [
    "dots",
    "mosaic",
    "contour",
    "line-amplification",
  ];
  for (const mode of modes) {
    const geometry = renderImage(raster, {
      ...DEFAULT_SETTINGS,
      mode,
      ...(mode === "mosaic"
        ? {
            spacingMm: 7,
            maxDiameterMm: 6.4,
            palette: ["#1e1e1c", "#445e7c", "#7b8b77", "#b97a68"],
          }
        : {}),
    });
    const model = buildKitGuide(geometry);
    const svgs = kitGuidePages(geometry);
    assert.equal(svgs.length, 2);
    assert.deepEqual(svgs, kitGuidePages(JSON.parse(JSON.stringify(geometry))));
    const geometryFile = await artifact(
      `${out}/${mode}-geometry.json`,
      json(geometry),
      "application/json",
    );
    const modelFile = await artifact(
      `${out}/${mode}-guide.json`,
      json(model),
      "application/json",
    );
    await artifact(
      `${out}/${mode}-guide.txt`,
      kitGuideText(model),
      "text/plain",
    );
    const firstPage = pages.length + 1;
    for (const [i, svg] of svgs.entries()) {
      await artifact(`${out}/${mode}-page-${i + 1}.svg`, svg, "image/svg+xml");
      const markup = svg.replace(
        `width="${KIT_GUIDE_PAGE.widthMm}mm" height="${KIT_GUIDE_PAGE.heightMm}mm"`,
        `width="${widthPx}px" height="${heightPx}px"`,
      );
      const png = await sharp(Buffer.from(markup), { density: 72 })
        .withMetadata({ density: dpi })
        .png()
        .toBuffer();
      pages.push(png);
      await writeFile(`${qa}/${mode}-page-${i + 1}.png`, png);
    }
    records.push({
      mode,
      firstPage,
      lastPage: pages.length,
      geometry: geometryFile,
      model: modelFile,
    });
  }
  const input = {
    pages,
    widthMm: KIT_GUIDE_PAGE.widthMm,
    heightMm: KIT_GUIDE_PAGE.heightMm,
    dpi,
    contentSha256: hash(Buffer.concat(pages)),
    title: "Slow Reveal Studio - draft kit guides for physical trials",
    subject:
      "Eight example A4 pages. Unvalidated instructions and materials; licensed reference artwork is not a completed kit.",
  };
  const pdf = createArtworkPdf(input);
  assert.deepEqual(pdf, createArtworkPdf(input), "PDF must be deterministic");
  const pdfArtifact = await artifact(
    "output/pdf/srs-kit-guide-drafts.pdf",
    pdf,
    "application/pdf",
  );
  const sourceFiles = [
    "scripts/build-kit-guide-examples.ts",
    "lib/kit-guide.ts",
    "lib/kit-guide-svg.ts",
    "lib/artwork-pdf.ts",
    "lib/renderers/fonts.ts",
    "lib/renderers/types.ts",
    "lib/mosaic-palette.ts",
    "lib/optical-palette.ts",
    "lib/renderers/optical.ts",
    "lib/renderers/stipple.ts",
    "lib/renderers/fibonacci.ts",
    "lib/renderers/creative.ts",
    "lib/renderers/creative-lines.ts",
    "lib/renderers/index.ts",
    "lib/renderers/modes.ts",
    "lib/renderers/sampling.ts",
    "lib/renderers/font-data.json",
    "lib/renderers/svg.ts",
    "package-lock.json",
  ];
  const sources = [];
  for (const file of sourceFiles) {
    const bytes = await readFile(file).catch((e) => {
      if (e.code === "ENOENT" && file.endsWith("kit-guide-svg.ts")) return null;
      throw e;
    });
    if (bytes) sources.push({ file, sha256: hash(bytes) });
  }
  await writeFile(
    "output/pdf/srs-kit-guide-drafts-manifest.json",
    json({
      schemaVersion: 1,
      kitGuideVersion: KIT_GUIDE_VERSION,
      rendererVersion: RENDERER_VERSION,
      pdfVersion: ARTWORK_PDF_VERSION,
      runtime: { node: process.version, sharp: sharp.versions },
      status: "draft-for-physical-trial",
      physicalValidation: "NOT PERFORMED",
      command: "npm run kit-guides",
      source,
      sourceCrop: "EXIF-oriented centre-cover 800x1000 pixels, flattened white",
      page: { ...KIT_GUIDE_PAGE, dpi, count: pages.length, widthPx, heightPx },
      modes: records,
      pdf: pdfArtifact,
      sources,
      artifacts,
    }),
  );
  process.stdout.write(
    json({
      pdf: pdfArtifact.file,
      pages: pages.length,
      bytes: pdfArtifact.bytes,
      sha256: pdfArtifact.sha256,
      status: "draft-for-physical-trial",
    }),
  );
}
main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Kit guide generation failed"}\n`,
  );
  process.exitCode = 1;
});
