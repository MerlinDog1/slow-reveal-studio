"use client";

import { useEffect, useRef, useState } from "react";
import { ACTIVE_RENDER_MODES, RENDER_MODES } from "@/lib/mode-availability";
import {
  DEFAULT_SETTINGS,
  PRESETS,
  RENDERER_VERSION,
  type RenderMode,
} from "@/lib/renderers";
import {
  PRESET_SETTING_KEYS,
  presetSettings,
  type RendererPreset,
  type PresetVersion,
} from "@/lib/preset-types";

const initialSettings = JSON.stringify(
  presetSettings(DEFAULT_SETTINGS),
  null,
  2,
);
const serialise = (version: PresetVersion) =>
  JSON.stringify(version.settings, null, 2);

export function AdminPresets({
  token,
  role,
  onAccessDenied,
}: {
  token: string;
  role: "reviewer" | "operator";
  onAccessDenied: (status: number, requestToken: string) => Promise<void>;
}) {
  const [presets, setPresets] = useState<RendererPreset[]>([]);
  const [selected, setSelected] = useState<RendererPreset | null>(null);
  const [versionNumber, setVersionNumber] = useState(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<RenderMode>("dots");
  const [settingsText, setSettingsText] = useState(initialSettings);
  const [loading, setLoading] = useState(false);
  const [mutating, setMutating] = useState(false);
  const busy = loading || mutating;
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [reload, setReload] = useState(0);
  const request = useRef(0);
  const currentToken = useRef(token);
  currentToken.current = token;
  const loadingRef = useRef(false);
  const mutatingRef = useRef(false);
  const reloadAfterMutation = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current++;
    };
  }, []);
  const version = selected?.versions.find(
    (item) => item.version === versionNumber,
  );
  const dirty = version
    ? name !== version.name ||
      description !== version.description ||
      settingsText !== serialise(version)
    : Boolean(
        name ||
        description ||
        mode !== "dots" ||
        settingsText !== initialSettings,
      );

  useEffect(() => {
    if (mutatingRef.current) reloadAfterMutation.current = true;
    else void load(token);
    return () => {
      request.current++;
    };
  }, [token, reload]);

  async function readResponse(response: Response, requestToken: string) {
    if (response.status === 401 || response.status === 403)
      await onAccessDenied(response.status, requestToken);
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "Renderer presets are unavailable.");
    return data;
  }
  async function load(access = currentToken.current) {
    if (mutatingRef.current) {
      reloadAfterMutation.current = true;
      return;
    }
    const current = ++request.current;
    setError("");
    loadingRef.current = true;
    setLoading(true);
    try {
      const data = await readResponse(
        await fetch("/api/admin/presets", {
          headers: { Authorization: `Bearer ${access}` },
          cache: "no-store",
        }),
        access,
      );
      if (
        !mounted.current ||
        current !== request.current ||
        access !== currentToken.current
      )
        return;
      setPresets(data.presets);
      setLoaded(true);
      if (selected) {
        const fresh = (data.presets as RendererPreset[]).find(
          (item) => item.id === selected.id,
        );
        if (fresh && !dirty)
          choose(
            fresh,
            fresh.versions.some((item) => item.version === versionNumber)
              ? versionNumber
              : fresh.currentVersion,
          );
        else if (fresh && fresh.revision !== selected.revision)
          setNotice(
            "This preset changed while you were editing. Your draft remains here; copy it if needed, then discard edits and reload before saving.",
          );
      }
    } catch (cause) {
      if (
        mounted.current &&
        current === request.current &&
        access === currentToken.current
      )
        setError(
          cause instanceof Error
            ? cause.message
            : "Renderer presets are unavailable.",
        );
    } finally {
      if (mounted.current && current === request.current) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }
  function choose(
    record: RendererPreset | null,
    number = record?.currentVersion ?? 1,
  ) {
    const chosen = record?.versions.find((item) => item.version === number);
    setSelected(record);
    setVersionNumber(number);
    setName(chosen?.name ?? "");
    setDescription(chosen?.description ?? "");
    setMode(record?.mode ?? "dots");
    setSettingsText(chosen ? serialise(chosen) : initialSettings);
    setError("");
    setNotice("");
  }
  function updateRecord(record: RendererPreset) {
    setPresets((old) => [
      record,
      ...old.filter((item) => item.id !== record.id),
    ]);
    choose(record, record.currentVersion);
  }
  async function save() {
    if (loadingRef.current || mutatingRef.current) return;
    setError("");
    setNotice("");
    let settings: unknown;
    try {
      settings = JSON.parse(settingsText);
    } catch {
      setError(
        "The renderer settings must be valid JSON. Copy them from the lab or choose a starting preset.",
      );
      return;
    }
    if (
      !settings ||
      Array.isArray(settings) ||
      typeof settings !== "object" ||
      Object.keys(settings).some(
        (key) => !(PRESET_SETTING_KEYS as readonly string[]).includes(key),
      )
    ) {
      setError(
        "Use algorithm settings only. Photo, crop, canvas size, ink and personalised text cannot be stored in a studio preset.",
      );
      return;
    }
    mutatingRef.current = true;
    setMutating(true);
    const access = currentToken.current;
    try {
      const data = await readResponse(
        await fetch(
          selected ? `/api/admin/presets/${selected.id}` : "/api/admin/presets",
          {
            method: selected ? "PATCH" : "POST",
            headers: {
              Authorization: `Bearer ${access}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(
              selected
                ? {
                    action: "revise",
                    expectedRevision: selected.revision,
                    name,
                    description,
                    settings,
                  }
                : { name, description, mode, settings },
            ),
          },
        ),
        access,
      );
      if (!mounted.current) return;
      updateRecord(data.preset);
      setNotice(
        `Version ${data.preset.currentVersion} saved. Publishing is a separate operator action; the existing public version has not changed.`,
      );
    } catch (cause) {
      if (!mounted.current) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "The draft could not be saved.",
      );
    } finally {
      finishMutation();
    }
  }
  async function change(
    action: "publish" | "unpublish" | "archive" | "restore",
  ) {
    if (
      !selected ||
      dirty ||
      role !== "operator" ||
      loadingRef.current ||
      mutatingRef.current
    )
      return;
    mutatingRef.current = true;
    setMutating(true);
    const access = currentToken.current;
    setError("");
    setNotice("");
    try {
      const data = await readResponse(
        await fetch(`/api/admin/presets/${selected.id}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${access}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action,
            expectedRevision: selected.revision,
            ...(action === "publish" ? { version: versionNumber } : {}),
          }),
        }),
        access,
      );
      if (!mounted.current) return;
      updateRecord(data.preset);
      setNotice(
        action === "publish"
          ? `Version ${versionNumber} published for compatible, available studio modes.`
          : action === "unpublish"
            ? "This preset is no longer offered to customers. Its history is preserved."
            : action === "archive"
              ? "Preset archived and unpublished. Its history can be restored."
              : "Preset restored as a draft. Publish a reviewed version when it is ready.",
      );
    } catch (cause) {
      if (!mounted.current) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "The preset could not be updated.",
      );
    } finally {
      finishMutation();
    }
  }
  function finishMutation() {
    mutatingRef.current = false;
    if (!mounted.current) return;
    setMutating(false);
    if (reloadAfterMutation.current) {
      reloadAfterMutation.current = false;
      setReload((value) => value + 1);
    }
  }

  return (
    <details className="prose-card">
      <summary>Studio renderer presets</summary>
      <p>
        Save named algorithm settings centrally, review their version history
        and publish a chosen version. Photos, crops, sizes, ink choices and
        personalised text stay with each customer’s design.
      </p>
      <p className="fine-print">
        A published preset does not approve a physical product. Mode release
        gates and individual order review still apply.
      </p>
      {error && (
        <p className="inline-warning" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <div className="admin-actions">
        <button
          className="button light"
          disabled={busy || dirty}
          onClick={() => choose(null)}
        >
          New preset
        </button>
        <button
          className="button light"
          disabled={busy}
          onClick={() => void load()}
        >
          Reload presets
        </button>
      </div>
      {!loaded ? (
        <p>
          {busy
            ? "Loading studio presets…"
            : "Load studio presets before editing."}
        </p>
      ) : !presets.length ? (
        <p>
          No studio presets yet. Built-in controls remain available in the
          editor.
        </p>
      ) : (
        <ul style={{ paddingLeft: 20 }}>
          {presets.map((record) => (
            <li key={record.id} style={{ marginBlock: 12 }}>
              <button
                className="text-button"
                disabled={busy || dirty}
                onClick={() => choose(record)}
              >
                {record.versions.at(-1)?.name ?? record.id} · {record.mode}
              </button>{" "}
              <span>
                {record.archived
                  ? "Archived"
                  : record.publishedVersion
                    ? `Public version ${record.publishedVersion}`
                    : "Draft"}{" "}
                · {record.versions.length} version
                {record.versions.length === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
      )}
      <h3>{selected ? "Review this preset" : "Create a draft preset"}</h3>
      {selected && (
        <label className="text-field">
          Stored version
          <select
            disabled={busy || dirty}
            value={versionNumber}
            onChange={(event) => choose(selected, Number(event.target.value))}
          >
            {selected.versions.map((item) => (
              <option key={item.version} value={item.version}>
                Version {item.version} · {item.name}
                {selected.publishedVersion === item.version ? " · public" : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      {version && (
        <p className="fine-print">
          {version.rendererVersion} · Saved{" "}
          {new Date(version.createdAt).toLocaleString("en-GB")} by{" "}
          {version.actorKind === "local-token"
            ? "local development operator"
            : version.createdBy}
          .
        </p>
      )}
      {dirty && (
        <p className="inline-warning" role="status">
          These edits are not stored yet. Save a new version or discard edits
          before publishing or changing the selected preset.
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <fieldset
          disabled={busy || selected?.archived}
          style={{ border: 0, padding: 0, margin: 0 }}
        >
          <label className="text-field">
            Preset name
            <input
              required
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="text-field">
            Description
            <input
              maxLength={500}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <label className="text-field">
            Renderer mode
            <select
              value={mode}
              disabled={Boolean(selected)}
              onChange={(event) => setMode(event.target.value as RenderMode)}
            >
              {RENDER_MODES.filter(
                (item) =>
                  ACTIVE_RENDER_MODES.includes(item) || selected?.mode === item,
              ).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="text-field">
            Start settings from
            <select
              value=""
              onChange={(event) =>
                event.target.value &&
                setSettingsText(
                  JSON.stringify(
                    presetSettings({
                      ...DEFAULT_SETTINGS,
                      ...PRESETS[event.target.value as keyof typeof PRESETS],
                    }),
                    null,
                    2,
                  ),
                )
              }
            >
              <option value="">Choose a built-in starting point</option>
              {Object.keys(PRESETS).map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </label>
          <label className="text-field">
            Algorithm settings (JSON)
            <textarea
              spellCheck={false}
              rows={16}
              maxLength={12000}
              value={settingsText}
              onChange={(event) => setSettingsText(event.target.value)}
              style={{
                width: "100%",
                maxWidth: "100%",
                fontFamily: "monospace",
                padding: 12,
                border: "1px solid #d7d3c7",
                borderRadius: 0,
              }}
            />
          </label>
          <p className="fine-print">
            Use “Copy preset settings” in a local rendering lab to transfer
            tested controls here. Saving an edit creates a new immutable
            version.
          </p>
          <button
            className="button"
            disabled={
              !loaded ||
              !name.trim() ||
              (Boolean(selected) &&
                !dirty &&
                version?.rendererVersion === RENDERER_VERSION)
            }
          >
            {selected ? "Save as a new version" : "Save draft preset"}
          </button>
        </fieldset>
      </form>
      {dirty && (
        <button
          className="text-button"
          disabled={busy}
          onClick={() => choose(selected, versionNumber)}
        >
          Discard draft edits
        </button>
      )}
      {selected && (
        <div className="admin-actions" style={{ marginTop: 20 }}>
          {selected.archived ? (
            <button
              className="button light"
              disabled={busy || role !== "operator" || dirty}
              onClick={() => void change("restore")}
            >
              Restore preset
            </button>
          ) : (
            <>
              <button
                className="button"
                disabled={
                  busy ||
                  role !== "operator" ||
                  dirty ||
                  selected.publishedVersion === versionNumber ||
                  version?.rendererVersion !== RENDERER_VERSION
                }
                onClick={() => void change("publish")}
              >
                Publish version {versionNumber}
              </button>
              <button
                className="button light"
                disabled={
                  busy ||
                  role !== "operator" ||
                  dirty ||
                  !selected.publishedVersion
                }
                onClick={() => void change("unpublish")}
              >
                Unpublish
              </button>
              <button
                className="button light"
                disabled={busy || role !== "operator" || dirty}
                onClick={() => void change("archive")}
              >
                Archive preset
              </button>
            </>
          )}
        </div>
      )}
      {version && version.rendererVersion !== RENDERER_VERSION && (
        <p className="inline-warning">
          This version used an older renderer. Review its controls and save a
          new version before publishing.
        </p>
      )}
    </details>
  );
}
