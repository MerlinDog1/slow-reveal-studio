import type { Finish, Product } from "./catalog";
import type { LocalProject } from "./browser-storage";
import {
  DEFAULT_SETTINGS,
  RENDERER_VERSION,
  normalizeSettings,
  type RenderMode,
  type RenderSettings,
} from "./renderers";
import { presetSettings, type PublishedPreset } from "./preset-types";
import {
  normalizeSubjectMask,
  assertSubjectMaskBinding,
  type SubjectMask,
} from "./subject-mask";

export type StudioCatalogue = {
  products: Product[];
  finishes: Finish[];
  prototype: boolean;
};
export type StudioSelection = {
  productId: string;
  finishId: string;
  settings: RenderSettings;
};
export type RestorableProject = Omit<
  LocalProject,
  "settings" | "subjectMask"
> & {
  settings: RenderSettings;
  subjectMask?: SubjectMask;
};

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
const identifier = (value: unknown): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9_-]{1,40}$/.test(value);
const label = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 180;
const money = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= 10_000_000;

/** Treat network data as untrusted; empty lists are a valid, unavailable catalogue. */
export function parseStudioCatalogue(input: unknown): StudioCatalogue {
  if (
    !record(input) ||
    !Array.isArray(input.products) ||
    !Array.isArray(input.finishes)
  )
    throw new Error(
      "The product catalogue could not be read. Please try again.",
    );
  const products = input.products.map((p): Product => {
    if (
      !record(p) ||
      !identifier(p.id) ||
      !label(p.label) ||
      !money(p.pricePence) ||
      p.pricePence === 0 ||
      typeof p.widthMm !== "number" ||
      typeof p.heightMm !== "number" ||
      !Number.isFinite(p.widthMm) ||
      !Number.isFinite(p.heightMm) ||
      p.widthMm < 30 ||
      p.heightMm < 30 ||
      p.widthMm > 1500 ||
      p.heightMm > 1500
    )
      throw new Error(
        "The product catalogue needs review. Please try again later.",
      );
    return {
      id: p.id,
      label: p.label,
      pricePence: p.pricePence,
      widthMm: p.widthMm,
      heightMm: p.heightMm,
    };
  });
  const finishes = input.finishes.map((f): Finish => {
    if (
      !record(f) ||
      !identifier(f.id) ||
      !label(f.label) ||
      !money(f.additionalPence)
    )
      throw new Error(
        "The product catalogue needs review. Please try again later.",
      );
    return { id: f.id, label: f.label, additionalPence: f.additionalPence };
  });
  if (
    new Set(products.map((p) => p.id)).size !== products.length ||
    new Set(finishes.map((f) => f.id)).size !== finishes.length
  )
    throw new Error(
      "The product catalogue contains duplicate choices. Please try again later.",
    );
  return { products, finishes, prototype: input.prototype !== false };
}

export function productDimensions(product: Product, settings: RenderSettings) {
  const landscape = settings.widthMm > settings.heightMm;
  return {
    widthMm: landscape
      ? Math.max(product.widthMm, product.heightMm)
      : Math.min(product.widthMm, product.heightMm),
    heightMm: landscape
      ? Math.min(product.widthMm, product.heightMm)
      : Math.max(product.widthMm, product.heightMm),
  };
}

/** Report changes without coercing or mutating the saved selection. */
export function reconcileStudioSelection(
  catalogue: StudioCatalogue,
  selection: StudioSelection,
) {
  const product = catalogue.products.find((p) => p.id === selection.productId);
  const finish = catalogue.finishes.find((f) => f.id === selection.finishId);
  const messages: string[] = [];
  if (!product)
    messages.push(
      catalogue.products.length
        ? "The saved canvas size is no longer offered. Choose a current size."
        : "No canvas sizes are currently available.",
    );
  if (!finish)
    messages.push(
      catalogue.finishes.length
        ? "The saved finish is no longer offered. Choose a current finish."
        : "No finishes are currently available.",
    );
  const dimensions = product
    ? productDimensions(product, selection.settings)
    : undefined;
  const dimensionsMatch =
    !!dimensions &&
    dimensions.widthMm === selection.settings.widthMm &&
    dimensions.heightMm === selection.settings.heightMm;
  if (product && !dimensionsMatch)
    messages.push(
      `The dimensions for ${product.label} have changed. Apply the current size and review the crop.`,
    );
  return {
    product,
    finish,
    dimensions,
    dimensionsMatch,
    messages,
    ready: !!product && !!finish && dimensionsMatch,
  };
}

/** Validate everything before opening the blob or changing the editor. Legacy renderer versions need explicit review. */
export function validateRestorableProject(
  input: unknown,
  availableModes: RenderMode[],
): { project: RestorableProject; needsRendererReview: boolean } {
  if (
    !record(input) ||
    !label(input.name) ||
    typeof input.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(input.updatedAt)) ||
    !(input.image instanceof Blob) ||
    input.image.size < 1 ||
    input.image.size > 8 * 1024 * 1024 ||
    !["image/jpeg", "image/png", "image/webp"].includes(input.image.type) ||
    !identifier(input.productId) ||
    !identifier(input.finishId) ||
    !record(input.settings) ||
    !record(input.crop)
  )
    throw new Error(
      "This saved design is incomplete or damaged. The saved original has not been changed.",
    );
  const raw = input.settings;
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (
      key !== "guideWidthMm" &&
      key !== "autoExposure" &&
      key !== "subjectMaskStrength" &&
      key !== "detailPreservation" &&
      raw[key] === undefined
    )
      throw new Error(
        "This saved design is missing renderer settings. The saved original has not been changed.",
      );
  }
  let settings: RenderSettings;
  try {
    settings = normalizeSettings(raw as unknown as RenderSettings);
  } catch (error) {
    throw new Error(
      `This saved design cannot be restored: ${error instanceof Error ? error.message : "invalid renderer settings."} The saved original has not been changed.`,
    );
  }
  if (!availableModes.includes(settings.mode))
    throw new Error(
      "This saved design uses a mode that is currently unavailable. The saved original is unchanged. Select an available mode and a photograph to start a new design.",
    );
  const { zoom, x, y, rotation } = input.crop;
  if (
    typeof zoom !== "number" ||
    !Number.isFinite(zoom) ||
    zoom < 1 ||
    zoom > 4 ||
    typeof x !== "number" ||
    !Number.isFinite(x) ||
    Math.abs(x) > 1 ||
    typeof y !== "number" ||
    !Number.isFinite(y) ||
    Math.abs(y) > 1 ||
    typeof rotation !== "number" ||
    ![0, 90, 180, 270].includes(rotation)
  )
    throw new Error(
      "This saved design has invalid crop settings. The saved original has not been changed.",
    );
  if (
    input.rendererVersion !== undefined &&
    (typeof input.rendererVersion !== "string" ||
      input.rendererVersion.length > 120)
  )
    throw new Error(
      "This saved design has invalid version information. The saved original has not been changed.",
    );
  const project: RestorableProject = {
    id: typeof input.id === "string" ? input.id : "current",
    name: input.name,
    updatedAt: input.updatedAt,
    image: input.image,
    settings,
    crop: { zoom, x, y, rotation },
    productId: input.productId,
    finishId: input.finishId,
    referenceId:
      typeof input.referenceId === "string" ? input.referenceId : null,
    rendererVersion: input.rendererVersion as string | undefined,
  };
  if (input.subjectMask !== undefined) {
    const mask = normalizeSubjectMask(input.subjectMask);
    assertSubjectMaskBinding(mask, {
      sourceSha256: mask.sourceSha256,
      crop: project.crop,
      widthMm: settings.widthMm,
      heightMm: settings.heightMm,
    });
    if (settings.mode !== "dots")
      throw new Error(
        "Manual subject selections are supported in Signature Dots only.",
      );
    project.subjectMask = mask;
  } else if ((settings.subjectMaskStrength ?? 0) > 0) {
    throw new Error(
      "This saved design is missing its manual subject selection. The saved original has not been changed.",
    );
  }
  return {
    project,
    needsRendererReview: project.rendererVersion !== RENDERER_VERSION,
  };
}

export function parseLocalPresets(
  input: unknown,
): { name: string; settings: RenderSettings }[] {
  if (!Array.isArray(input)) return [];
  return input.slice(-12).flatMap((value) => {
    if (!record(value) || !label(value.name) || !record(value.settings))
      return [];
    try {
      return [
        {
          name: value.name.slice(0, 40),
          settings: normalizeSettings({
            ...DEFAULT_SETTINGS,
            mode: value.settings.mode as RenderMode,
            ...presetSettings(value.settings as unknown as RenderSettings),
          }),
        },
      ];
    } catch {
      return [];
    }
  });
}

export function parsePublishedPresets(
  input: unknown,
  mode: RenderMode,
): PublishedPreset[] {
  if (!record(input) || !Array.isArray(input.presets))
    throw new Error(
      "Studio presets are unavailable. Built-in presets are still available.",
    );
  return input.presets.slice(0, 100).flatMap((value) => {
    if (
      !record(value) ||
      !identifier(value.id) ||
      !label(value.name) ||
      typeof value.description !== "string" ||
      value.description.length > 1000 ||
      !Number.isSafeInteger(value.version) ||
      (value.version as number) < 1 ||
      value.mode !== mode ||
      value.rendererVersion !== RENDERER_VERSION ||
      !record(value.settings)
    )
      return [];
    try {
      const settings = presetSettings(
        normalizeSettings({
          ...DEFAULT_SETTINGS,
          ...presetSettings(value.settings as unknown as RenderSettings),
          mode,
        }),
      );
      return [
        {
          id: value.id,
          version: value.version as number,
          name: value.name,
          description: value.description,
          mode,
          settings,
          rendererVersion: value.rendererVersion,
        },
      ];
    } catch {
      return [];
    }
  });
}

export function applyStudioPreset(
  current: RenderSettings,
  preset: PublishedPreset,
): RenderSettings {
  if (
    preset.mode !== current.mode ||
    preset.rendererVersion !== RENDERER_VERSION
  )
    throw new Error(
      "This preset needs an update before it can be used in the current renderer.",
    );
  return normalizeSettings({
    ...current,
    palette: undefined,
    cellShape: undefined,
    guideColor: undefined,
    detailPreservation: 0,
    ...presetSettings(preset.settings as RenderSettings),
  });
}
