import type { RenderMode } from "./renderers/types";

export const RENDER_MODES: readonly RenderMode[] = [
  "dots",
  "mosaic",
  "contour",
  "line-amplification",
];
type ModeEnvironment = {
  NODE_ENV?: string;
  PHYSICAL_VALIDATION_APPROVED?: string;
  PHYSICALLY_VALIDATED_MODES?: string;
};

/** Development labs remain available locally; production exposes alternatives only after physical approval. */
export function getAvailableModes(
  environment: ModeEnvironment = process.env,
): RenderMode[] {
  if (environment.NODE_ENV === "development") return [...RENDER_MODES];
  if (environment.PHYSICAL_VALIDATION_APPROVED !== "true") return ["dots"];
  const approved = new Set(
    (environment.PHYSICALLY_VALIDATED_MODES ?? "dots")
      .split(",")
      .map((value) => value.trim()),
  );
  return RENDER_MODES.filter((mode) => mode === "dots" || approved.has(mode));
}
