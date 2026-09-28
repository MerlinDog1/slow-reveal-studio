import type { RenderGeometry } from "./renderers";
import {
  buildKitGuide,
  kitGuidePages,
  kitGuideText,
  KIT_GUIDE_PAGE,
} from "./kit-guide";
import { hashBlob } from "./browser-subject-mask";

export type KitRasterizer = (
  svg: string,
  width: number,
  height: number,
  dpi: number,
) => Promise<Blob>;

/** A local prototype includes no order authority or material approval. */
export async function prototypeKitFiles(
  geometry: RenderGeometry,
  rasterize: KitRasterizer,
) {
  const guide = buildKitGuide(geometry);
  const geometrySha256 = await hashBlob(new Blob([JSON.stringify(geometry)]));
  const pages = kitGuidePages(geometry);
  const dpi = 300;
  const widthMm = KIT_GUIDE_PAGE.widthMm,
    heightMm = KIT_GUIDE_PAGE.heightMm;
  const pagePixels = {
    width: Math.round((widthMm / 25.4) * dpi),
    height: Math.round((heightMm / 25.4) * dpi),
  };
  const files: { key: string; path: string; blob: Blob }[] = [];
  const add = (key: string, path: string, data: BlobPart, mime: string) =>
    files.push({ key, path, blob: new Blob([data], { type: mime }) });
  add(
    "guideModel",
    "kit/guide.json",
    JSON.stringify({ geometrySha256, guide }, null, 2),
    "application/json",
  );
  add("guideText", "kit/making-guide.txt", kitGuideText(guide), "text/plain");
  const pngs: Uint8Array<ArrayBuffer>[] = [];
  for (const [i, svg] of pages.entries()) {
    add(
      `guidePage${i + 1}`,
      `kit/making-guide-page-${i + 1}.svg`,
      svg,
      "image/svg+xml",
    );
    pngs.push(
      new Uint8Array(
        await (
          await rasterize(svg, pagePixels.width, pagePixels.height, dpi)
        ).arrayBuffer(),
      ),
    );
  }
  const { createArtworkPdf } = await import("./artwork-pdf");
  const pdf = createArtworkPdf({
    pages: pngs,
    widthMm,
    heightMm,
    dpi,
    contentSha256: await hashBlob(new Blob(pngs)),
    title: "Slow Reveal Studio - draft making guide",
    subject:
      "Draft for physical trials. Materials, instructions and colour matching are unvalidated.",
  });
  add("makingGuidePdf", "kit/making-guide.pdf", pdf, "application/pdf");
  const packing = {
    status: "draft-for-physical-trial",
    source: "unpaid-local-prototype",
    geometrySha256,
    dimensions: guide.dimensions,
    mode: guide.mode,
    materials: guide.materials.map((item) => ({
      ...item,
      supplier: null,
      sku: null,
      lot: null,
      quantity: null,
      packed: false,
    })),
    palette: guide.legend,
    note: "Requirements only. No material assignment, quantity or completed packing is confirmed.",
  };
  add(
    "packingListJson",
    "kit/packing-list.json",
    JSON.stringify(packing, null, 2),
    "application/json",
  );
  add(
    "packingListText",
    "kit/packing-list.txt",
    [
      "DRAFT FOR PHYSICAL TRIALS - UNVALIDATED",
      "Unpaid local prototype; this is not an order or packing approval.",
      `${guide.title} / ${guide.dimensions.widthMm} x ${guide.dimensions.heightMm} mm`,
      "",
      ...guide.materials.map(
        (item) => `[ ] ${item.label} | supplier/SKU/lot/quantity: __________`,
      ),
      "",
      packing.note,
    ].join("\n"),
    "text/plain",
  );
  const manifestFiles = Object.fromEntries(
    await Promise.all(
      files.map(async (file) => [
        file.key,
        {
          path: file.path,
          mime: file.blob.type,
          bytes: file.blob.size,
          sha256: await hashBlob(file.blob),
        },
      ]),
    ),
  );
  return {
    files,
    manifest: {
      version: guide.version,
      status: guide.status,
      pages: pages.length,
      dpi,
      geometrySha256,
      files: manifestFiles,
    },
  };
}
