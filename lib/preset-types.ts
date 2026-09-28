import type { RenderMode, RenderSettings } from "./renderers/types";

/** Presets never carry a customer's photo, crop, lettering, product size or ink selection. */
export const PRESET_SETTING_KEYS = [
  "spacingMm",
  "minDiameterMm",
  "maxDiameterMm",
  "contrast",
  "brightness",
  "gamma",
  "threshold",
  "edgeEmphasis",
  "density",
  "invert",
  "guideOpacity",
  "safeMarginMm",
  "guideWidthMm",
  "autoExposure",
  "palette",
  "cellShape",
] as const;
export type PresetSettings = Pick<
  RenderSettings,
  (typeof PRESET_SETTING_KEYS)[number]
>;
export type PublishedPreset = {
  id: string;
  version: number;
  name: string;
  description: string;
  mode: RenderMode;
  settings: PresetSettings;
  rendererVersion: string;
};
export type PresetVersion = Omit<PublishedPreset, "id"> & {
  createdAt: string;
  createdBy: string;
  actorKind: "supabase" | "local-token";
};
export type RendererPreset = {
  id: string;
  mode: RenderMode;
  revision: number;
  currentVersion: number;
  publishedVersion: number | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  versions: PresetVersion[];
  audit: {
    at: string;
    action:
      "create" | "revise" | "publish" | "unpublish" | "archive" | "restore";
    actorId: string;
    actorKind: "supabase" | "local-token";
    version: number | null;
  }[];
};
export type PublicPresetsResponse = {
  presets: PublishedPreset[];
  persistence: "supabase" | "local-development" | "unconfigured";
};
export type AdminPresetsResponse = { presets: RendererPreset[] };
export function presetSettings(settings: RenderSettings): PresetSettings {
  return Object.fromEntries(
    PRESET_SETTING_KEYS.filter((key) => settings[key] !== undefined).map(
      (key) => [key, settings[key]],
    ),
  ) as PresetSettings;
}
