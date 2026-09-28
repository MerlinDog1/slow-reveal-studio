import { toSvg, type RenderGeometry } from "@/lib/renderers";
import { withPngResolution } from "@/lib/png-resolution";
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
) {
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
  const { jsPDF } = await import("jspdf");
  const makePdf = async (markup: string) => {
    const png = await svgToPng(markup, width, height, dpi);
    const buffer = new Uint8Array(await png.arrayBuffer());
    const pdf = new jsPDF({
      orientation:
        geometry.widthMm > geometry.heightMm ? "landscape" : "portrait",
      unit: "mm",
      format: [geometry.widthMm, geometry.heightMm],
      compress: true,
    });
    pdf.addImage(buffer, "PNG", 0, 0, geometry.widthMm, geometry.heightMm);
    pdf.setProperties({
      title: `Slow Reveal Studio ${geometry.mode} ${variant}`,
      subject: "Prototype template — physical validation required",
    });
    return pdf.output("blob");
  };
  if (format === "pdf")
    return downloadBlob(await makePdf(svg), `${stem}_${variant}.pdf`);
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const template = toSvg(geometry, "template", { background: false }),
    finished = toSvg(geometry, "finished");
  zip.file("production/template.svg", template);
  zip.file(
    "production/template.png",
    await svgToPng(template, width, height, dpi),
  );
  zip.file("production/template.pdf", await makePdf(template));
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
        status: "prototype-not-approved-for-print",
        stats: geometry.stats,
      },
      null,
      2,
    ),
  );
  zip.file(
    "READ-ME.txt",
    "Prototype artwork. Print PDF at actual size (100%), never fit to page. Confirm dimensions with a ruler. Canvas, guides, marker coverage and physical completion must be tested before accepting paid orders. SVG is resolution independent; production template PNG and raster PDF are 150 dpi. The smaller finished PNG preview is 50 dpi. PNG physical dimensions are subject to pixel and pixels-per-metre rounding. This download is local and is not a paid order.",
  );
  downloadBlob(
    await zip.generateAsync({ type: "blob" }),
    `${stem}_prototype.zip`,
  );
}
