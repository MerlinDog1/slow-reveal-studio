import sharp from "sharp";
import JSZip from "jszip";
import { jsPDF } from "jspdf";
import { randomUUID } from "node:crypto";
import {
  renderImage,
  toSvg,
  normalizeSettings,
  RENDERER_VERSION,
} from "../renderers";
import type { RenderSettings, RenderGeometry } from "../renderers/types";
import { getAsset, putAsset } from "./assets";
import type { Crop, Design, Package } from "./schema";
import { ApiError, digest } from "./security";

/** A fixed 1000px analysis raster is shared with the editor; final geometry remains in mm. */
export async function cropRaster(
  bytes: Buffer,
  crop: Crop,
  widthMm: number,
  heightMm: number,
) {
  const longest = 1000;
  const targetW = Math.round((longest * widthMm) / Math.max(widthMm, heightMm));
  const targetH = Math.round(
    (longest * heightMm) / Math.max(widthMm, heightMm),
  );
  const oriented = await sharp(bytes, { limitInputPixels: 40_000_000 })
    .autoOrient()
    .rotate(crop.rotation)
    .toBuffer();
  const meta = await sharp(oriented).metadata();
  if (!meta.width || !meta.height || (meta.pages ?? 1) > 1)
    throw new ApiError(415, "Use a single-frame photograph.");
  if (
    Math.min(meta.width, meta.height) < 32 ||
    Math.max(meta.width, meta.height) / Math.min(meta.width, meta.height) > 20
  )
    throw new ApiError(415, "Unsupported source aspect ratio.");
  const scale =
    Math.max(targetW / meta.width, targetH / meta.height) * crop.zoom;
  const width = Math.max(targetW, Math.round(meta.width * scale));
  const height = Math.max(targetH, Math.round(meta.height * scale));
  const left = Math.max(
    0,
    Math.min(
      width - targetW,
      Math.round(((width - targetW) / 2) * (1 - crop.x)),
    ),
  );
  const top = Math.max(
    0,
    Math.min(
      height - targetH,
      Math.round(((height - targetH) / 2) * (1 - crop.y)),
    ),
  );
  const image = sharp(oriented)
    .resize(width, height, { fit: "fill" })
    .extract({ left, top, width: targetW, height: targetH })
    .flatten({ background: "#ffffff" })
    .ensureAlpha();
  const { data, info } = await image
    .clone()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    raster: {
      data: new Uint8ClampedArray(data),
      width: info.width,
      height: info.height,
    },
    cropped: await image.jpeg({ quality: 95 }).toBuffer(),
  };
}
export async function renderDesign(
  design: Design,
  settings: RenderSettings = design.settings,
  crop: Crop = design.crop,
) {
  const source = await getAsset(design.source);
  const normalized = normalizeSettings(settings);
  const { raster, cropped } = await cropRaster(
    source,
    crop,
    normalized.widthMm,
    normalized.heightMm,
  );
  return { geometry: renderImage(raster, normalized), cropped, source };
}
export function proofHash(design: Design, geometry: RenderGeometry): string {
  return digest(
    JSON.stringify({
      sourceSha256: design.source.sha256,
      rendererVersion: RENDERER_VERSION,
      crop: design.crop,
      geometry,
    }),
  );
}
export async function createProductionPackage(
  design: Design,
  orderId: string,
  settings = design.settings,
  crop = design.crop,
  expectedProofHash?: string,
): Promise<Package> {
  const { geometry, source, cropped } = await renderDesign(
    design,
    settings,
    crop,
  );
  const snapshotHash = proofHash({ ...design, settings, crop }, geometry);
  if (expectedProofHash !== undefined && snapshotHash !== expectedProofHash)
    throw new ApiError(
      409,
      "Your production proof has changed. Review both saved previews again before checkout.",
    );
  const template = toSvg(geometry, "template", { background: false });
  const finished = toSvg(geometry, "finished");
  // Explicit pixel dimensions avoid SVG millimetre units being scaled twice by some libvips builds.
  const rasterWidth = Math.round((geometry.widthMm / 25.4) * 300);
  const rasterHeight = Math.round((geometry.heightMm / 25.4) * 300);
  if (rasterWidth * rasterHeight > 100_000_000)
    throw new ApiError(
      413,
      "This production size exceeds the raster export limit.",
    );
  const rasterSvg = template.replace(
    `width="${geometry.widthMm}mm" height="${geometry.heightMm}mm"`,
    `width="${rasterWidth}px" height="${rasterHeight}px"`,
  );
  const png = await sharp(Buffer.from(rasterSvg), {
    density: 72,
    limitInputPixels: 100_000_000,
  })
    .withMetadata({ density: 300 })
    .png()
    .toBuffer();
  const previewFinished = await sharp(Buffer.from(finished))
    .resize({ width: 1000, height: 1000, fit: "inside" })
    .flatten({ background: "#f4efe6" })
    .jpeg({ quality: 90 })
    .toBuffer();
  const previewTemplate = await sharp(Buffer.from(template))
    .resize({ width: 1000, height: 1000, fit: "inside" })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 90 })
    .toBuffer();
  const pdf = new jsPDF({
    orientation:
      geometry.widthMm > geometry.heightMm ? "landscape" : "portrait",
    unit: "mm",
    format: [geometry.widthMm, geometry.heightMm],
    compress: true,
  });
  pdf.addImage(
    new Uint8Array(png),
    "PNG",
    0,
    0,
    geometry.widthMm,
    geometry.heightMm,
    undefined,
    "FAST",
  );
  const pdfBytes = Buffer.from(pdf.output("arraybuffer"));
  const revisionId = randomUUID();
  const prefix = `${orderId}_${design.mode}_${geometry.widthMm}x${geometry.heightMm}mm_${design.inkId}`;
  const originalExtension =
    design.source.mime === "image/png"
      ? "png"
      : design.source.mime === "image/webp"
        ? "webp"
        : "jpg";
  const manifest = {
    schemaVersion: 1,
    orderId,
    revisionId,
    sourceSha256: design.source.sha256,
    snapshotHash,
    rendererVersion: RENDERER_VERSION,
    mode: design.mode,
    dimensionsMm: { width: geometry.widthMm, height: geometry.heightMm },
    dpi: 300,
    bleedMm: 0,
    safeMarginMm: settings.safeMarginMm,
    guideWidthMm: settings.guideWidthMm ?? 0.15,
    substrate: design.finishId,
    ink: design.inkId,
    productionStatus: "requires-human-review",
    kit:
      design.mode === "line-amplification"
        ? ["canvas", "markers", "instructions", "ruler / straight edge"]
        : ["canvas", "mode-appropriate markers", "instructions"],
    warnings: [
      ...geometry.warnings,
      "Physical UV-print and pen approval is required before printing.",
      "PDF is a 300 DPI raster embedded at exact physical size; SVG retains vector geometry.",
      "No bleed, registration marks or white-ink spot layer: confirm printer workflow before approval.",
    ],
    stats: geometry.stats,
    files: {
      templateSvg: { sha256: digest(template) },
      templatePng: { sha256: digest(png) },
      templatePdf: { sha256: digest(pdfBytes) },
    },
  };
  const archive = new JSZip();
  archive.file(`source/original.${originalExtension}`, source);
  archive.file("source/cropped.jpg", cropped);
  archive.file("preview/finished.jpg", previewFinished);
  archive.file("preview/template.jpg", previewTemplate);
  archive.file(`production/${prefix}_template.svg`, template);
  archive.file(`production/${prefix}_template.png`, png);
  archive.file(`production/${prefix}_template.pdf`, pdfBytes);
  archive.file("manifest.json", JSON.stringify(manifest, null, 2));
  archive.file(
    "render-settings.json",
    JSON.stringify(
      { settings, crop, rendererVersion: RENDERER_VERSION },
      null,
      2,
    ),
  );
  archive.file("geometry.json", JSON.stringify(geometry));
  archive.file(
    "order.json",
    JSON.stringify(
      {
        orderId,
        mode: design.mode,
        productId: design.productId,
        finishId: design.finishId,
        inkId: design.inkId,
        snapshotHash,
      },
      null,
      2,
    ),
  );
  const base = `orders/${orderId}/${revisionId}`;
  const privateSource = await putAsset(
    `${base}/original.${originalExtension}`,
    source,
    design.source.mime,
  );
  const templateSvg = await putAsset(
    `${base}/template.svg`,
    Buffer.from(template),
    "image/svg+xml",
  );
  const finishedSvg = await putAsset(
    `${base}/finished.svg`,
    Buffer.from(finished),
    "image/svg+xml",
  );
  const zipped = await putAsset(
    `${base}/${prefix}.zip`,
    await archive.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 4 },
    }),
    "application/zip",
  );
  return {
    archive: zipped,
    templateSvg,
    finishedSvg,
    source: privateSource,
    manifest,
    snapshotHash,
  };
}
