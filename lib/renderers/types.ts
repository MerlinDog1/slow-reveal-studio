import { validateLettering } from "./fonts";
import { MAX_PALETTE_COLOURS } from "../mosaic-palette";
import { defaultOpticalPalette } from "../optical-palette";

export const RENDER_MODE_IDS = [
  "dots",
  "mosaic",
  "contour",
  "line-amplification",
  "colour-blend",
  "tv-weave",
  "stipple",
  "fibonacci",
] as const;
export type RenderMode = (typeof RENDER_MODE_IDS)[number];
export const isOpticalMode = (mode: RenderMode) =>
  mode === "colour-blend" || mode === "tv-weave";
export const supportsPalette = (mode: RenderMode) =>
  mode === "mosaic" || mode === "fibonacci" || isOpticalMode(mode);
export const usesOpticalColour = (
  s: Pick<RenderSettings, "mode" | "palette">,
) => isOpticalMode(s.mode) || (s.mode === "fibonacci" && !!s.palette);

export interface PersonalizedText {
  value: string;
  fontFamily?: "serif" | "sans-serif";
  sizeMm?: number;
  placement?: "bottom-center" | "bottom-left" | "bottom-right" | "top-center";
}

export interface RenderSettings {
  mode: RenderMode;
  widthMm: number;
  heightMm: number;
  /** Centre-to-centre distance before density adjustment. */
  spacingMm: number;
  minDiameterMm: number;
  maxDiameterMm: number;
  contrast: number;
  /** Exposure adjustment in normalized luminance, -1 to 1. */
  brightness: number;
  gamma: number;
  /** Minimum darkness retained, from 0 to 0.95. */
  threshold: number;
  edgeEmphasis: number;
  /** Dots-only blend toward a smaller physical sampling area; 0 preserves legacy sampling. */
  detailPreservation?: number;
  density: number;
  invert: boolean;
  inkColor: string;
  guideOpacity: number;
  /** Optional template colour; omission inherits the selected ink colour. */
  guideColor?: string;
  safeMarginMm: number;
  guideWidthMm?: number;
  /** Bounded highlight normalization for dark, non-flat photographs. */
  autoExposure?: boolean;
  /** Manual Dots mask background suppression; its private alpha/binding is supplied separately. */
  subjectMaskStrength?: number;
  cellShape?: "square" | "rounded" | "hexagon";
  /** Supplied marker colours. Unmarked white canvas is an additional paper tone. */
  palette?: string[];
  /** Optional creative controls. Omission retains the original rendering behaviour. */
  colourCompensation?: number;
  shadowLift?: number;
  focusX?: number;
  focusY?: number;
  focusRadius?: number;
  focusBrightness?: number;
  focusDetail?: number;
  selectiveColour?: boolean;
  compositionShape?: "rectangle" | "circle" | "oval";
  spiralX?: number;
  spiralY?: number;
  spiralRotation?: number;
  linePattern?: "horizontal" | "spiral" | "flow" | "crosshatch";
  text?: PersonalizedText;
}

export interface PixelImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}
export interface Circle extends Point {
  r: number;
}
export interface Cell extends Point {
  width: number;
  height: number;
  radius?: number;
  points?: Point[];
  color?: string;
  label?: string;
}
export interface TracePath {
  points: Point[];
  width: number;
}
export interface TextGeometry extends Point {
  value: string;
  sizeMm: number;
  fontFamily: "serif" | "sans-serif";
  anchor: "start" | "middle" | "end";
  maxWidthMm: number;
  fontVersion?: string;
}

export interface RenderGeometry {
  version: string;
  mode: RenderMode;
  widthMm: number;
  heightMm: number;
  settings: RenderSettings;
  circles: Circle[];
  cells: Cell[];
  paths: TracePath[];
  text?: TextGeometry;
  stats: {
    markCount: number;
    estimatedCompletionMinutes: number;
    inkAreaMm2: number;
    sourceWidth: number;
    sourceHeight: number;
    effectiveSpacingMm: number;
    effectiveMinDiameterMm: number;
    effectiveMaxDiameterMm: number;
    meanLuminance: number;
    tonalRange: number;
    exposureScale: number;
  };
  warnings: string[];
}

export interface SvgOptions {
  /** False for transparent production artwork; defaults to true for previews. */
  background?: boolean | string;
  includeSafeArea?: boolean;
  title?: string;
}

export const RENDERER_VERSION = "slow-reveal-geometry/1.8.0";
export const MAX_MARKS = 60_000;
export const DEFAULT_SETTINGS: RenderSettings = {
  mode: "dots",
  widthMm: 400,
  heightMm: 500,
  spacingMm: 4.2,
  minDiameterMm: 0.9,
  maxDiameterMm: 3.8,
  contrast: 1.12,
  brightness: 0,
  gamma: 1,
  threshold: 0.04,
  edgeEmphasis: 0.25,
  detailPreservation: 0,
  density: 1,
  invert: false,
  inkColor: "#1e1e1c",
  guideOpacity: 0.3,
  safeMarginMm: 10,
  guideWidthMm: 0.15,
  autoExposure: true,
  subjectMaskStrength: 0,
};

export const PRESETS = {
  easy: {
    spacingMm: 4.2,
    minDiameterMm: 0.9,
    maxDiameterMm: 3.8,
    contrast: 1.12,
    gamma: 1,
    edgeEmphasis: 0.25,
    density: 1,
    threshold: 0.04,
  },
  standard: {
    spacingMm: 2.8,
    minDiameterMm: 0.7,
    maxDiameterMm: 2.4,
    contrast: 1.1,
    gamma: 1,
    edgeEmphasis: 0.35,
    density: 1,
    threshold: 0.035,
  },
  detailed: {
    spacingMm: 2,
    minDiameterMm: 0.5,
    maxDiameterMm: 1.7,
    contrast: 1.08,
    gamma: 1,
    edgeEmphasis: 0.4,
    density: 1,
    threshold: 0.03,
  },
  bold: {
    spacingMm: 4.8,
    minDiameterMm: 1.2,
    maxDiameterMm: 4.4,
    contrast: 1.45,
    gamma: 0.9,
    edgeEmphasis: 0.2,
    density: 1,
    threshold: 0.07,
  },
  portrait: {
    spacingMm: 3.3,
    minDiameterMm: 0.75,
    maxDiameterMm: 2.9,
    contrast: 1.06,
    gamma: 1.12,
    edgeEmphasis: 0.45,
    density: 1,
    threshold: 0.035,
  },
} satisfies Record<string, Partial<RenderSettings>>;

export const round = (n: number): number => Math.round(n * 10000) / 10000;
export const clamp = (n: number, lo = 0, hi = 1): number =>
  Math.min(hi, Math.max(lo, n));

export function normalizeSettings(settings: RenderSettings): RenderSettings {
  if (!settings || typeof settings !== "object")
    throw new Error("Renderer settings are required.");
  const s = {
    ...DEFAULT_SETTINGS,
    ...settings,
    subjectMaskStrength:
      settings.subjectMaskStrength === undefined
        ? 0
        : settings.subjectMaskStrength,
    detailPreservation:
      settings.detailPreservation === undefined
        ? 0
        : settings.detailPreservation,
  };
  if (!RENDER_MODE_IDS.includes(s.mode))
    throw new Error("Unknown rendering mode.");
  const optionalRanges: [keyof RenderSettings, number, number][] = [
    ["colourCompensation", 0, 1],
    ["shadowLift", 0, 1],
    ["focusX", 0, 1],
    ["focusY", 0, 1],
    ["focusRadius", 0.05, 1],
    ["focusBrightness", -0.5, 0.5],
    ["focusDetail", 0, 1],
    ["spiralX", 0, 1],
    ["spiralY", 0, 1],
    ["spiralRotation", 0, 360],
  ];
  for (const [key, lo, hi] of optionalRanges) {
    const value = s[key];
    if (
      value !== undefined &&
      (typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < lo ||
        value > hi)
    )
      throw new Error(`${key} must be between ${lo} and ${hi}.`);
  }
  if (s.selectiveColour !== undefined && typeof s.selectiveColour !== "boolean")
    throw new Error("Selective colour must be true or false.");
  if (
    s.compositionShape !== undefined &&
    !["rectangle", "circle", "oval"].includes(s.compositionShape)
  )
    throw new Error("Choose a rectangular, circular or oval composition.");
  if (
    s.linePattern !== undefined &&
    !["horizontal", "spiral", "flow", "crosshatch"].includes(s.linePattern)
  )
    throw new Error("Choose a supported line pattern.");
  const ranges: [keyof RenderSettings, number, number][] = [
    ["widthMm", 30, 1500],
    ["heightMm", 30, 1500],
    ["spacingMm", 0.5, 30],
    ["minDiameterMm", 0.3, 20],
    ["maxDiameterMm", 0.3, 25],
    ["contrast", 0.1, 4],
    ["brightness", -1, 1],
    ["gamma", 0.2, 4],
    ["threshold", 0, 0.95],
    ["edgeEmphasis", 0, 2],
    ["detailPreservation", 0, 1],
    ["density", 0.25, 3],
    ["guideOpacity", 0.05, 1],
    ["safeMarginMm", 0, 100],
    ["guideWidthMm", 0.05, 0.5],
    ["subjectMaskStrength", 0, 1],
  ];
  for (const [key, min, max] of ranges) {
    const n = s[key];
    if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max) {
      throw new Error(`${key} must be between ${min} and ${max}.`);
    }
  }
  if (s.minDiameterMm > s.maxDiameterMm)
    throw new Error("Minimum diameter cannot exceed maximum diameter.");
  if (s.safeMarginMm * 2 + s.maxDiameterMm >= Math.min(s.widthMm, s.heightMm)) {
    throw new Error("Safe margins leave too little room for the artwork.");
  }
  if (typeof s.invert !== "boolean")
    throw new Error("Inversion must be true or false.");
  if (usesOpticalColour(s) && s.invert)
    throw new Error(
      "Colour Blend, TV Weave and colour Fibonacci Spiral use a light canvas. Turn off inversion first.",
    );
  if (typeof s.autoExposure !== "boolean")
    throw new Error("Automatic exposure must be true or false.");
  if (!/^#[0-9a-f]{6}$/i.test(s.inkColor))
    throw new Error("Ink colour must be a six-digit hexadecimal colour.");
  s.inkColor = s.inkColor.toLowerCase();
  if (s.guideColor !== undefined) {
    if (
      typeof s.guideColor !== "string" ||
      !/^#[0-9a-f]{6}$/i.test(s.guideColor)
    )
      throw new Error("Guide colour must be a six-digit hexadecimal colour.");
    s.guideColor = s.guideColor.toLowerCase();
  }
  if (
    s.cellShape !== undefined &&
    !["square", "rounded", "hexagon"].includes(s.cellShape)
  )
    throw new Error("Choose square, rounded or hexagon cells.");
  if (isOpticalMode(s.mode) && s.palette === undefined)
    s.palette = defaultOpticalPalette();
  if (s.palette !== undefined) {
    if (
      !Array.isArray(s.palette) ||
      s.palette.length < 2 ||
      s.palette.length > MAX_PALETTE_COLOURS ||
      s.palette.some((c) => typeof c !== "string" || !/^#[0-9a-f]{6}$/i.test(c))
    )
      throw new Error(
        `A palette needs 2 to ${MAX_PALETTE_COLOURS} hexadecimal marker colours.`,
      );
    s.palette = [...new Set(s.palette.map((c) => c.toLowerCase()))];
    if (s.palette.length < 2)
      throw new Error("Choose at least two distinct marker colours.");
  }
  if (s.text !== undefined) {
    if (!s.text || typeof s.text.value !== "string")
      throw new Error("Personalised text must be a string.");
    const value = validateLettering(
      s.text.value.replace(/[\u0000-\u001f\u007f]/g, " ").trim(),
    );
    if ([...value].length > 80)
      throw new Error("Personalised text is limited to 80 characters.");
    const fontFamily = s.text.fontFamily ?? "serif";
    if (fontFamily !== "serif" && fontFamily !== "sans-serif")
      throw new Error("Choose a curated text font.");
    const placement = s.text.placement ?? "bottom-center";
    if (
      !["bottom-center", "bottom-left", "bottom-right", "top-center"].includes(
        placement,
      )
    )
      throw new Error("Choose a supported text placement.");
    const sizeMm = s.text.sizeMm ?? 7;
    if (!Number.isFinite(sizeMm) || sizeMm < 2 || sizeMm > 18)
      throw new Error("Text size must be between 2 and 18 mm.");
    s.text = value ? { value, fontFamily, placement, sizeMm } : undefined;
  }
  return s;
}
