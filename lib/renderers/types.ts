import { validateLettering } from "./fonts";

export type RenderMode = "dots" | "mosaic" | "contour" | "line-amplification";

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
  density: number;
  invert: boolean;
  inkColor: string;
  guideOpacity: number;
  safeMarginMm: number;
  guideWidthMm?: number;
  /** Bounded highlight normalization for dark, non-flat photographs. */
  autoExposure?: boolean;
  cellShape?: "square" | "rounded" | "hexagon";
  /** Supplied marker colours. Unmarked white canvas is an additional paper tone. */
  palette?: string[];
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

export const RENDERER_VERSION = "slow-reveal-geometry/1.1.0";
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
  density: 1,
  invert: false,
  inkColor: "#1e1e1c",
  guideOpacity: 0.3,
  safeMarginMm: 10,
  guideWidthMm: 0.15,
  autoExposure: true,
};

export const PRESETS = {
  easy: {
    spacingMm: 6.4,
    minDiameterMm: 1.8,
    maxDiameterMm: 5.9,
    contrast: 1.2,
    gamma: 1,
    edgeEmphasis: 0.15,
    density: 1,
    threshold: 0.07,
  },
  standard: {
    spacingMm: 4.2,
    minDiameterMm: 0.9,
    maxDiameterMm: 3.8,
    contrast: 1.12,
    gamma: 1,
    edgeEmphasis: 0.25,
    density: 1,
    threshold: 0.04,
  },
  detailed: {
    spacingMm: 2.8,
    minDiameterMm: 0.7,
    maxDiameterMm: 2.4,
    contrast: 1.1,
    gamma: 1,
    edgeEmphasis: 0.35,
    density: 1,
    threshold: 0.035,
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
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const modes: RenderMode[] = [
    "dots",
    "mosaic",
    "contour",
    "line-amplification",
  ];
  if (!modes.includes(s.mode)) throw new Error("Unknown rendering mode.");
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
    ["density", 0.25, 3],
    ["guideOpacity", 0.05, 1],
    ["safeMarginMm", 0, 100],
    ["guideWidthMm", 0.05, 0.5],
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
  if (typeof s.autoExposure !== "boolean")
    throw new Error("Automatic exposure must be true or false.");
  if (!/^#[0-9a-f]{6}$/i.test(s.inkColor))
    throw new Error("Ink colour must be a six-digit hexadecimal colour.");
  s.inkColor = s.inkColor.toLowerCase();
  if (
    s.cellShape !== undefined &&
    !["square", "rounded", "hexagon"].includes(s.cellShape)
  )
    throw new Error("Choose square, rounded or hexagon cells.");
  if (s.palette !== undefined) {
    if (
      !Array.isArray(s.palette) ||
      s.palette.length < 2 ||
      s.palette.length > 8 ||
      s.palette.some((c) => typeof c !== "string" || !/^#[0-9a-f]{6}$/i.test(c))
    )
      throw new Error("A palette needs 2 to 8 hexadecimal marker colours.");
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
