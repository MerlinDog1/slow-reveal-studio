import data from "./font-data.json";
import type { TextGeometry } from "./types";

type FontFamily = "serif" | "sans-serif";
interface GlyphData {
  a: number;
  d: string;
  b: number[];
}
interface FontData {
  name: string;
  units: number;
  glyphs: Record<string, GlyphData>;
  kerning: Record<string, number>;
}
const fonts = data.fonts as unknown as Record<FontFamily, FontData>;
export const FONT_OUTLINE_VERSION = `${data.format}:${data.revision}`;
export const SUPPORTED_TEXT_CHARACTERS = data.characters;
const supported = new Set([...SUPPORTED_TEXT_CHARACTERS]);
const round = (n: number) => Math.round(n * 1000000) / 1000000;

export function validateLettering(value: string): string {
  const normalized = value.normalize("NFC");
  const missing = [
    ...new Set(
      [...normalized].filter((character) => !supported.has(character)),
    ),
  ];
  if (missing.length) {
    const codes = missing
      .slice(0, 4)
      .map(
        (character) =>
          `U+${character.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`,
      )
      .join(", ");
    throw new Error(
      `Lettering currently supports Latin letters, supported accents and common symbols. Unsupported character${missing.length === 1 ? "" : "s"}: ${codes}. Use supported lettering until this script is added.`,
    );
  }
  return normalized;
}

/** Dimensions are in a normalized 1000-unit em; no browser font APIs are used. */
export function measureLettering(value: string, family: FontFamily) {
  if (family !== "serif" && family !== "sans-serif")
    throw new Error("Choose a supported lettering font.");
  const font = fonts[family];
  const text = validateLettering(value);
  let cursor = 0,
    minX = 0,
    maxX = 0,
    minY = 0,
    maxY = 0;
  let previous = "",
    ink = false;
  const glyphs: { d: string; x: number; bounds: number[] }[] = [];
  for (const character of text) {
    const glyph = font.glyphs[character];
    if (previous) cursor += font.kerning[previous + character] ?? 0;
    if (glyph.d) {
      glyphs.push({ d: glyph.d, x: round(cursor), bounds: glyph.b });
      minX = Math.min(minX, cursor + glyph.b[0]);
      maxX = Math.max(maxX, cursor + glyph.b[2]);
      minY = ink ? Math.min(minY, glyph.b[1]) : glyph.b[1];
      maxY = ink ? Math.max(maxY, glyph.b[3]) : glyph.b[3];
      ink = true;
    }
    cursor += glyph.a;
    previous = character;
  }
  maxX = Math.max(maxX, cursor);
  return {
    glyphs,
    minX,
    minY,
    maxX,
    maxY,
    width: round(maxX - minX),
    advance: round(cursor),
    units: font.units,
  };
}

/** Return trusted paths + deterministic mm transforms for any SVG rasterizer. */
export function outlineLettering(text: TextGeometry) {
  if (text.fontVersion && text.fontVersion !== FONT_OUTLINE_VERSION)
    throw new Error(
      "This lettering uses a different font revision. Create a new design revision before regenerating it.",
    );
  for (const number of [text.x, text.y, text.sizeMm, text.maxWidthMm])
    if (!Number.isFinite(number) || Math.abs(number) > 100000)
      throw new Error("Invalid lettering geometry.");
  if (text.sizeMm <= 0 || text.maxWidthMm <= 0)
    throw new Error("Lettering dimensions must be positive.");
  const metrics = measureLettering(text.value, text.fontFamily);
  const scale = Math.min(
    text.sizeMm / metrics.units,
    text.maxWidthMm / Math.max(metrics.width, 1),
  );
  const widthMm = metrics.width * scale;
  const anchor = text.anchor === "start" ? 0 : text.anchor === "end" ? 1 : 0.5;
  const x = text.x - widthMm * anchor - metrics.minX * scale;
  return {
    glyphs: metrics.glyphs,
    x: round(x),
    y: round(text.y),
    scale: Math.round(scale * 1e12) / 1e12,
    bounds: {
      x: round(x + metrics.minX * scale),
      y: round(text.y + metrics.minY * scale),
      width: round(widthMm),
      height: round((metrics.maxY - metrics.minY) * scale),
    },
  };
}
