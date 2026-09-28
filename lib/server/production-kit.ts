import sharp from "sharp";
import { createArtworkPdf, ARTWORK_PDF_VERSION } from "../artwork-pdf";
import {
  buildKitGuide,
  kitGuidePages,
  kitGuideText,
  KIT_GUIDE_PAGE,
} from "../kit-guide";
import { supportsPalette, type RenderGeometry } from "../renderers";
import { digest } from "./security";

type KitContext = {
  orderId: string;
  revisionId: string;
  snapshotHash: string;
  productId: string;
  finishId: string;
  inkId: string;
};
type KitFile = { path: string; mime: string; data: Buffer };
export type PackageFileDescriptor = {
  path: string;
  mime: string;
  bytes: number;
  sha256: string;
};
export function packageFileDescriptor(
  path: string,
  mime: string,
  data: Buffer,
): PackageFileDescriptor {
  return { path, mime, bytes: data.byteLength, sha256: digest(data) };
}

/** Trial instructions derive only from saved geometry; private order context lives in a separate wrapper. */
export async function createProductionKit(
  geometry: RenderGeometry,
  context: KitContext,
) {
  const guide = buildKitGuide(geometry);
  const geometrySha256 = digest(JSON.stringify(geometry));
  const pages = kitGuidePages(geometry);
  if (pages.length < 2 || pages.length > 5)
    throw new Error(
      "The making guide must contain between two and five A4 pages.",
    );
  const dpi = 300;
  const widthPx = Math.round((KIT_GUIDE_PAGE.widthMm / 25.4) * dpi);
  const heightPx = Math.round((KIT_GUIDE_PAGE.heightMm / 25.4) * dpi);
  const rasters: Buffer[] = [];
  // Render sequentially to bound peak raster memory for the A4 pages.
  for (const svg of pages) {
    const rasterSvg = svg.replace(/<svg\b[^>]*>/, (tag) =>
      tag
        .replace(/\bwidth="[^"]*"/, `width="${widthPx}px"`)
        .replace(/\bheight="[^"]*"/, `height="${heightPx}px"`),
    );
    rasters.push(
      await sharp(Buffer.from(rasterSvg), {
        density: 72,
        limitInputPixels: 100_000_000,
      })
        .withMetadata({ density: dpi })
        .png()
        .toBuffer(),
    );
  }
  const pdf = Buffer.from(
    createArtworkPdf({
      pages: rasters,
      widthMm: KIT_GUIDE_PAGE.widthMm,
      heightMm: KIT_GUIDE_PAGE.heightMm,
      dpi,
      contentSha256: digest(Buffer.concat(rasters)),
      title: "Slow Reveal Studio trial making guide",
      subject:
        "Draft for physical trial; physical materials and packing remain unassigned",
    }),
  );
  const binding = {
    orderId: context.orderId,
    revisionId: context.revisionId,
    snapshotHash: context.snapshotHash,
    geometrySha256,
  };
  const packing = {
    schemaVersion: 1,
    status: guide.status,
    packingStatus: "not-confirmed",
    ...binding,
    rendererVersion: geometry.version,
    guideVersion: guide.version,
    mode: geometry.mode,
    dimensionsMm: guide.dimensions,
    selectedProduct: {
      productId: context.productId,
      finishId: context.finishId,
      inkId: context.inkId,
    },
    settings: geometry.settings,
    palette: guide.legend,
    materials: guide.materials.map((item) => ({
      ...item,
      stock: { sku: null, batchOrLot: null, quantity: null },
      packed: false,
    })),
    unresolved: [
      "Physical substrate, marker, guide visibility and making trial approval.",
      "Stock SKU, batch or lot, and measured quantity for every material.",
      "Review and print approval of this exact current artwork revision.",
      "Packing confirmation against the approved artwork and assigned materials.",
    ],
  };
  const packingText = [
    "SLOW REVEAL STUDIO - TRIAL PACKING REQUIREMENTS",
    "DRAFT FOR PHYSICAL TRIAL. This file is not a packing or print approval.",
    `Order: ${context.orderId}`,
    `Artwork revision: ${context.revisionId}`,
    `Snapshot SHA-256: ${context.snapshotHash}`,
    `Geometry SHA-256: ${geometrySha256}`,
    `Mode: ${geometry.mode}; artwork: ${geometry.widthMm} x ${geometry.heightMm} mm`,
    `Product: ${context.productId}; finish: ${context.finishId}; selected ink: ${context.inkId}`,
    "Exact canonical artwork settings are recorded in packing-list.json. No customer source or lettering is printed here.",
    "",
    "MATERIAL REQUIREMENTS - ALL STOCK ASSIGNMENTS UNRESOLVED",
    ...packing.materials.flatMap((item) => [
      `[ ] ${item.label}`,
      "    SKU: unassigned; batch/lot: unassigned; quantity: unassigned; packed: not confirmed",
    ]),
    "",
    "DIGITAL COLOUR KEY - PHYSICAL MARKERS MUST BE ASSIGNED",
    ...guide.legend.map(
      (entry) =>
        `${entry.index === null ? "Single ink" : `Key ${entry.id}`}: ${entry.color}${supportsPalette(geometry.mode) ? `; ${entry.usedCellCount} ${geometry.mode === "mosaic" ? "cells" : "marks"}` : ""}. Marker SKU and quantity unassigned.`,
    ),
    "",
    "UNRESOLVED",
    ...packing.unresolved,
    "",
    `Guide: ${guide.version}; renderer: ${geometry.version}.`,
    "",
  ].join("\n");
  const files: Record<string, KitFile> = {
    makingGuidePdf: {
      path: "kit/making-guide.pdf",
      mime: "application/pdf",
      data: pdf,
    },
    guideModel: {
      path: "kit/guide.json",
      mime: "application/json",
      data: Buffer.from(JSON.stringify({ ...binding, guide }, null, 2)),
    },
    guideText: {
      path: "kit/making-guide.txt",
      mime: "text/plain; charset=utf-8",
      data: Buffer.from(kitGuideText(guide)),
    },
    ...Object.fromEntries(
      pages.map((svg, i) => [
        `guidePage${i + 1}`,
        {
          path: `kit/making-guide-page-${i + 1}.svg`,
          mime: "image/svg+xml",
          data: Buffer.from(svg),
        },
      ]),
    ),
    packingListJson: {
      path: "kit/packing-list.json",
      mime: "application/json",
      data: Buffer.from(JSON.stringify(packing, null, 2)),
    },
    packingListText: {
      path: "kit/packing-list.txt",
      mime: "text/plain; charset=utf-8",
      data: Buffer.from(packingText),
    },
  };
  return {
    files: Object.values(files),
    manifest: {
      version: guide.version,
      status: guide.status,
      pages: pages.length,
      dpi,
      dimensionsMm: KIT_GUIDE_PAGE,
      pdfFormatVersion: ARTWORK_PDF_VERSION,
      geometrySha256,
      palette: guide.legend,
      files: Object.fromEntries(
        Object.entries(files).map(([key, file]) => [
          key,
          packageFileDescriptor(file.path, file.mime, file.data),
        ]),
      ),
    },
  };
}
