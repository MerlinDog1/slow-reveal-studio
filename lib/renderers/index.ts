import {
  creativeTone,
  circleInAperture,
  cellInAperture,
  apertureContains,
} from "./creative";
import { renderCreativeLines } from "./creative-lines";
import { analyzeImage } from "./sampling";
import { renderOptical, TV_COLUMN_RATIO } from "./optical";
import { renderStipple } from "./stipple";
import { renderFibonacci, renderFibonacciColour } from "./fibonacci";
import {
  pathLength,
  renderContours,
  renderDots,
  renderLines,
  renderMosaic,
  type ArtBounds,
} from "./modes";
import {
  clamp,
  isOpticalMode,
  supportsPalette,
  usesOpticalColour,
  MAX_MARKS,
  normalizeSettings,
  RENDERER_VERSION,
  round,
  type PixelImage,
  type RenderGeometry,
  type RenderSettings,
  type TextGeometry,
} from "./types";
import { FONT_OUTLINE_VERSION, measureLettering } from "./fonts";
import {
  createSubjectMaskSampler,
  normalizeSubjectMask,
  type SubjectMask,
} from "../subject-mask";

export * from "./types";
export { toSvg, effectiveGuideWidthMm, effectiveGuideColor } from "./svg";
export {
  FONT_OUTLINE_VERSION,
  SUPPORTED_TEXT_CHARACTERS,
  validateLettering,
  measureLettering,
  outlineLettering,
} from "./fonts";

function textLayout(
  s: RenderSettings,
  bounds: ArtBounds,
): TextGeometry | undefined {
  if (!s.text?.value) return undefined;
  const placement = s.text.placement ?? "bottom-center";
  const available = bounds.width - 4;
  const fontFamily = s.text.fontFamily ?? "serif";
  const metrics = measureLettering(s.text.value, fontFamily);
  const units = metrics.width / metrics.units;
  const size =
    Math.floor(
      Math.min(s.text.sizeMm ?? 7, available / Math.max(units, 0.001)) * 10000,
    ) / 10000;
  const scale = size / metrics.units;
  const top = placement === "top-center";
  const band = Math.max(size * 2, (metrics.maxY - metrics.minY) * scale) + 5;
  const y = top
    ? bounds.y + 2 - metrics.minY * scale
    : bounds.y + bounds.height - 2 - metrics.maxY * scale;
  if (top) bounds.y += band;
  bounds.height -= band;
  const anchor =
    placement === "bottom-left"
      ? "start"
      : placement === "bottom-right"
        ? "end"
        : "middle";
  return {
    value: s.text.value,
    sizeMm: size,
    fontFamily,
    fontVersion: FONT_OUTLINE_VERSION,
    anchor,
    x: round(
      anchor === "start"
        ? bounds.x + 2
        : anchor === "end"
          ? bounds.x + bounds.width - 2
          : bounds.x + bounds.width / 2,
    ),
    y: round(y),
    maxWidthMm: round(Math.min(available, units * size)),
  };
}

/** Pure deterministic renderer. Measure elapsed time in the caller, not in the saved geometry. */
export function renderImage(
  input: PixelImage,
  settings: RenderSettings,
  subjectMask?: SubjectMask,
): RenderGeometry {
  const s = normalizeSettings(settings);
  const mask =
    subjectMask === undefined ? undefined : normalizeSubjectMask(subjectMask);
  if (mask && (mask.widthMm !== s.widthMm || mask.heightMm !== s.heightMm))
    throw new Error(
      "The subject mask does not match this canvas size. Clear it or redraw the selection.",
    );
  const maskActive = s.subjectMaskStrength! > 0;
  if (maskActive && !mask)
    throw new Error(
      "Paint a subject selection before increasing subject mask strength.",
    );
  const maskSampler =
    maskActive && mask ? createSubjectMaskSampler(mask) : undefined;
  const warnings: string[] = [
    "Physical prototype pending: guide visibility, marker coverage and completion time need real canvas tests.",
  ];
  if (maskActive)
    warnings.push(
      "Manual subject mask applied; inspect the painted selection and both proof views. No automatic segmentation was used.",
    );
  if (s.invert && s.inkColor === "#1e1e1c") {
    s.inkColor = "#f4efe6";
    warnings.push(
      "Inverted artwork uses a light marker on dark canvas; white ink and substrate need a print test.",
    );
  }
  const tone = creativeTone(
    analyzeImage(input, s),
    s,
    s.mode === "dots" || usesOpticalColour(s) ? undefined : maskSampler,
  );
  const bounds = {
    x: s.safeMarginMm,
    y: s.safeMarginMm,
    width: s.widthMm - s.safeMarginMm * 2,
    height: s.heightMm - s.safeMarginMm * 2,
  };
  const text = textLayout(s, bounds);
  if (bounds.height < s.maxDiameterMm + 4 || bounds.width < s.maxDiameterMm + 4)
    throw new Error("Text and margins leave too little room for the artwork.");
  if (text && text.sizeMm < 2.5)
    warnings.push(
      "Personalised text is small at this size. Shorten it for a clearer result.",
    );
  const requestedPitch = s.spacingMm / Math.sqrt(s.density);
  const ribbonFactor =
    s.mode === "line-amplification" &&
    s.linePattern &&
    s.linePattern !== "horizontal"
      ? 3
      : 1;
  const areaPitch = Math.sqrt(
    (bounds.width * bounds.height * ribbonFactor) /
      (MAX_MARKS * 0.82 * (s.mode === "tv-weave" ? TV_COLUMN_RATIO : 1)),
  );
  // Keep a 0.25 mm clear gap, including the rounding precision, between adjacent dots.
  const pitch = Math.max(requestedPitch, s.minDiameterMm + 0.251, areaPitch);
  const maxDiameter = Math.min(s.maxDiameterMm, pitch - 0.251);
  if (pitch > requestedPitch + 0.001)
    warnings.push(
      "Spacing was increased to keep marks printable and within the 60,000-mark limit.",
    );
  if (maxDiameter < s.maxDiameterMm - 0.001)
    warnings.push(
      "Maximum mark size was reduced to prevent neighbouring marks touching.",
    );
  const context = {
    tone,
    settings: s,
    bounds,
    pitch,
    maxDiameter,
    subjectMask: maskSampler,
  };
  let circles =
    s.mode === "dots"
      ? renderDots(context)
      : s.mode === "stipple"
        ? renderStipple(context)
        : s.mode === "fibonacci" && !s.palette
          ? renderFibonacci(context)
          : [];
  let cells =
    s.mode === "mosaic"
      ? renderMosaic(context)
      : s.mode === "fibonacci" && s.palette
        ? renderFibonacciColour(context)
        : isOpticalMode(s.mode)
          ? renderOptical(context)
          : s.mode === "line-amplification"
            ? s.linePattern && s.linePattern !== "horizontal"
              ? renderCreativeLines(context)
              : renderLines(context)
            : [];
  const contourInset = 0.5;
  let paths =
    s.mode === "contour"
      ? renderContours({
          ...context,
          bounds: {
            x: bounds.x + contourInset,
            y: bounds.y + contourInset,
            width: bounds.width - contourInset * 2,
            height: bounds.height - contourInset * 2,
          },
        })
      : [];
  circles = circles.filter((c) => circleInAperture(s, bounds, c));
  cells = cells.filter((c) => cellInAperture(s, bounds, c));
  paths = paths.filter((p) =>
    p.points.every((point) => apertureContains(s, bounds, point, p.width / 2)),
  );
  const count = circles.length + cells.length + paths.length;
  if (count > MAX_MARKS)
    throw new Error(
      "This design exceeds 60,000 marks. Increase spacing or reduce canvas size.",
    );
  const circleArea = circles.reduce(
    (area, dot) => area + Math.PI * dot.r ** 2,
    0,
  );
  const cellArea = cells.reduce((area, cell) => {
    if (!cell.points) {
      if (usesOpticalColour(s)) {
        const r = cell.radius ?? 0;
        return area + cell.width * cell.height - (4 - Math.PI) * r * r;
      }
      return area + cell.width * cell.height;
    }
    let signed = 0;
    cell.points.forEach((p, i) => {
      const q = cell.points![(i + 1) % cell.points!.length];
      signed += p.x * q.y - q.x * p.y;
    });
    return area + Math.abs(signed / 2);
  }, 0);
  const traceLength = paths.reduce((sum, p) => sum + pathLength(p.points), 0);
  const pathArea = paths.reduce(
    (sum, p) => sum + pathLength(p.points) * p.width,
    0,
  );
  const inkArea = circleArea + cellArea + pathArea;
  // Workload estimate is intentionally labelled provisional. Tuning awaits measured physical trials.
  const seconds =
    s.mode === "contour"
      ? traceLength / 3 + count * 4
      : count *
          (["dots", "stipple", "fibonacci"].includes(s.mode) ? 1.6 : 2.2) +
        inkArea / 8;
  if (input.width < s.widthMm || input.height < s.heightMm)
    warnings.push(
      "Low source resolution for this canvas. Inspect the face and fine details before ordering.",
    );
  if (tone.mean < 0.18)
    warnings.push(
      "This photo is dark. Try a tighter crop or increase brightness.",
    );
  if (tone.exposureScale > 1.05)
    warnings.push(
      "Automatic exposure lifted dark detail. Compare with the original and disable it for intentional low-key artwork.",
    );
  if (tone.mean > 0.88)
    warnings.push(
      "This photo is very bright. Lower brightness to restore subject detail.",
    );
  if (tone.range < 0.18)
    warnings.push(
      "This photo has a narrow tonal range. Try more contrast or a clearer source.",
    );
  if (tone.meanEdge < 0.002 && tone.range >= 0.18)
    warnings.push(
      "There is little fine detail. Check that the subject is in focus and large enough in the crop.",
    );
  if (!count)
    warnings.push(
      "No marks remain with these settings. Lower the threshold or adjust brightness.",
    );
  if (s.mode !== "dots")
    warnings.push(
      "Experimental mode: physical completion has not yet been validated.",
    );
  if (s.mode === "contour")
    warnings.push(
      "Contour is a simplified tonal-boundary prototype, without face segmentation or semantic line selection.",
    );
  if (s.mode === "line-amplification")
    warnings.push(
      "Every Line Amplification kit must include a ruler or straight edge.",
    );
  if (s.palette && !supportsPalette(s.mode))
    warnings.push(
      "Limited palettes apply to Mosaic Fill, Fibonacci Spiral, Colour Blend and TV Weave only.",
    );
  if (s.palette && supportsPalette(s.mode)) {
    warnings.push(
      `${s.mode === "mosaic" ? "Mosaic" : s.mode === "fibonacci" ? "Fibonacci Spiral" : s.mode === "colour-blend" ? "Colour Blend" : "TV Weave"} colour key: ${s.palette.map((hex, i) => `${i + 1} = ${hex}`).join(", ")}. Supply matching markers and a separate colour legend.`,
    );
    if (
      maxDiameter < 3 ||
      (usesOpticalColour(s) && cells.some((cell) => cell.width < 3))
    )
      warnings.push(
        usesOpticalColour(s)
          ? "Palette numbers may be hard to read below 3 mm wide. Increase spacing and mark size."
          : "Palette numbers may be hard to read below 3 mm. Increase spacing and cell size.",
      );
    if (s.invert)
      warnings.push(
        "Palette mapping assumes a light substrate; inverted colour mosaics need a separate physical proof.",
      );
  }
  if (usesOpticalColour(s))
    warnings.push(
      "Neighbouring colours blend visually at a distance. White gaps and the actual marker colours limit contrast and colour range; this is not a calibrated ink simulation.",
    );
  return {
    version: RENDERER_VERSION,
    mode: s.mode,
    widthMm: s.widthMm,
    heightMm: s.heightMm,
    settings: s,
    circles,
    cells,
    paths,
    ...(text ? { text } : {}),
    stats: {
      markCount: count,
      estimatedCompletionMinutes: count
        ? Math.max(1, Math.round(seconds / 60))
        : 0,
      inkAreaMm2: round(inkArea),
      sourceWidth: input.width,
      sourceHeight: input.height,
      effectiveSpacingMm: round(pitch),
      effectiveMinDiameterMm: s.minDiameterMm,
      effectiveMaxDiameterMm: round(maxDiameter),
      meanLuminance: round(clamp(tone.mean)),
      tonalRange: round(clamp(tone.range)),
      exposureScale: round(tone.exposureScale),
    },
    warnings,
  };
}
