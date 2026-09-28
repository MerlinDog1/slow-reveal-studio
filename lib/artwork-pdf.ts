import { jsPDF } from "jspdf";

export const ARTWORK_PDF_VERSION = "slow-reveal-raster-pdf/1.0.0";
/** Reproducibility metadata, not the time an order or artwork was created. */
export const ARTWORK_PDF_DATE = "D:20000101000000+00'00'";

export interface ArtworkPdfInput {
  /** One PNG per page; all pages have the same physical size and resolution. */
  pages: readonly Uint8Array[];
  widthMm: number;
  heightMm: number;
  dpi: number;
  /** SHA-256 of the PNG payload(s). A document identifier only, never an access or proof token. */
  contentSha256: string;
  title?: string;
  subject?: string;
}

/** Stable raster PDF bytes for identical pixels, page dimensions and metadata in the same dependency build. */
export function createArtworkPdf({
  pages,
  widthMm,
  heightMm,
  dpi,
  contentSha256,
  title = "Slow Reveal Studio artwork",
  subject = "Raster artwork in millimetres; physical validation required",
}: ArtworkPdfInput): Uint8Array<ArrayBuffer> {
  if (
    !Number.isFinite(widthMm) ||
    !Number.isFinite(heightMm) ||
    widthMm <= 0 ||
    heightMm <= 0 ||
    widthMm > 1500 ||
    heightMm > 1500 ||
    !Number.isInteger(dpi) ||
    dpi < 1 ||
    dpi > 1200
  )
    throw new Error("Invalid PDF physical size or resolution.");
  if (!/^[a-f0-9]{64}$/i.test(contentSha256))
    throw new Error(
      "A stable SHA-256 content identity is required for PDF export.",
    );
  if (!Array.isArray(pages) || pages.length < 1 || pages.length > 32)
    throw new Error("PDF export requires between one and 32 PNG pages.");
  if (title.length > 200 || subject.length > 500)
    throw new Error("PDF metadata is too long.");

  const widthPx = Math.round((widthMm / 25.4) * dpi);
  const heightPx = Math.round((heightMm / 25.4) * dpi);
  if (widthPx < 1 || heightPx < 1 || widthPx * heightPx > 100_000_000)
    throw new Error("PDF raster dimensions exceed the export limit.");
  for (const png of pages) {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (
      !(png instanceof Uint8Array) ||
      png.byteLength < 33 ||
      signature.some((value, index) => png[index] !== value) ||
      png[12] !== 73 ||
      png[13] !== 72 ||
      png[14] !== 68 ||
      png[15] !== 82
    )
      throw new Error("PDF pages must contain valid PNG artwork.");
    const header = new DataView(png.buffer, png.byteOffset, png.byteLength);
    if (
      header.getUint32(8) !== 13 ||
      header.getUint32(16) !== widthPx ||
      header.getUint32(20) !== heightPx
    )
      throw new Error(
        "PNG dimensions do not match the PDF physical size and resolution.",
      );
  }

  const orientation = widthMm > heightMm ? "landscape" : "portrait";
  const pdf = new jsPDF({
    orientation,
    unit: "mm",
    format: [widthMm, heightMm],
    compress: true,
  });
  pdf.setCreationDate(ARTWORK_PDF_DATE);
  pdf.setFileId(contentSha256.slice(0, 32));
  pdf.setProperties({
    title,
    subject,
    creator: `${ARTWORK_PDF_VERSION}; ${dpi} dpi`,
  });
  pages.forEach((png, index) => {
    if (index > 0) pdf.addPage([widthMm, heightMm], orientation);
    pdf.addImage(png, "PNG", 0, 0, widthMm, heightMm, undefined, "FAST");
  });
  return new Uint8Array(pdf.output("arraybuffer"));
}
