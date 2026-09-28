import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { jsPDF } from "jspdf";
import {
  buildProductionCoupons,
  couponObservationRecord,
  couponSheetSvg,
} from "../lib/production-coupons";

const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const stableJson = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

async function main() {
  const pack = buildProductionCoupons();
  const geometryJson = stableJson(pack);
  assert.equal(
    geometryJson,
    stableJson(buildProductionCoupons()),
    "Coupon geometry must be deterministic.",
  );
  const root = path.resolve(".");
  const output = "output/pdf";
  const vectors = `${output}/srs-dot-coupons`;
  const qa = ".data/qa/coupons";
  const publicPdf = "public/production-coupons/srs-dot-coupons.pdf";
  await Promise.all(
    [vectors, qa, path.dirname(publicPdf)].map((directory) =>
      mkdir(path.join(root, directory), { recursive: true }),
    ),
  );
  const artifacts: Array<{
    file: string;
    bytes: number;
    sha256: string;
    mime: string;
    [key: string]: unknown;
  }> = [];
  async function artifact(
    file: string,
    bytes: string | Buffer,
    mime: string,
    extra: Record<string, unknown> = {},
  ) {
    const buffer = typeof bytes === "string" ? Buffer.from(bytes) : bytes;
    await writeFile(path.join(root, file), buffer);
    const entry = {
      file,
      bytes: buffer.length,
      sha256: hash(buffer),
      mime,
      ...extra,
    };
    artifacts.push(entry);
    return entry;
  }
  await artifact(`${vectors}/geometry.json`, geometryJson, "application/json");
  await artifact(
    `${output}/srs-dot-coupons-observation-record.md`,
    couponObservationRecord(pack),
    "text/markdown",
  );

  const widthPx = Math.round((pack.page.widthMm / 25.4) * pack.page.dpi);
  const heightPx = Math.round((pack.page.heightMm / 25.4) * pack.page.dpi);
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [pack.page.widthMm, pack.page.heightMm],
    compress: true,
  });
  // Reproducibility metadata only. This fixed date is not a print, trial or approval date.
  pdf.setCreationDate("D:20000101000000+00'00'");
  pdf.setFileId(hash(geometryJson).slice(0, 32));
  pdf.setProperties({
    title: "Slow Reveal Studio - unvalidated dot material coupons",
    subject:
      "Four A4 test sheets. Print 100 percent / Actual size. Physical validation not performed.",
    author: "Slow Reveal Studio",
    creator: "Shared millimetre geometry / Sharp / jsPDF",
  });
  const sheets = [];
  for (const [index, sheet] of pack.sheets.entries()) {
    const svg = couponSheetSvg(sheet);
    const svgArtifact = await artifact(
      `${vectors}/${sheet.id}.svg`,
      svg,
      "image/svg+xml",
      { widthMm: pack.page.widthMm, heightMm: pack.page.heightMm },
    );
    // Match the production pipeline: explicit pixels prevent double-scaling mm SVG units.
    const rasterSvg = svg.replace(
      `width="${pack.page.widthMm}mm" height="${pack.page.heightMm}mm"`,
      `width="${widthPx}px" height="${heightPx}px"`,
    );
    const png = await sharp(Buffer.from(rasterSvg), {
      density: 72,
      limitInputPixels: 100_000_000,
    })
      .withMetadata({ density: pack.page.dpi })
      .png()
      .toBuffer();
    const pngMetadata = await sharp(png).metadata();
    assert.equal(pngMetadata.width, widthPx);
    assert.equal(pngMetadata.height, heightPx);
    assert.equal(pngMetadata.density, pack.page.dpi);
    const pngArtifact = await artifact(
      `${qa}/${sheet.id}.png`,
      png,
      "image/png",
      {
        widthPx,
        heightPx,
        dpi: pack.page.dpi,
        ignoredReviewIntermediate: true,
      },
    );
    if (index > 0)
      pdf.addPage([pack.page.widthMm, pack.page.heightMm], "portrait");
    pdf.addImage(
      new Uint8Array(png),
      "PNG",
      0,
      0,
      pack.page.widthMm,
      pack.page.heightMm,
      undefined,
      "FAST",
    );
    sheets.push({
      id: sheet.id,
      page: index + 1,
      variant: sheet.variant,
      sampleIds: sheet.samples.map((sample) => sample.id),
      sampleGeometrySha256: hash(stableJson(sheet.samples)),
      calibrationSha256: hash(stableJson(sheet.calibration)),
      svg: svgArtifact.file,
      png: pngArtifact.file,
    });
  }
  const pdfBytes = Buffer.from(pdf.output("arraybuffer"));
  const canonical = await artifact(
    `${output}/srs-dot-coupons.pdf`,
    pdfBytes,
    "application/pdf",
    {
      pageCount: pack.sheets.length,
      widthMm: pack.page.widthMm,
      heightMm: pack.page.heightMm,
      rasterDpi: pack.page.dpi,
    },
  );
  const published = await artifact(publicPdf, pdfBytes, "application/pdf", {
    byteIdenticalTo: canonical.file,
  });
  assert.equal(
    hash(await readFile(path.join(root, publicPdf))),
    canonical.sha256,
  );
  const sourceFiles = [
    "lib/production-coupons.ts",
    "scripts/build-production-coupons.ts",
    "lib/renderers/svg.ts",
    "lib/renderers/types.ts",
    "lib/renderers/fonts.ts",
    "lib/renderers/font-data.json",
    "package-lock.json",
  ];
  const sourceHashes = await Promise.all(
    sourceFiles.map(async (file) => ({
      file,
      sha256: hash(await readFile(path.join(root, file))),
    })),
  );
  const manifest = {
    schemaVersion: 1,
    packVersion: pack.version,
    rendererVersion: pack.rendererVersion,
    fontVersion: pack.fontVersion,
    physicalValidation: pack.physicalValidation,
    page: {
      ...pack.page,
      count: pack.sheets.length,
      widthPx,
      heightPx,
      pdfWidthPt: (pack.page.widthMm * 72) / 25.4,
      pdfHeightPt: (pack.page.heightMm * 72) / 25.4,
    },
    interpretation: {
      pdf: "300 DPI raster embedded at exact A4 physical size; SVGs retain vectors and outlined type",
      guides:
        "Neutral black opacity candidates on a transparent background; not a white ink or warm-grey separation",
      calibration:
        "Measure tick centres and square centre-lines; not outside stroke edges",
      printInstruction: "100% / Actual size, never Fit to page",
      syntheticStatistics:
        "No photographs; zero source-image/time statistics are not applicable",
      fixedPdfMetadataDate:
        "2000-01-01T00:00:00Z (reproducibility metadata, not a physical trial date)",
      runtime: {
        node: process.version,
        sharp: sharp.versions.sharp,
        vips: sharp.versions.vips,
        jspdf: jsPDF.version,
      },
    },
    calibration: {
      strokeWidthMm: 0.2,
      horizontal: { from: [25, 259], to: [125, 259], lengthMm: 100 },
      vertical: { from: [190, 70], to: [190, 170], lengthMm: 100 },
      square: { from: [148, 247], to: [168, 267], widthMm: 20, heightMm: 20 },
    },
    uniqueSamples: 34,
    sheets,
    publicCopy: {
      canonical: canonical.file,
      public: published.file,
      sha256: canonical.sha256,
      byteIdentical: canonical.sha256 === published.sha256,
    },
    sourceHashes,
    artifacts,
  };
  const manifestFile = `${output}/srs-dot-coupons-manifest.json`;
  await writeFile(path.join(root, manifestFile), stableJson(manifest));
  console.log(
    JSON.stringify(
      {
        pdf: canonical.file,
        publicPdf,
        pages: pack.sheets.length,
        samples: manifest.uniqueSamples,
        bytes: canonical.bytes,
        sha256: canonical.sha256,
        manifest: manifestFile,
        reviewPngDirectory: qa,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
