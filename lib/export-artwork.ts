import {
  toSvg,
  effectiveGuideColor,
  type RenderGeometry,
} from "@/lib/renderers";
import { withPngResolution } from "@/lib/png-resolution";
import { hashBlob } from "@/lib/browser-subject-mask";
import {
  normalizeSubjectMask,
  assertSubjectMaskBinding,
  type SubjectMask,
  type SubjectMaskCrop,
} from "@/lib/subject-mask";
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export async function svgToPng(
  svg: string,
  width: number,
  height: number,
  dpi = 150,
): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not rasterise artwork."));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(image, 0, 0, width, height);
    const encoded = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Image export failed."))),
        "image/png",
      ),
    );
    return new Blob(
      [withPngResolution(new Uint8Array(await encoded.arrayBuffer()), dpi)],
      { type: "image/png" },
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function exportArtwork(
  geometry: RenderGeometry,
  format: "svg" | "png" | "pdf" | "package",
  variant: "finished" | "template",
  source?: Blob,
  crop?: unknown,
  subjectMask?: SubjectMask,
) {
  let maskJson: string | undefined;
  let maskHash: string | undefined;
  if (subjectMask) {
    if (!source || !crop)
      throw new Error(
        "The selected artwork needs its original photo and crop for export.",
      );
    const mask = normalizeSubjectMask(subjectMask);
    assertSubjectMaskBinding(mask, {
      sourceSha256: await hashBlob(source),
      crop: crop as SubjectMaskCrop,
      widthMm: geometry.widthMm,
      heightMm: geometry.heightMm,
    });
    maskJson = JSON.stringify(mask);
    maskHash = await hashBlob(new Blob([maskJson]));
  } else if ((geometry.settings.subjectMaskStrength ?? 0) > 0) {
    throw new Error("This artwork is missing its manual subject selection.");
  }
  const stem = `slow-reveal_${geometry.mode}_${geometry.widthMm}x${geometry.heightMm}mm`;
  const svg = toSvg(geometry, variant, { background: variant !== "template" });
  if (format === "svg")
    return downloadBlob(
      new Blob([svg], { type: "image/svg+xml" }),
      `${stem}_${variant}.svg`,
    );
  const dpi = 150;
  const width = Math.round((geometry.widthMm / 25.4) * dpi),
    height = Math.round((geometry.heightMm / 25.4) * dpi);
  if (format === "png")
    return downloadBlob(
      await svgToPng(svg, width, height, dpi),
      `${stem}_${variant}_${dpi}dpi.png`,
    );
  const { createArtworkPdf } = await import("./artwork-pdf");
  const makePdf = async (
    markup: string,
    outputVariant: "finished" | "template",
  ) => {
    const png = await svgToPng(markup, width, height, dpi);
    const buffer = new Uint8Array(await png.arrayBuffer());
    const pdf = createArtworkPdf({
      pages: [buffer],
      widthMm: geometry.widthMm,
      heightMm: geometry.heightMm,
      dpi,
      contentSha256: await hashBlob(png),
      title: `Slow Reveal Studio ${geometry.mode} ${outputVariant}`,
      subject: "Prototype artwork - physical validation required",
    });
    return new Blob([pdf], { type: "application/pdf" });
  };
  if (format === "pdf")
    return downloadBlob(await makePdf(svg, variant), `${stem}_${variant}.pdf`);
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const template = toSvg(geometry, "template", { background: false }),
    finished = toSvg(geometry, "finished");
  zip.file("production/template.svg", template);
  zip.file(
    "production/template.png",
    await svgToPng(template, width, height, dpi),
  );
  zip.file("production/template.pdf", await makePdf(template, "template"));
  zip.file(
    "preview/finished.png",
    await svgToPng(
      finished,
      Math.round((geometry.widthMm / 25.4) * (dpi / 3)),
      Math.round((geometry.heightMm / 25.4) * (dpi / 3)),
      dpi / 3,
    ),
  );
  zip.file("preview/template.svg", template);
  if (source) {
    const extension =
      source.type === "image/png"
        ? "png"
        : source.type === "image/webp"
          ? "webp"
          : "jpg";
    zip.file(`source/original.${extension}`, source);
  }
  zip.file(
    "render-settings.json",
    JSON.stringify({ settings: geometry.settings, crop }, null, 2),
  );
  zip.file("geometry.json", JSON.stringify(geometry));
  if (maskJson) zip.file("source/subject-mask.json", maskJson);
  const { prototypeKitFiles } = await import("./prototype-kit");
  const kit = await prototypeKitFiles(geometry, svgToPng);
  for (const file of kit.files) zip.file(file.path, file.blob);
  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        schemaVersion: 1,
        rendererVersion: geometry.version,
        createdAt: new Date().toISOString(),
        dimensions: { widthMm: geometry.widthMm, heightMm: geometry.heightMm },
        rasterDpi: dpi,
        previewRasterDpi: dpi / 3,
        vector: "SVG in millimetres",
        detailPreservation: geometry.settings.detailPreservation ?? 0,
        effectiveGuideColor: effectiveGuideColor(geometry.settings),
        requestedGuideColor: geometry.settings.guideColor ?? null,
        status: "prototype-not-approved-for-print",
        stats: geometry.stats,
        kitGuide: kit.manifest,
        ...(maskHash
          ? {
              subjectMask: {
                path: "source/subject-mask.json",
                sha256: maskHash,
              },
            }
          : {}),
      },
      null,
      2,
    ),
  );
  zip.file(
    "READ-ME.txt",
    "Prototype artwork. Print the artwork PDF at actual size (100%), never fit to page. Confirm dimensions with a ruler. Canvas, guides, marker coverage and physical completion must be tested before accepting paid orders. SVG is resolution independent; production template PNG and raster PDF are 150 dpi. The smaller finished PNG preview is 50 dpi. The separate A4 making guide is a 300 dpi draft for physical trials, with an exact palette key and unconfirmed packing requirements. PNG physical dimensions are subject to pixel and pixels-per-metre rounding. PDF metadata uses a fixed reproducibility date, not a print, purchase or approval date. Reproducible PDF bytes require identical raster pixels and dependency versions; browser and server rasterizers can differ. This download is local and is not a paid order.",
  );
  downloadBlob(
    await zip.generateAsync({ type: "blob" }),
    `${stem}_prototype.zip`,
  );
}
