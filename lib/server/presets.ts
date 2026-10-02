import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  RENDERER_VERSION,
  RENDER_MODE_IDS,
} from "../renderers";
import { getAvailableModes } from "../mode-availability";
import {
  presetSettings,
  type RendererPreset,
  type PublishedPreset,
  type PresetVersion,
  type PublicPresetsResponse,
} from "../preset-types";
import { settingsSchema } from "./schema";
import { ApiError } from "./security";
import { database, getRecord, listRecords, putRecord } from "./store";
import { hasDatabase, localPersistenceAllowed } from "./config";
import { requireAdminRole, type AdminIdentity } from "./admin-auth";

export const presetSettingsSchema = settingsSchema
  .omit({
    mode: true,
    widthMm: true,
    heightMm: true,
    inkColor: true,
    text: true,
    subjectMaskStrength: true,
  })
  .strict();
const metadata = {
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).default(""),
};
export const createPresetSchema = z
  .object({
    ...metadata,
    mode: z.enum(RENDER_MODE_IDS),
    settings: presetSettingsSchema,
  })
  .strict();
const expectedRevision = z.number().int().positive();
export const updatePresetSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("revise"),
      expectedRevision,
      ...metadata,
      settings: presetSettingsSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("publish"),
      expectedRevision,
      version: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      action: z.enum(["unpublish", "archive", "restore"]),
      expectedRevision,
    })
    .strict(),
]);

function normalizedPreset(body: z.infer<typeof createPresetSchema>) {
  try {
    return presetSettings(
      normalizeSettings({
        ...DEFAULT_SETTINGS,
        ...body.settings,
        mode: body.mode,
        text: undefined,
      }),
    );
  } catch {
    throw new ApiError(
      400,
      "These preset settings are not compatible. Check the diameter, palette and margin controls.",
    );
  }
}
function version(
  body: z.infer<typeof createPresetSchema>,
  number: number,
  actor: AdminIdentity,
  now: string,
): PresetVersion {
  return {
    version: number,
    name: body.name,
    description: body.description,
    mode: body.mode,
    settings: normalizedPreset(body),
    rendererVersion: RENDERER_VERSION,
    createdAt: now,
    createdBy: actor.userId,
    actorKind: actor.kind,
  };
}
export async function listAdminPresets(): Promise<RendererPreset[]> {
  return (await listRecords<RendererPreset>("presets")).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}
export async function publishedPresets(
  mode?: string | null,
): Promise<PublicPresetsResponse> {
  if (mode && !RENDER_MODE_IDS.some((id) => id === mode))
    throw new ApiError(400, "Unknown renderer mode.");
  if (!hasDatabase() && !localPersistenceAllowed())
    return { presets: [], persistence: "unconfigured" };
  const allowed = getAvailableModes();
  const presets: PublishedPreset[] = [];
  for (const record of await listAdminPresets()) {
    if (
      record.archived ||
      !record.publishedVersion ||
      !allowed.includes(record.mode) ||
      (mode && record.mode !== mode)
    )
      continue;
    const selected = record.versions.find(
      (item) => item.version === record.publishedVersion,
    );
    if (
      !selected ||
      selected.rendererVersion !== RENDERER_VERSION ||
      selected.mode !== record.mode
    )
      continue;
    // Explicit projection prevents author IDs, audit records or future private fields leaking publicly.
    presets.push({
      id: record.id,
      version: selected.version,
      name: selected.name,
      description: selected.description,
      mode: record.mode,
      settings: presetSettings({
        ...DEFAULT_SETTINGS,
        ...selected.settings,
        mode: record.mode,
      }),
      rendererVersion: selected.rendererVersion,
    });
  }
  return {
    presets,
    persistence: hasDatabase() ? "supabase" : "local-development",
  };
}
export async function createPreset(input: unknown, actor: AdminIdentity) {
  const body = createPresetSchema.parse(input);
  const now = new Date().toISOString();
  const first = version(body, 1, actor, now);
  const record: RendererPreset = {
    id: randomUUID(),
    mode: body.mode,
    revision: 1,
    currentVersion: 1,
    publishedVersion: null,
    archived: false,
    createdAt: now,
    updatedAt: now,
    versions: [first],
    audit: [
      {
        at: now,
        action: "create",
        actorId: actor.userId,
        actorKind: actor.kind,
        version: 1,
      },
    ],
  };
  if (!(await putRecord("presets", record.id, record, true)))
    throw new ApiError(409, "Preset creation conflicted. Try again.");
  return record;
}
export function revisePreset(
  record: RendererPreset,
  input: unknown,
  actor: AdminIdentity,
): RendererPreset {
  const body = updatePresetSchema.parse(input);
  if (record.revision !== body.expectedRevision)
    throw new ApiError(
      409,
      "This preset changed. Reload its latest revision before saving.",
    );
  if (body.action !== "revise") requireAdminRole(actor, "operator");
  if (record.archived && body.action !== "restore")
    throw new ApiError(409, "Restore this archived preset before changing it.");
  if (!record.archived && body.action === "restore")
    throw new ApiError(409, "This preset is not archived.");
  const now = new Date().toISOString();
  const next: RendererPreset = {
    ...record,
    revision: record.revision + 1,
    updatedAt: now,
  };
  if (body.action === "revise") {
    if (record.versions.length >= 100)
      throw new ApiError(
        409,
        "This preset has reached its history limit. Create a new named preset.",
      );
    const appended = version(
      { ...body, mode: record.mode },
      record.currentVersion + 1,
      actor,
      now,
    );
    next.versions = [...record.versions, appended];
    next.currentVersion = appended.version;
  } else if (body.action === "publish") {
    const selected = record.versions.find(
      (item) => item.version === body.version,
    );
    if (!selected)
      throw new ApiError(400, "Choose an existing preset version to publish.");
    if (
      selected.rendererVersion !== RENDERER_VERSION ||
      selected.mode !== record.mode
    )
      throw new ApiError(
        409,
        "This preset needs a new draft reviewed with the current renderer before publication.",
      );
    next.publishedVersion = body.version;
  } else if (body.action === "unpublish") next.publishedVersion = null;
  else if (body.action === "archive") {
    next.archived = true;
    next.publishedVersion = null;
  } else next.archived = false;
  next.audit = [
    ...record.audit,
    {
      at: now,
      action: body.action,
      actorId: actor.userId,
      actorKind: actor.kind,
      version:
        body.action === "revise" ? next.currentVersion : next.publishedVersion,
    },
  ];
  return next;
}
const locks = new Map<string, Promise<void>>();
export async function updatePreset(
  id: string,
  input: unknown,
  actor: AdminIdentity,
) {
  const expected = await getRecord<RendererPreset>("presets", id);
  if (!expected) throw new ApiError(404, "Preset not found.");
  const next = revisePreset(expected, input, actor);
  const db = database();
  if (db) {
    const { data, error } = await db.rpc("studio_replace_preset", {
      preset_id: id,
      expected_payload: expected,
      replacement_payload: next,
    });
    if (error) throw new ApiError(503, "The preset could not be updated.");
    if (!data)
      throw new ApiError(
        409,
        "This preset changed during editing. Reload before saving.",
      );
  } else {
    const previous = locks.get(id) ?? Promise.resolve();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    locks.set(id, pending);
    await previous;
    try {
      const current = await getRecord<RendererPreset>("presets", id);
      if (JSON.stringify(current) !== JSON.stringify(expected))
        throw new ApiError(
          409,
          "This preset changed during editing. Reload before saving.",
        );
      await putRecord("presets", id, next);
    } finally {
      release();
      if (locks.get(id) === pending) locks.delete(id);
    }
  }
  return next;
}
