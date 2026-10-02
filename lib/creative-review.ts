import type { RenderSettings } from "./renderers/types";

/** Conservative review boundary: a new creative treatment must never silently replace paid artwork. */
export function creativeSettingsChanged(
  before: RenderSettings,
  after: RenderSettings,
) {
  const defaults = {
    colourCompensation: 0,
    shadowLift: 0,
    focusX: 0.5,
    focusY: 0.5,
    focusRadius: 0.22,
    focusBrightness: 0,
    focusDetail: 0,
    selectiveColour: false,
    compositionShape: "rectangle",
    spiralX: 0.5,
    spiralY: 0.5,
    spiralRotation: 0,
    linePattern: "horizontal",
  } as const;
  return (
    (Object.keys(defaults) as (keyof typeof defaults)[]).some(
      (key) => (before[key] ?? defaults[key]) !== (after[key] ?? defaults[key]),
    ) || JSON.stringify(before.palette) !== JSON.stringify(after.palette)
  );
}
