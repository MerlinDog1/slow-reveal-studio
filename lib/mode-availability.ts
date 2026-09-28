import { RENDER_MODE_IDS, type RenderMode } from "./renderers/types";

export const RENDER_MODES: readonly RenderMode[] = RENDER_MODE_IDS;
/** Retain retired renderers for saved geometry, but exclude them from new work. */
export const ACTIVE_RENDER_MODES: readonly RenderMode[] = RENDER_MODES.filter(
  (mode) => mode !== "contour" && mode !== "stipple",
);
type ModeEnvironment = {
  NODE_ENV?: string;
  PHYSICAL_VALIDATION_APPROVED?: string;
  PHYSICALLY_VALIDATED_MODES?: string;
};

/** Active labs remain available locally; production alternatives also need physical approval. */
export function getAvailableModes(
  environment: ModeEnvironment = process.env,
): RenderMode[] {
  if (environment.NODE_ENV === "development") return [...ACTIVE_RENDER_MODES];
  if (environment.PHYSICAL_VALIDATION_APPROVED !== "true") return ["dots"];
  const approved = new Set(
    (environment.PHYSICALLY_VALIDATED_MODES ?? "dots")
      .split(",")
      .map((value) => value.trim()),
  );
  return ACTIVE_RENDER_MODES.filter(
    (mode) => mode === "dots" || approved.has(mode),
  );
}
