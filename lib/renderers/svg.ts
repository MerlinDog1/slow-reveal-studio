import {
  normalizeSettings,
  usesOpticalColour,
  round,
  type RenderGeometry,
  type RenderSettings,
  type SvgOptions,
} from "./types";
import { measureLettering, outlineLettering } from "./fonts";

/** Maximum template outline width for validated settings; narrower paths keep their own width. */
export function effectiveGuideWidthMm(
  settings: Pick<RenderSettings, "guideWidthMm" | "minDiameterMm">,
): number {
  return Math.min(settings.guideWidthMm ?? 0.15, settings.minDiameterMm / 2);
}

/** Resolve template colour before or after the renderer's default inverted-ink mapping. */
export function effectiveGuideColor(
  settings: Pick<RenderSettings, "guideColor" | "inkColor" | "invert">,
): string {
  const selectedInk = color(settings.inkColor).toLowerCase();
  return color(
    settings.guideColor ??
      (settings.invert && selectedInk === "#1e1e1c" ? "#f4efe6" : selectedInk),
  ).toLowerCase();
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function n(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) > 100000)
    throw new Error("Invalid geometry coordinate.");
  return String(round(value));
}

function color(value: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error("Invalid SVG colour.");
  return value;
}

function outlinedText(
  text: NonNullable<RenderGeometry["text"]>,
  ink: string,
  opacity?: number,
): string {
  const shape = outlineLettering(text);
  return `<g data-lettering="outlines" aria-label="${escapeXml(text.value)}" fill="${ink}" stroke="none" transform="translate(${shape.x} ${shape.y}) scale(${shape.scale})"${opacity === undefined ? "" : ` opacity="${n(opacity)}"`}>${shape.glyphs.map((glyph) => `<path d="${glyph.d}" transform="translate(${glyph.x} 0)"/>`).join("")}</g>`;
}

/** Both previews and production exports serialize the same millimetre geometry. */
export function toSvg(
  geometry: RenderGeometry,
  variant: "finished" | "template",
  options: SvgOptions = {},
): string {
  if (variant !== "finished" && variant !== "template")
    throw new Error("Choose finished or template output.");
  const s = normalizeSettings(
    geometry.mode === "fibonacci" &&
      geometry.circles.length &&
      !geometry.cells.length
      ? { ...geometry.settings, palette: undefined }
      : geometry.settings,
  );
  if (geometry.widthMm !== s.widthMm || geometry.heightMm !== s.heightMm)
    throw new Error("Geometry dimensions do not match the saved settings.");
  if (
    geometry.circles.length + geometry.cells.length + geometry.paths.length >
    60000
  )
    throw new Error("Geometry exceeds the export mark limit.");
  const finished = variant === "finished";
  // Desktop SVG importers can misread zero-radius rectangle primitives.
  // Lines use independent closed curves with explicit styles and no group inheritance.
  const lineCurves =
    geometry.mode === "line-amplification" &&
    (!s.linePattern || s.linePattern === "horizontal");
  // Guide colour changes only template ink, including outlined labels and text.
  const ink = finished ? color(s.inkColor) : effectiveGuideColor(s);
  const width = n(geometry.widthMm),
    height = n(geometry.heightMm);
  const guideWidth = effectiveGuideWidthMm(s);
  const paper =
    typeof options.background === "string"
      ? color(options.background)
      : usesOpticalColour(s) && !geometry.circles.length
        ? "#ffffff"
        : s.invert
          ? "#1e1e1c"
          : "#f8f5ef";
  const title =
    options.title ?? `Slow Reveal Studio ${geometry.mode} ${variant}`;
  const chunks = [
    `<svg xmlns="http://www.w3.org/2000/svg"${lineCurves ? ' version="1.1"' : ""} width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}">`,
    `<title>${escapeXml(title)}</title>`,
    `<metadata>${escapeXml(JSON.stringify({ renderer: geometry.version, mode: geometry.mode, units: "mm", variant }))}</metadata>`,
  ];
  if (options.background !== false)
    chunks.push(`<rect width="${width}" height="${height}" fill="${paper}"/>`);
  if (!lineCurves)
    chunks.push(
      `<g fill="${finished ? ink : "none"}" stroke="${finished ? "none" : ink}" stroke-width="${n(guideWidth)}"${finished ? "" : ` opacity="${n(s.guideOpacity)}"`}>`,
    );
  for (const dot of geometry.circles) {
    // Inset outline places the entire guide inside the filled mark boundary.
    const radius = finished ? dot.r : Math.max(0.01, dot.r - guideWidth / 2);
    chunks.push(`<circle cx="${n(dot.x)}" cy="${n(dot.y)}" r="${n(radius)}"/>`);
  }
  for (const cell of geometry.cells) {
    const fill = finished && cell.color ? ` fill="${color(cell.color)}"` : "";
    if (lineCurves) {
      const inset = finished ? 0 : guideWidth / 2;
      const x = cell.x + inset,
        y = cell.y + inset;
      const right = x + Math.max(0.01, cell.width - inset * 2),
        bottom = y + Math.max(0.01, cell.height - inset * 2);
      chunks.push(
        `<path d="M ${n(x)} ${n(y)} L ${n(right)} ${n(y)} L ${n(right)} ${n(bottom)} L ${n(x)} ${n(bottom)} Z" fill="${finished ? (cell.color ? color(cell.color) : ink) : "none"}" stroke="${finished ? "none" : ink}" stroke-width="${n(guideWidth)}" stroke-linejoin="miter" opacity="${finished ? "1" : n(s.guideOpacity)}"/>`,
      );
      continue;
    }
    if (cell.points) {
      // Scale the polygon inwards to keep outline ink within the intended mark.
      const cx = cell.x + cell.width / 2,
        cy = cell.y + cell.height / 2;
      const scale = finished
        ? 1
        : Math.max(
            0.1,
            1 - guideWidth / (Math.min(cell.width, cell.height) * 0.85),
          );
      chunks.push(
        `<polygon points="${cell.points.map((p) => `${n(cx + (p.x - cx) * scale)},${n(cy + (p.y - cy) * scale)}`).join(" ")}"${fill}/>`,
      );
    } else {
      const inset = finished ? 0 : guideWidth / 2;
      chunks.push(
        `<rect x="${n(cell.x + inset)}" y="${n(cell.y + inset)}" width="${n(Math.max(0.01, cell.width - inset * 2))}" height="${n(Math.max(0.01, cell.height - inset * 2))}" rx="${n(Math.max(0, (cell.radius ?? 0) - inset))}"${fill}/>`,
      );
    }
    if (!finished && cell.label) {
      const sizeMm = Math.min(1.8, cell.height * 0.5);
      const metrics = measureLettering(cell.label, "sans-serif");
      chunks.push(
        outlinedText(
          {
            value: cell.label,
            x: cell.x + cell.width / 2,
            y:
              cell.y +
              cell.height / 2 -
              (((metrics.minY + metrics.maxY) / 2) * sizeMm) / metrics.units,
            sizeMm,
            fontFamily: "sans-serif",
            anchor: "middle",
            maxWidthMm: cell.width * 0.75,
          },
          ink,
        ),
      );
    }
  }
  if (!lineCurves) chunks.push("</g>");
  for (const path of geometry.paths) {
    if (path.points.length < 2) continue;
    if (path.points.length > 200000)
      throw new Error("Path exceeds the export point limit.");
    chunks.push(
      `<path d="M${path.points.map((p) => `${n(p.x)} ${n(p.y)}`).join(" L")}" fill="none" stroke="${ink}" stroke-width="${n(finished ? path.width : Math.min(path.width, guideWidth))}" stroke-linecap="round" stroke-linejoin="round"${finished ? "" : ` opacity="${n(s.guideOpacity)}"`}/>`,
    );
  }
  if (geometry.text) {
    chunks.push(
      outlinedText(geometry.text, ink, finished ? undefined : s.guideOpacity),
    );
  }
  if (options.includeSafeArea)
    chunks.push(
      `<rect x="${n(s.safeMarginMm)}" y="${n(s.safeMarginMm)}" width="${n(s.widthMm - s.safeMarginMm * 2)}" height="${n(s.heightMm - s.safeMarginMm * 2)}" fill="none" stroke="#9c7454" stroke-width="0.3" stroke-dasharray="2 2"/>`,
    );
  chunks.push("</svg>");
  return chunks.join("");
}
