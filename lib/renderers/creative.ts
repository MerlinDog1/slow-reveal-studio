import type { ToneMap } from "./sampling";
import {
  clamp,
  type RenderSettings,
  type Cell,
  type Circle,
  type Point,
} from "./types";
import type { ArtBounds } from "./modes";

/** A soft, explicitly placed focal area; no face detection or invented features. */
export function focalWeight(s: RenderSettings, u: number, v: number) {
  const radius = s.focusRadius ?? 0.22;
  return Math.exp(
    -2 *
      (((u - (s.focusX ?? 0.5)) / radius) ** 2 +
        ((v - (s.focusY ?? 0.5)) / radius) ** 2),
  );
}

export function creativeTone(
  base: ToneMap,
  s: RenderSettings,
  mask?: (u: number, v: number) => number,
): ToneMap {
  const maskFactor = (u: number, v: number) =>
    mask ? 1 - (s.subjectMaskStrength ?? 0) * (1 - mask(u, v)) : 1;
  const active = !!(
    s.shadowLift ||
    s.focusBrightness ||
    s.focusDetail ||
    s.selectiveColour ||
    mask
  );
  if (!active) return base;
  const adjust = (value: number, u: number, v: number) =>
    clamp(
      value +
        (s.shadowLift ?? 0) * 0.42 * (1 - value) ** 2 +
        (s.focusBrightness ?? 0) * focalWeight(s, u, v),
    );
  return {
    ...base,
    sample(u, v, ru = 0, rv = ru) {
      const old = base.sample(u, v, ru, rv);
      const detail = (s.focusDetail ?? 0) * focalWeight(s, u, v);
      const darkness = detail
        ? old + detail * (base.sample(u, v, ru * 0.25, rv * 0.25) - old)
        : old;
      const adjusted = s.invert
        ? adjust(darkness, u, v)
        : 1 - adjust(1 - darkness, u, v);
      return clamp(adjusted * maskFactor(u, v));
    },
    color(u, v, ru = 0, rv = ru) {
      const rgb = base.color(u, v, ru, rv);
      const detail = (s.focusDetail ?? 0) * focalWeight(s, u, v);
      const fine = detail ? base.color(u, v, ru * 0.25, rv * 0.25) : rgb;
      const gray = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
      const saturation = s.selectiveColour ? focalWeight(s, u, v) : 1;
      return rgb.map((channel, i) => {
        const value =
          gray + saturation * (channel + detail * (fine[i] - channel) - gray);
        return 255 * (1 - (1 - adjust(value / 255, u, v)) * maskFactor(u, v));
      }) as [number, number, number];
    },
  };
}

/** Keep complete marks within the decorative aperture. Canvas/page dimensions never change. */
export function apertureContains(
  s: RenderSettings,
  b: ArtBounds,
  p: Point,
  inset = 0,
) {
  if (!s.compositionShape || s.compositionShape === "rectangle") return true;
  const rx =
    (s.compositionShape === "circle" ? Math.min(b.width, b.height) : b.width) /
      2 -
    inset;
  const ry =
    (s.compositionShape === "circle" ? Math.min(b.width, b.height) : b.height) /
      2 -
    inset;
  return (
    rx > 0 &&
    ry > 0 &&
    ((p.x - b.x - b.width / 2) / rx) ** 2 +
      ((p.y - b.y - b.height / 2) / ry) ** 2 <=
      1
  );
}
export const circleInAperture = (s: RenderSettings, b: ArtBounds, c: Circle) =>
  apertureContains(s, b, c, c.r);
export function cellInAperture(s: RenderSettings, b: ArtBounds, c: Cell) {
  return (
    c.points ?? [
      { x: c.x, y: c.y },
      { x: c.x + c.width, y: c.y },
      { x: c.x, y: c.y + c.height },
      { x: c.x + c.width, y: c.y + c.height },
    ]
  ).every((p) => apertureContains(s, b, p));
}
