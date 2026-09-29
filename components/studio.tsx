"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  CircleHelp,
  ImagePlus,
  Layers,
  LoaderCircle,
  Maximize,
  Minus,
  Plus,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { PreviewDialog } from "@/components/preview-dialog";
import { PreviewViewport } from "@/components/preview-viewport";
import { SubjectMaskEditor } from "@/components/subject-mask-editor";
import { hashBlob } from "@/lib/browser-subject-mask";
import { assertSubjectMaskBinding, type SubjectMask } from "@/lib/subject-mask";
import {
  DEFAULT_SETTINGS,
  PRESETS,
  CROSS_STITCH_PRESETS,
  RENDERER_VERSION,
  renderImage,
  toSvg,
  effectiveGuideColor,
  isOpticalMode,
  usesOpticalColour,
  type RenderGeometry,
  type RenderMode,
  type RenderSettings,
} from "@/lib/renderers";
import { INKS, formatPrice } from "@/lib/catalog";
import { MOSAIC_MARKER_PALETTE } from "@/lib/mosaic-palette";
import { OPTICAL_MARKER_PALETTE } from "@/lib/optical-palette";
import {
  DEFAULT_MARKER_PROFILE_ID,
  MARKER_PALETTE_PROFILES,
  getMarkerPalette,
  identifyMarkerPalette,
} from "@/lib/marker-palettes";
import {
  parseStudioCatalogue,
  productDimensions,
  reconcileStudioSelection,
  validateRestorableProject,
  parseLocalPresets,
  parsePublishedPresets,
  applyStudioPreset,
  type StudioCatalogue,
  type StudioSelection,
  type RestorableProject,
} from "@/lib/studio-state";
import { presetSettings, type PublishedPreset } from "@/lib/preset-types";
import { REFERENCE_IMAGES } from "@/lib/reference-images";
import {
  DEFAULT_CROP,
  cropImage,
  loadImage,
  type Crop,
} from "@/lib/image-processing";
import {
  analysePhoto,
  detectLocalFaces,
  type PhotoAnalysis,
  type FaceDetectionResult,
} from "@/lib/photo-analysis";
import {
  getLocalProject,
  saveLocalProject,
  deleteLocalProject,
} from "@/lib/browser-storage";
import { exportArtwork } from "@/lib/export-artwork";
import { track } from "@/lib/analytics";
import { ArtworkPreview } from "@/components/artwork-preview";

type View = "finished" | "template" | "original" | "compare";
const MODES: { id: RenderMode; name: string; description: string }[] = [
  { id: "dots", name: "Signature Dots", description: "One dot at a time." },
  {
    id: "fibonacci",
    name: "Fibonacci Spiral",
    description: "Sunflower spirals. A picture in every dot.",
  },
  {
    id: "mosaic",
    name: "Mosaic Fill",
    description: "Small shapes. A bigger picture.",
  },
  {
    id: "cross-stitch",
    name: "Cross Stitch",
    description: "An even grid. A hidden picture in colour.",
  },
  {
    id: "line-amplification",
    name: "Line Study",
    description: "An experiment in rhythm.",
  },
  {
    id: "colour-blend",
    name: "Colour Blend",
    description: "Separate dots. Blended colour.",
  },
  {
    id: "tv-weave",
    name: "TV Weave",
    description: "Colour in every little dash.",
  },
];
const PRESET_NAMES = {
  easy: "Easy",
  standard: "Standard",
  detailed: "Detailed",
  bold: "Bold",
  portrait: "Fine portrait",
};
const DEFAULT_AVAILABLE_MODES: RenderMode[] = ["dots"];
function Range({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className="range-field">
      <span>
        {label}
        <output>
          {Math.round(value * 100) / 100}
          {suffix}
        </output>
      </span>
      <input
        aria-label={label}
        aria-valuetext={`${Math.round(value * 100) / 100}${suffix}`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function Studio({
  lab = false,
  initialMode = "dots",
  availableModes = DEFAULT_AVAILABLE_MODES,
}: {
  lab?: boolean;
  initialMode?: RenderMode;
  availableModes?: RenderMode[];
}) {
  const modeOptions = MODES.filter((mode) => availableModes.includes(mode.id));
  const startingMode = availableModes.includes(initialMode)
    ? initialMode
    : (modeOptions[0]?.id ?? "dots");
  const [settings, setSettings] = useState<RenderSettings>({
    ...DEFAULT_SETTINGS,
    ...PRESETS.standard,
    mode: startingMode,
    ...(isOpticalMode(startingMode) || startingMode === "cross-stitch"
      ? { palette: getMarkerPalette(DEFAULT_MARKER_PROFILE_ID, 16) }
      : {}),
    ...(startingMode === "cross-stitch" ? CROSS_STITCH_PRESETS.standard : {}),
  });
  const [preset, setPreset] = useState("standard");
  const markerProfile = identifyMarkerPalette(settings.palette);
  const prototypeColours =
    settings.mode === "mosaic" ? MOSAIC_MARKER_PALETTE : OPTICAL_MARKER_PALETTE;
  const prototypePaletteCount =
    settings.palette &&
    (settings.mode === "mosaic" ? [2, 4, 6, 8] : [8]).includes(
      settings.palette.length,
    ) &&
    settings.palette.every(
      (colour, index) => colour.toLowerCase() === prototypeColours[index],
    )
      ? settings.palette.length
      : undefined;
  const [crop, setCrop] = useState<Crop>(DEFAULT_CROP);
  const [source, setSource] = useState<string | null>(null);
  const [sourceBlob, setSourceBlob] = useState<Blob | null>(null);
  const [sourceSha256, setSourceSha256] = useState("");
  const [subjectMask, setSubjectMask] = useState<SubjectMask | undefined>();
  const [maskEditorOpen, setMaskEditorOpen] = useState(false);
  const [sourceName, setSourceName] = useState("Your photograph");
  const [referenceId, setReferenceId] = useState<string | null>(null);
  const [croppedUrl, setCroppedUrl] = useState<string | null>(null);
  const [geometry, setGeometry] = useState<RenderGeometry | null>(null);
  const [rendering, setRendering] = useState(false);
  const [renderMs, setRenderMs] = useState(0);
  const [photoAnalysis, setPhotoAnalysis] = useState<PhotoAnalysis | null>(
    null,
  );
  const [faceDetection, setFaceDetection] = useState<FaceDetectionResult>({
    status: "unavailable",
    boxes: [],
  });
  const [view, setView] = useState<View>("finished");
  const [compare, setCompare] = useState(50);
  const [zoomPreview, setZoomPreview] = useState(false);
  const [panel, setPanel] = useState(lab ? "style" : "photo");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [productId, setProductId] = useState("");
  const [finishId, setFinishId] = useState("");
  const [inkId, setInkId] = useState<string>(INKS[0].id);
  const [saved, setSaved] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [rights, setRights] = useState(false);
  const [safeArea, setSafeArea] = useState(false);
  const [customPresets, setCustomPresets] = useState<
    { name: string; settings: RenderSettings }[]
  >([]);
  const [publishedPresets, setPublishedPresets] = useState<PublishedPreset[]>(
    [],
  );
  const [presetsStatus, setPresetsStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const fileInput = useRef<HTMLInputElement>(null);
  const worker = useRef<Worker | null>(null);
  const renderId = useRef(0);
  const startTime = useRef(0);
  const sourceUrl = useRef<string | null>(null);
  const sourceImage = useRef<HTMLImageElement | null>(null);
  const sourceRequest = useRef(0);
  const [catalogue, setCatalogue] = useState<StudioCatalogue | null>(null);
  const [catalogueStatus, setCatalogueStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [catalogueError, setCatalogueError] = useState("");
  const [catalogueAttempt, setCatalogueAttempt] = useState(0);
  const selectionOrigin = useRef<"new" | "chosen" | "restore">("new");
  const restoreRequest = useRef(0);
  const [restoredSelection, setRestoredSelection] =
    useState<StudioSelection | null>(null);
  const [catalogueReviewed, setCatalogueReviewed] = useState(false);
  const [pendingRestore, setPendingRestore] =
    useState<RestorableProject | null>(null);
  const [projectIssue, setProjectIssue] = useState("");
  const products = catalogue?.products ?? [];
  const finishes = catalogue?.finishes ?? [];
  const modeAvailable = availableModes.includes(settings.mode);
  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    const timeout = setTimeout(() => {
      controller.abort();
      if (!disposed) {
        setCatalogueStatus("error");
        setCatalogueError("The catalogue took too long to load.");
      }
    }, 10000);
    setCatalogueStatus("loading");
    setCatalogue(null);
    setCatalogueError("");
    fetch("/api/catalog", { signal: controller.signal, cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((c) => {
        clearTimeout(timeout);
        const next = parseStudioCatalogue(c);
        if (controller.signal.aborted) return;
        setCatalogue(next);
        setCatalogueStatus("ready");
        setCatalogueReviewed(false);
        // Restoring owns its original selection, even when catalogue loading finishes later.
        if (selectionOrigin.current !== "new") return;
        const current =
          next.products.find(
            (p) =>
              p.widthMm === DEFAULT_SETTINGS.widthMm &&
              p.heightMm === DEFAULT_SETTINGS.heightMm,
          ) ?? next.products[0];
        if (current) {
          setProductId(current.id);
          setSettings((s) => ({ ...s, ...productDimensions(current, s) }));
        }
        if (next.finishes[0]) setFinishId(next.finishes[0].id);
        if (current || next.finishes[0]) selectionOrigin.current = "chosen";
      })
      .catch((e) => {
        clearTimeout(timeout);
        if (controller.signal.aborted) return;
        setCatalogueStatus("error");
        setCatalogueError(
          e instanceof Error && e.message
            ? e.message
            : "The product catalogue could not be loaded.",
        );
      });
    return () => {
      disposed = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [catalogueAttempt]);
  useEffect(() => {
    const controller = new AbortController();
    setPublishedPresets([]);
    setPresetsStatus("loading");
    const timeout = setTimeout(() => {
      controller.abort();
      setPresetsStatus("error");
    }, 10000);
    fetch(`/api/presets?mode=${encodeURIComponent(settings.mode)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((body) => {
        clearTimeout(timeout);
        if (!controller.signal.aborted) {
          setPublishedPresets(parsePublishedPresets(body, settings.mode));
          setPresetsStatus("ready");
        }
      })
      .catch(() => {
        clearTimeout(timeout);
        if (!controller.signal.aborted) setPresetsStatus("error");
      });
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [settings.mode]);
  useEffect(() => {
    track("builder_opened", { mode: initialMode, step: lab ? "lab" : "photo" });
  }, [initialMode, lab]);
  useEffect(() => {
    if (view === "template")
      track("template_viewed", { mode: settings.mode, productId });
    if (view === "finished")
      track("finished_preview_viewed", { mode: settings.mode, productId });
  }, [view, settings.mode, productId]);
  const product = products.find((p) => p.id === productId);
  const finish = finishes.find((f) => f.id === finishId);
  const selection = catalogue
    ? reconcileStudioSelection(catalogue, { productId, finishId, settings })
    : null;
  const originalSelection =
    catalogue && restoredSelection
      ? reconcileStudioSelection(catalogue, restoredSelection)
      : null;
  const reviewRequired = !!restoredSelection && !catalogueReviewed;
  const kitAvailable =
    catalogueStatus === "ready" &&
    !!selection?.ready &&
    !reviewRequired &&
    !pendingRestore;
  const update = useCallback(
    (patch: Partial<RenderSettings>) => {
      if (
        subjectMask &&
        ((patch.mode !== undefined && patch.mode !== settings.mode) ||
          (patch.widthMm !== undefined && patch.widthMm !== settings.widthMm) ||
          (patch.heightMm !== undefined &&
            patch.heightMm !== settings.heightMm))
      ) {
        setError(
          "Clear the manual subject selection before changing the style or canvas size.",
        );
        return;
      }
      setSettings((s) => {
        const next = { ...s, ...patch };
        if (next.mode === "cross-stitch" && next.palette === undefined)
          next.palette = getMarkerPalette(DEFAULT_MARKER_PROFILE_ID, 16);
        return next;
      });
      setSaved(false);
    },
    [subjectMask, settings.mode, settings.widthMm, settings.heightMm],
  );
  useEffect(() => {
    const w = new Worker(
      new URL("../workers/render.worker.ts", import.meta.url),
    );
    worker.current = w;
    w.onmessage = (event) => {
      const { id, geometry: next, error: workerError } = event.data;
      if (id !== renderId.current) return;
      setRendering(false);
      setRenderMs(Math.round(performance.now() - startTime.current));
      if (workerError) setError(workerError);
      else {
        setGeometry(next);
        setError("");
      }
    };
    w.onerror = () => {
      setError(
        "The renderer stopped. Try a less detailed preset or reload the studio.",
      );
      setRendering(false);
    };
    return () => {
      w.terminate();
    };
  }, []);
  useEffect(() => {
    try {
      setCustomPresets(
        parseLocalPresets(
          JSON.parse(localStorage.getItem("sr-presets") ?? "[]"),
        ),
      );
    } catch {
      /* ignore obsolete preferences */
    }
  }, []);
  const openBlob = useCallback(
    async (
      blob: Blob,
      name: string,
      refId: string | null = null,
      isCurrent: () => boolean = () => true,
    ) => {
      const request = ++sourceRequest.current;
      const url = URL.createObjectURL(blob);
      let image: HTMLImageElement;
      let digest: string;
      try {
        image = await loadImage(url);
        if (image.naturalWidth * image.naturalHeight > 40_000_000)
          throw new Error(
            "Please resize this photograph to 40 megapixels or less.",
          );
        digest = await hashBlob(blob);
      } catch (e) {
        URL.revokeObjectURL(url);
        throw e;
      }
      if (request !== sourceRequest.current || !isCurrent()) {
        URL.revokeObjectURL(url);
        return false;
      }
      if (sourceUrl.current) URL.revokeObjectURL(sourceUrl.current);
      sourceUrl.current = url;
      sourceImage.current = image;
      setSourceSha256(digest);
      setSubjectMask(undefined);
      setMaskEditorOpen(false);
      setSettings((s) => ({ ...s, subjectMaskStrength: 0 }));
      setCroppedUrl(null);
      setPhotoAnalysis(null);
      setFaceDetection({ status: "checking", boxes: [] });
      setSource(url);
      setSourceBlob(blob);
      setSourceName(name);
      setReferenceId(refId);
      setCrop(DEFAULT_CROP);
      setSaved(false);
      setError("");
      setRights(false);
      const faceCanvas = document.createElement("canvas");
      const faceScale = Math.min(
        1,
        512 / Math.max(image.naturalWidth, image.naturalHeight),
      );
      faceCanvas.width = Math.max(
        1,
        Math.round(image.naturalWidth * faceScale),
      );
      faceCanvas.height = Math.max(
        1,
        Math.round(image.naturalHeight * faceScale),
      );
      faceCanvas
        .getContext("2d")!
        .drawImage(image, 0, 0, faceCanvas.width, faceCanvas.height);
      void detectLocalFaces(
        faceCanvas,
        faceCanvas.width,
        faceCanvas.height,
      ).then((result) => {
        if (request === sourceRequest.current) setFaceDetection(result);
      });
      return true;
    },
    [],
  );
  const loadReference = useCallback(
    async (id: string) => {
      const ref = REFERENCE_IMAGES.find((item) => item.id === id);
      if (!ref) return;
      const request = ++restoreRequest.current;
      setPendingRestore(null);
      setProjectIssue("");
      setBusy("Opening photograph");
      try {
        const response = await fetch(ref.src);
        if (!response.ok)
          throw new Error("This reference could not be opened.");
        const blob = await response.blob();
        if (request !== restoreRequest.current) return;
        await openBlob(
          blob,
          ref.label,
          id,
          () => request === restoreRequest.current,
        );
      } catch (e) {
        if (request === restoreRequest.current)
          setError(
            e instanceof Error ? e.message : "Photo could not be opened.",
          );
      } finally {
        if (request === restoreRequest.current) setBusy("");
      }
    },
    [openBlob],
  );
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("restore") === "1")
      void restore();
    else if (REFERENCE_IMAGES[0]) void loadReference(REFERENCE_IMAGES[0].id);
    return () => {
      sourceRequest.current++;
      restoreRequest.current++;
      if (sourceUrl.current) URL.revokeObjectURL(sourceUrl.current);
    };
  }, [loadReference]);
  useEffect(() => {
    if (!source || !modeAvailable) {
      setGeometry(null);
      setRendering(false);
      return;
    }
    let stopped = false;
    setRendering(true);
    setGeometry(null);
    const id = ++renderId.current;
    const timer = setTimeout(async () => {
      try {
        const image =
          sourceImage.current?.src === source
            ? sourceImage.current
            : await loadImage(source);
        if (stopped) return;
        if (subjectMask)
          assertSubjectMaskBinding(subjectMask, {
            sourceSha256,
            crop,
            widthMm: settings.widthMm,
            heightMm: settings.heightMm,
          });
        const { canvas, pixels } = cropImage(
          image,
          crop,
          settings.widthMm / settings.heightMm,
        );
        setCroppedUrl(canvas.toDataURL("image/jpeg", 0.85));
        startTime.current = performance.now();
        const input = {
          data: pixels.data,
          width: pixels.width,
          height: pixels.height,
        };
        if (worker.current)
          worker.current.postMessage({ id, input, settings, subjectMask }, [
            pixels.data.buffer,
          ]);
        else {
          setGeometry(renderImage(input, settings, subjectMask));
          setRendering(false);
        }
      } catch (e) {
        if (!stopped) {
          setError(e instanceof Error ? e.message : "Could not render photo.");
          setRendering(false);
        }
      }
    }, 140);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [source, crop, settings, modeAvailable, subjectMask, sourceSha256]);
  useEffect(() => {
    if (!source) return;
    let stopped = false;
    // Separate debounce and capped raster keep advice off the rendering worker's critical path.
    const timer = setTimeout(async () => {
      try {
        const image =
          sourceImage.current?.src === source
            ? sourceImage.current
            : await loadImage(source);
        if (stopped) return;
        const { pixels } = cropImage(
          image,
          crop,
          settings.widthMm / settings.heightMm,
          256,
        );
        const analysis = analysePhoto(pixels, {
          sourceWidth: image.naturalWidth,
          sourceHeight: image.naturalHeight,
          crop,
          widthMm: settings.widthMm,
          heightMm: settings.heightMm,
          safeMarginMm: settings.safeMarginMm,
          faces: faceDetection,
        });
        if (!stopped) setPhotoAnalysis(analysis);
      } catch {
        if (!stopped) setPhotoAnalysis(null);
      }
    }, 260);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [
    source,
    crop,
    settings.widthMm,
    settings.heightMm,
    settings.safeMarginMm,
    faceDetection,
  ]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  async function upload(file?: File) {
    if (!file) return;
    const request = ++restoreRequest.current;
    setPendingRestore(null);
    setProjectIssue("");
    track("upload_started", { mode: settings.mode, productId });
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError(
        "Choose a JPG, PNG or WebP photo. For HEIC, export a JPEG from your photo library first.",
      );
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Please choose a photograph smaller than 8 MB.");
      return;
    }
    setBusy("Opening your photo");
    try {
      if (
        !(await openBlob(
          file,
          file.name,
          null,
          () => request === restoreRequest.current,
        ))
      )
        return;
      track("upload_completed", { mode: settings.mode, productId });
      setPanel("photo");
    } catch (e) {
      if (request === restoreRequest.current)
        setError(
          e instanceof Error ? e.message : "The image could not be opened.",
        );
    } finally {
      if (request === restoreRequest.current) setBusy("");
    }
  }
  async function save() {
    if (!sourceBlob) return;
    if (!geometry || rendering) {
      setProjectIssue("Wait for a valid preview before saving this design.");
      return;
    }
    if (reviewRequired || pendingRestore || !productId || !finishId) {
      setProjectIssue(
        "Review the current canvas size and finish before replacing your saved design.",
      );
      return;
    }
    try {
      await saveLocalProject({
        id: "current",
        name: sourceName,
        updatedAt: new Date().toISOString(),
        image: sourceBlob,
        settings,
        subjectMask,
        crop,
        productId,
        finishId,
        referenceId,
        rendererVersion: RENDERER_VERSION,
      });
      setSaved(true);
      setNotice("Saved on this device. Your photograph has not been uploaded.");
    } catch {
      setError(
        "This browser could not save your design. Download a project package to keep a copy.",
      );
    }
  }
  async function restore() {
    const request = ++restoreRequest.current;
    selectionOrigin.current = "restore";
    setBusy("Opening saved design");
    setProjectIssue("");
    setPendingRestore(null);
    try {
      const savedProject = await getLocalProject();
      if (request !== restoreRequest.current) return;
      if (!savedProject) {
        setNotice("No saved design on this device yet.");
        return;
      }
      const { project, needsRendererReview } = validateRestorableProject(
        savedProject,
        availableModes,
      );
      if (needsRendererReview) {
        setPendingRestore(project);
        return;
      }
      await openRestoredProject(project, request);
    } catch (e) {
      if (request === restoreRequest.current)
        setProjectIssue(
          e instanceof Error
            ? e.message
            : "Your saved design could not be opened. The saved original is unchanged.",
        );
    } finally {
      if (request === restoreRequest.current) setBusy("");
    }
  }
  async function openRestoredProject(
    project: RestorableProject,
    request: number,
  ) {
    if (request !== restoreRequest.current) return;
    if (project.subjectMask)
      assertSubjectMaskBinding(project.subjectMask, {
        sourceSha256: await hashBlob(project.image),
        crop: project.crop,
        widthMm: project.settings.widthMm,
        heightMm: project.settings.heightMm,
      });
    if (request !== restoreRequest.current) return;
    const refId = REFERENCE_IMAGES.some((ref) => ref.id === project.referenceId)
      ? (project.referenceId ?? null)
      : null;
    if (
      !(await openBlob(
        project.image,
        project.name,
        refId,
        () => request === restoreRequest.current,
      )) ||
      request !== restoreRequest.current
    )
      return;
    setInkId(
      INKS.find(
        (i) =>
          i.color.toLowerCase() === project.settings.inkColor.toLowerCase(),
      )?.id ?? "black",
    );
    setSettings(project.settings);
    setSubjectMask(project.subjectMask);
    setCrop(project.crop);
    setProductId(project.productId);
    setFinishId(project.finishId);
    setRestoredSelection({
      productId: project.productId,
      finishId: project.finishId,
      settings: project.settings,
    });
    setCatalogueReviewed(false);
    setPendingRestore(null);
    setSaved(project.rendererVersion === RENDERER_VERSION);
    setNotice(
      "Your design is open for review. The saved original is unchanged.",
    );
  }
  async function rebuildSavedProject() {
    if (!pendingRestore) return;
    const request = ++restoreRequest.current;
    setBusy("Rebuilding saved design");
    try {
      await openRestoredProject(pendingRestore, request);
    } catch (e) {
      if (request === restoreRequest.current)
        setProjectIssue(
          e instanceof Error
            ? e.message
            : "The saved photo could not be opened.",
        );
    } finally {
      if (request === restoreRequest.current) setBusy("");
    }
  }
  async function remove() {
    try {
      await deleteLocalProject();
      setSaved(false);
      setNotice("Saved design removed from this device.");
    } catch {
      setProjectIssue(
        "Device storage is blocked or unavailable. The saved design could not be removed; close other studio tabs and try again.",
      );
    }
  }
  async function exportFile(format: "svg" | "png" | "pdf" | "package") {
    if (!geometry) return;
    setBusy(`Preparing ${format.toUpperCase()}`);
    try {
      await exportArtwork(
        geometry,
        format,
        view === "template" ? "template" : "finished",
        sourceBlob ?? undefined,
        crop,
        subjectMask,
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Export could not be completed.",
      );
    } finally {
      setBusy("");
    }
  }
  function selectProduct(id: string) {
    if (subjectMask) {
      setError(
        "Clear the manual subject selection before changing the canvas size.",
      );
      return;
    }
    const p = products.find((p) => p.id === id);
    if (!p) return;
    setProductId(id);
    track("product_size_selected", { mode: settings.mode, productId: id });
    update(productDimensions(p, settings));
  }
  function choosePreset(key: keyof typeof PRESET_NAMES) {
    setPreset(key);
    track("preset_selected", { mode: settings.mode, productId, preset: key });
    update({
      ...PRESETS[key],
      ...(settings.mode === "cross-stitch" ? CROSS_STITCH_PRESETS[key] : {}),
      detailPreservation: 0,
      guideColor: undefined,
    });
  }
  function choosePublishedPreset(preset: PublishedPreset) {
    try {
      update(applyStudioPreset(settings, preset));
      track("preset_selected", { mode: settings.mode, productId });
      setNotice(
        `${preset.name}, version ${preset.version}, applied. Size, crop, lettering and ink are unchanged.`,
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "This preset cannot be applied to the current design.",
      );
    }
  }
  function savePreset() {
    const name = window.prompt("Name this renderer preset");
    if (!name?.trim()) return;
    const next = [
      ...customPresets,
      {
        name: name.trim().slice(0, 40),
        settings: {
          ...DEFAULT_SETTINGS,
          mode: settings.mode,
          ...presetSettings(settings),
        },
      },
    ].slice(-12);
    try {
      localStorage.setItem("sr-presets", JSON.stringify(next));
      setCustomPresets(next);
      setNotice("Preset saved on this device.");
    } catch {
      setProjectIssue(
        "Device storage is blocked or full. This preset was not saved.",
      );
    }
  }
  async function copyPresetSettings() {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(presetSettings(settings), null, 2),
      );
      setNotice(
        "Renderer settings copied. Paste them into the admin preset editor for review.",
      );
    } catch {
      setProjectIssue(
        "Clipboard access is unavailable. Allow clipboard access and try copying the preset settings again.",
      );
    }
  }
  async function reviewKit() {
    if (!modeAvailable || !kitAvailable) {
      setError(
        "Choose an available style, size and finish before reviewing your kit.",
      );
      return;
    }
    if (!sourceBlob || !geometry) return;
    if (!rights && !referenceId) {
      setError("Please confirm you have permission to use this photograph.");
      return;
    }
    try {
      await saveLocalProject({
        id: "basket",
        name: sourceName,
        updatedAt: new Date().toISOString(),
        image: sourceBlob,
        settings,
        subjectMask,
        crop,
        productId,
        finishId,
        referenceId,
        rendererVersion: RENDERER_VERSION,
      });
      localStorage.setItem(
        "sr-basket",
        JSON.stringify({
          productId,
          finishId,
          inkId,
          sourceName,
          reference: !!referenceId,
          updatedAt: new Date().toISOString(),
        }),
      );
      track("add_to_basket", {
        mode: settings.mode,
        productId,
        step: "basket",
      });
      window.location.href = "/basket";
    } catch {
      setError(
        "This browser could not keep the design for review. Allow local storage or download a project package from the lab.",
      );
    }
  }
  const activePreset =
    (settings.detailPreservation ?? 0) === 0 &&
    settings.guideColor === undefined
      ? (Object.entries(PRESETS).find(([name, p]) =>
          Object.entries({
            ...p,
            ...(settings.mode === "cross-stitch"
              ? CROSS_STITCH_PRESETS[name as keyof typeof CROSS_STITCH_PRESETS]
              : {}),
          }).every(
            ([key, value]) => settings[key as keyof RenderSettings] === value,
          ),
        )?.[0] ?? "custom")
      : "custom";
  const templateView = view === "template";
  const svg = useMemo(
    () =>
      geometry
        ? toSvg(geometry, templateView ? "template" : "finished", {
            includeSafeArea: safeArea,
          })
        : "",
    [geometry, templateView, safeArea],
  );
  const currentRef = REFERENCE_IMAGES.find((r) => r.id === referenceId);
  function clearSubjectSelection() {
    setSubjectMask(undefined);
    update({ subjectMaskStrength: 0 });
    setNotice(
      "Manual subject selection cleared. You can change the crop and canvas size.",
    );
  }
  const selectionLockNotice = subjectMask ? (
    <div className="photo-advice">
      <div>
        <p>
          Your manual selection is tied to this photograph, crop and canvas
          size. Clear it before changing the composition.
        </p>
        <button className="text-button" onClick={clearSubjectSelection}>
          Clear manual selection
        </button>
      </div>
    </div>
  ) : null;
  const artworkPreview = (
    <div
      className="canvas-paper"
      style={
        {
          aspectRatio: `${settings.widthMm}/${settings.heightMm}`,
          "--art-ratio": settings.widthMm / settings.heightMm,
        } as CSSProperties
      }
    >
      {view === "original" && croppedUrl ? (
        <img
          className="artwork-image"
          src={croppedUrl}
          alt={`Cropped original: ${sourceName}`}
        />
      ) : geometry ? (
        <ArtworkPreview svg={svg} finished={!templateView} />
      ) : (
        <div className="canvas-placeholder">
          <Layers size={32} />
          <p>
            {source
              ? "Finding the picture in the dots…"
              : "A photograph. A little possibility."}
          </p>
          <button className="button" onClick={() => fileInput.current?.click()}>
            Choose a photo
          </button>
        </div>
      )}
      {view === "compare" && croppedUrl && geometry && (
        <>
          <img
            className="comparison-image"
            src={croppedUrl}
            alt="Original photograph for comparison"
            style={{ clipPath: `inset(0 ${100 - compare}% 0 0)` }}
          />
          <div className="comparison-divider" style={{ left: `${compare}%` }}>
            <span>↔</span>
          </div>
          <span className="compare-label left">Original</span>
          <span className="compare-label right">Finished</span>
        </>
      )}
      {(rendering || busy) && (
        <div className="render-indicator" role="status">
          <LoaderCircle size={16} className="spin" />
          {busy || "Rendering"}
        </div>
      )}
    </div>
  );
  const artworkCaption = (
    <>
      {settings.widthMm / 10} × {settings.heightMm / 10} cm ·{" "}
      {view === "template"
        ? "Your printed guide"
        : view === "original"
          ? "Your starting point"
          : "Your finished canvas"}
    </>
  );
  const magnifiedPreview = (
    <PreviewViewport
      aspectRatio={settings.widthMm / settings.heightMm}
      caption={artworkCaption}
      enabled={!!geometry || !!croppedUrl}
      resetKey={`${sourceSha256}:${settings.widthMm}:${settings.heightMm}`}
      comparison={
        view === "compare"
          ? { value: compare, onChange: setCompare }
          : undefined
      }
    >
      {artworkPreview}
    </PreviewViewport>
  );

  return (
    <div className="studio-page">
      <SiteHeader studio />
      <PreviewDialog
        open={zoomPreview}
        title={`Enlarged ${view} preview`}
        onClose={() => setZoomPreview(false)}
      >
        <div
          className="preview-dialog-views"
          role="group"
          aria-label="Enlarged preview type"
        >
          {(["original", "finished", "template", "compare"] as View[]).map(
            (v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
              >
                {v[0].toUpperCase() + v.slice(1)}
              </button>
            ),
          )}
        </div>
        {magnifiedPreview}
      </PreviewDialog>
      <PreviewDialog
        open={maskEditorOpen}
        title="Paint your subject selection"
        closeLabel="Close selection editor"
        onClose={() => setMaskEditorOpen(false)}
      >
        {croppedUrl && sourceSha256 && (
          <SubjectMaskEditor
            sourceUrl={croppedUrl}
            binding={{
              sourceSha256,
              crop,
              widthMm: settings.widthMm,
              heightMm: settings.heightMm,
            }}
            value={subjectMask}
            onClose={() => setMaskEditorOpen(false)}
            onApply={(mask) => {
              try {
                assertSubjectMaskBinding(mask, {
                  sourceSha256,
                  crop,
                  widthMm: settings.widthMm,
                  heightMm: settings.heightMm,
                });
                setSubjectMask(mask);
                update({
                  subjectMaskStrength: subjectMask
                    ? (settings.subjectMaskStrength ?? 1)
                    : 1,
                });
                setMaskEditorOpen(false);
                setNotice(
                  "Manual selection applied. Check the finished and template previews.",
                );
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "The selection could not be applied.",
                );
              }
            }}
          />
        )}
      </PreviewDialog>
      <div className="studio-topline">
        <div>
          <span className="eyebrow">
            {lab ? "The rendering lab" : "Your creative corner"}
          </span>
          <h1>
            {lab
              ? MODES.find((m) => m.id === settings.mode)?.name
              : "Make something meaningful"}
            <span className="heading-dot">.</span>
          </h1>
        </div>
        <div className="studio-top-actions">
          <button className="text-button" onClick={restore} disabled={!!busy}>
            Open saved design
          </button>
          <button
            className="button light small"
            onClick={save}
            disabled={
              !source ||
              !geometry ||
              rendering ||
              !!busy ||
              reviewRequired ||
              !!pendingRestore ||
              !productId ||
              !finishId
            }
          >
            {saved ? <Check size={16} /> : <Save size={16} />}{" "}
            {saved ? "Saved" : "Save design"}
          </button>
        </div>
      </div>
      {catalogueStatus !== "ready" && (
        <div className="render-warnings" role="status">
          <p>
            {catalogueStatus === "loading"
              ? "Loading current canvas sizes, finishes and prices…"
              : `${catalogueError} You can continue adjusting the preview; kit prices and review are unavailable until the catalogue loads.`}
          </p>
          {catalogueStatus === "error" && (
            <button
              className="button light small"
              onClick={() => setCatalogueAttempt((n) => n + 1)}
            >
              Retry catalogue
            </button>
          )}
        </div>
      )}
      {catalogueStatus === "ready" &&
        (!products.length || !finishes.length) && (
          <div className="render-warnings" role="status">
            <p>
              {!products.length
                ? "No canvas sizes are currently available. "
                : ""}
              {!finishes.length ? "No finishes are currently available. " : ""}
              Your photograph and preview can still be edited. Kit review is
              unavailable.
            </p>
            <button
              className="button light small"
              onClick={() => setCatalogueAttempt((n) => n + 1)}
            >
              Refresh catalogue
            </button>
          </div>
        )}
      {projectIssue && (
        <div className="render-warnings" role="alert">
          <p>{projectIssue}</p>
          <button className="text-button" onClick={() => setProjectIssue("")}>
            Dismiss
          </button>
        </div>
      )}
      {pendingRestore && (
        <div className="render-warnings" role="status">
          <p>
            This design was saved with{" "}
            {pendingRestore.rendererVersion
              ? "a different renderer version"
              : "an earlier renderer without version information"}
            . Rebuilding may change the artwork. Your saved original stays
            untouched until you review and save the rebuilt design.
          </p>
          <button
            className="button light small"
            onClick={rebuildSavedProject}
            disabled={!!busy}
          >
            Rebuild saved design
          </button>{" "}
          <button
            className="text-button"
            onClick={() => setPendingRestore(null)}
            disabled={!!busy}
          >
            Keep current design
          </button>
        </div>
      )}
      {reviewRequired && (
        <div className="render-warnings" role="status">
          <p>
            Your saved design is open for review. Check the current size, finish
            and price, then inspect the finished and template views. The saved
            original has not been overwritten.
          </p>
          {originalSelection?.messages.map((message) => (
            <p key={message}>{message}</p>
          ))}
          <button className="text-button" onClick={() => setPanel("finish")}>
            Review size and finish <ArrowRight size={15} />
          </button>
        </div>
      )}
      <main className="studio-layout">
        <section className="preview-panel" aria-label="Artwork preview">
          <div className="preview-toolbar">
            <div className="view-tabs" role="tablist" aria-label="Preview type">
              {(["original", "finished", "template", "compare"] as View[]).map(
                (v) => (
                  <button
                    key={v}
                    role="tab"
                    id={`preview-tab-${v}`}
                    aria-controls="artwork-preview"
                    tabIndex={view === v ? 0 : -1}
                    aria-selected={view === v}
                    onClick={() => setView(v)}
                    onKeyDown={(e) => {
                      const allViews: View[] = [
                        "original",
                        "finished",
                        "template",
                        "compare",
                      ];
                      const direction =
                        e.key === "ArrowRight"
                          ? 1
                          : e.key === "ArrowLeft"
                            ? -1
                            : 0;
                      if (!direction && e.key !== "Home" && e.key !== "End")
                        return;
                      e.preventDefault();
                      const next =
                        e.key === "Home"
                          ? "original"
                          : e.key === "End"
                            ? "compare"
                            : allViews[
                                (allViews.indexOf(v) +
                                  direction +
                                  allViews.length) %
                                  allViews.length
                              ];
                      setView(next);
                      document.getElementById(`preview-tab-${next}`)?.focus();
                    }}
                  >
                    {v === "compare"
                      ? "Compare"
                      : v[0].toUpperCase() + v.slice(1)}
                  </button>
                ),
              )}
            </div>
            <button
              className="icon-button"
              title="Upload your photograph"
              aria-label="Upload your photograph"
              onClick={() => fileInput.current?.click()}
            >
              <ImagePlus size={18} />
            </button>
            <button
              className="icon-button"
              title="Enlarge preview"
              aria-label="Enlarge preview"
              disabled={!geometry && !croppedUrl}
              onClick={() => setZoomPreview(true)}
            >
              <Maximize size={17} />
            </button>
          </div>
          <div
            id="artwork-preview"
            role="tabpanel"
            aria-labelledby={`preview-tab-${view}`}
            className={`preview-stage ${dragging ? "dragging" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void upload(e.dataTransfer.files[0]);
            }}
          >
            {magnifiedPreview}
          </div>
          <div className="preview-bottom">
            <span>
              <span className="status-dot" />
              {rendering ? "Updating your canvas" : "Made from your photograph"}
            </span>
            <label className="check-label">
              <input
                type="checkbox"
                checked={safeArea}
                onChange={(e) => setSafeArea(e.target.checked)}
              />
              Show safe area
            </label>
          </div>
          <div className="artwork-stats">
            <div>
              <strong>
                {geometry?.stats.markCount.toLocaleString() ?? "—"}
              </strong>
              <span>
                {settings.mode === "dots"
                  ? "individual dots"
                  : "individual marks"}
              </span>
            </div>
            <div>
              <strong>
                {geometry
                  ? `${Math.max(1, Math.round(geometry.stats.estimatedCompletionMinutes / 60))}–${Math.max(2, Math.ceil((geometry.stats.estimatedCompletionMinutes / 60) * 1.4))} hrs`
                  : "—"}
              </strong>
              <span>estimated making time*</span>
            </div>
            <div>
              <strong>{lab ? `${renderMs} ms` : "A little each day"}</strong>
              <span>
                {lab ? "last preview render" : "make it at your own pace"}
              </span>
            </div>
          </div>
          <p className="fine-print">
            *Making time is an uncalibrated estimate. Preview colours and
            printed guides need physical sample testing.
          </p>
          <div className="reference-section">
            <div className="section-title">
              <h2>Find a little inspiration</h2>
              <span>Try a reference photograph</span>
            </div>
            <div className="reference-strip">
              {REFERENCE_IMAGES.map((ref) => (
                <button
                  key={ref.id}
                  className={`reference-tile ${referenceId === ref.id ? "selected" : ""}`}
                  aria-pressed={referenceId === ref.id}
                  onClick={() => loadReference(ref.id)}
                  disabled={!!busy}
                >
                  <img src={ref.src} alt={ref.alt} />
                  <span>{ref.label}</span>
                </button>
              ))}
            </div>
            {currentRef && (
              <p className="reference-credit">
                Reference photo:{" "}
                <a href={currentRef.source} target="_blank" rel="noreferrer">
                  {currentRef.credit}
                </a>
                . For renderer exploration; not a completed customer canvas.
              </p>
            )}
          </div>
        </section>
        <aside className="controls-panel">
          <div className="control-tabs" role="group" aria-label="Design steps">
            {["photo", "style", "finish"].map((p, i) => (
              <button
                key={p}
                className={panel === p ? "active" : ""}
                aria-current={panel === p ? "step" : undefined}
                onClick={() => setPanel(p)}
              >
                <span>0{i + 1}</span>
                {p === "finish"
                  ? "Your canvas"
                  : p[0].toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
          {panel === "photo" && (
            <div className="control-content">
              <div className="control-heading">
                <span className="eyebrow">It begins with a photograph</span>
                <h2>One worth keeping.</h2>
                <p>
                  Faces, favourite places, the dog who never sits still. Make it
                  personal.
                </p>
              </div>
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={(e) => {
                  void upload(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <button
                className="upload-drop"
                onClick={() => fileInput.current?.click()}
              >
                <ImagePlus size={25} />
                <strong>Upload your photograph</strong>
                <span>JPG, PNG or WebP · Up to 8 MB</span>
              </button>
              <p className="privacy-note">
                Your photo stays in this browser until you choose to save it for
                checkout.
              </p>
              <div className="control-divider" />
              <div className="section-title">
                <h3>Find your composition</h3>
                <button
                  className="icon-button"
                  aria-label="Reset crop"
                  disabled={!!subjectMask}
                  onClick={() => {
                    setCrop(DEFAULT_CROP);
                    setSaved(false);
                  }}
                >
                  <RotateCcw size={16} />
                </button>
              </div>
              <Range
                label="Zoom"
                disabled={!!subjectMask}
                value={crop.zoom}
                min={1}
                max={3}
                step={0.01}
                suffix="×"
                onChange={(v) => {
                  setSaved(false);
                  setCrop((c) => ({ ...c, zoom: v }));
                }}
              />
              <Range
                label="Horizontal position"
                disabled={!!subjectMask}
                value={crop.x}
                min={-1}
                max={1}
                step={0.01}
                onChange={(v) => {
                  setSaved(false);
                  setCrop((c) => ({ ...c, x: v }));
                }}
              />
              <Range
                label="Vertical position"
                disabled={!!subjectMask}
                value={crop.y}
                min={-1}
                max={1}
                step={0.01}
                onChange={(v) => {
                  setSaved(false);
                  setCrop((c) => ({ ...c, y: v }));
                }}
              />
              <button
                className="button light full"
                disabled={!!subjectMask}
                onClick={() => {
                  setCrop((c) => ({ ...c, rotation: (c.rotation + 90) % 360 }));
                  setSaved(false);
                }}
              >
                <RotateCcw size={16} />
                Rotate 90°
              </button>
              {selectionLockNotice}
              <div className="photo-advice">
                <Sparkles size={18} />
                <div>
                  <strong>Photo and crop check</strong>
                  {photoAnalysis ? (
                    <>
                      {photoAnalysis.advice.slice(0, 3).map((advice) => (
                        <p key={advice.id}>{advice.message}</p>
                      ))}
                      <details>
                        <summary
                          style={{
                            cursor: "pointer",
                            fontSize: 11,
                            marginTop: 10,
                          }}
                        >
                          More about this check
                        </summary>
                        {photoAnalysis.advice.slice(3).map((advice) => (
                          <p key={advice.id}>{advice.message}</p>
                        ))}
                        <p>
                          Retained source:{" "}
                          {photoAnalysis.metrics.retainedWidthPixels} ×{" "}
                          {photoAnalysis.metrics.retainedHeightPixels} pixels ·
                          about{" "}
                          {Math.round(
                            photoAnalysis.metrics.retainedSourceFraction * 100,
                          )}
                          % of the original area.
                        </p>
                        <p>
                          {photoAnalysis.faces.status === "available"
                            ? photoAnalysis.faces.detectedCount
                              ? `The browser found ${photoAnalysis.faces.detectedCount} possible face${photoAnalysis.faces.detectedCount === 1 ? "" : "s"} in the source. This detector can miss faces or make mistakes; check the crop yourself.`
                              : "The browser did not detect a face. Faces may still be present; check the crop yourself."
                            : photoAnalysis.faces.status === "checking"
                              ? "Checking whether this browser can detect faces…"
                              : "Face detection is unavailable in this browser. Face count and subject identity have not been assessed; check faces manually."}
                        </p>
                        <p>
                          Analysed on this device. Contrast and edge patterns
                          suggest areas to inspect; they do not identify your
                          subject. Advice never prevents you continuing.
                        </p>
                      </details>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => {
                          setSafeArea(true);
                          setView("finished");
                        }}
                      >
                        Show the safe-area guide
                      </button>
                    </>
                  ) : (
                    <p>
                      {source
                        ? "Checking this crop locally…"
                        : "Add a photo for local resolution, tone and composition advice."}
                    </p>
                  )}
                </div>
              </div>
              <label className="check-label rights">
                <input
                  type="checkbox"
                  checked={rights}
                  onChange={(e) => setRights(e.target.checked)}
                />
                I have permission to use this photograph.
              </label>
              <button
                className="button full"
                onClick={() => {
                  track("crop_completed", { mode: settings.mode, productId });
                  setPanel("style");
                }}
              >
                Choose your style
                <ArrowRight size={17} />
              </button>
            </div>
          )}
          {panel === "style" && (
            <div className="control-content">
              <div className="control-heading">
                <span className="eyebrow">A different way to see it</span>
                <h2>{MODES.find((m) => m.id === settings.mode)?.name}</h2>
                <p>Watch something familiar become something you make.</p>
              </div>
              {modeOptions.length > 1 && (
                <div
                  className="mode-picker"
                  role="group"
                  aria-label="Artwork style"
                >
                  {modeOptions.map((m) => (
                    <button
                      key={m.id}
                      disabled={!!subjectMask && m.id !== settings.mode}
                      className={settings.mode === m.id ? "selected" : ""}
                      aria-pressed={settings.mode === m.id}
                      onClick={() => {
                        track("renderer_selected", { mode: m.id, productId });
                        update({
                          mode: m.id,
                          ...(isOpticalMode(m.id) || m.id === "cross-stitch"
                            ? {
                                palette: isOpticalMode(settings.mode)
                                  ? (settings.palette ??
                                    getMarkerPalette(
                                      DEFAULT_MARKER_PROFILE_ID,
                                      16,
                                    ))
                                  : getMarkerPalette(
                                      DEFAULT_MARKER_PROFILE_ID,
                                      16,
                                    ),
                                invert: false,
                              }
                            : m.id === "fibonacci" &&
                                settings.mode !== "fibonacci"
                              ? {
                                  palette: isOpticalMode(settings.mode)
                                    ? settings.palette
                                    : undefined,
                                  invert: false,
                                }
                              : {}),
                          ...(m.id === "cross-stitch" &&
                          settings.mode !== "cross-stitch"
                            ? CROSS_STITCH_PRESETS.standard
                            : {}),
                        });
                      }}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              )}
              {!modeAvailable && (
                <div className="inline-warning">
                  This mode is currently unavailable. Choose an available mode
                  to continue; saved projects remain unchanged.
                </div>
              )}
              {settings.mode !== "dots" && (
                <div className="inline-warning">
                  Experimental study. Explore previews and prototype templates;
                  physical kits are not yet approved for sale.
                </div>
              )}
              {settings.mode === "fibonacci" && (
                <p className="fine-print">
                  {settings.palette
                    ? "Follow the sunflower spirals, filling each numbered dot with its matching pen. Step back to see the colours blend. Keep the white gaps."
                    : "Follow the sunflower spirals, filling each circle with one ink. Larger dots create shadows; smaller dots reveal the light. Keep the spaces between them."}
                </p>
              )}
              {settings.mode === "cross-stitch" && (
                <p className="fine-print">
                  Every guide cross has the same size and position. Fill two
                  short diagonal strokes in its numbered colour; 0 means leave
                  blank. The numbers may still hint at the picture. This is a
                  prototype, with concealment and marker readability awaiting
                  physical trials.
                </p>
              )}
              {settings.mode === "dots" && (lab || subjectMask) && (
                <div className="subject-selection-controls">
                  <h3>Manual subject selection</h3>
                  <p className="fine-print">
                    Paint the area to keep, then soften the background with
                    strength. This selection is made by you and stays on this
                    device until you save privately for checkout.
                  </p>
                  <button
                    className="button light full"
                    disabled={
                      !geometry ||
                      rendering ||
                      !!busy ||
                      !croppedUrl ||
                      !sourceSha256
                    }
                    onClick={() => setMaskEditorOpen(true)}
                  >
                    {subjectMask
                      ? "Edit subject selection"
                      : "Paint subject selection"}
                  </button>
                  {subjectMask && (
                    <>
                      <Range
                        label="Subject mask strength"
                        min={0}
                        max={1}
                        step={0.05}
                        value={settings.subjectMaskStrength ?? 0}
                        onChange={(subjectMaskStrength) =>
                          update({ subjectMaskStrength })
                        }
                      />
                      <p className="fine-print">
                        0 keeps the whole photograph; 1 removes marks outside
                        your selection.
                      </p>
                      <button
                        className="text-button"
                        onClick={clearSubjectSelection}
                      >
                        Clear manual selection
                      </button>
                    </>
                  )}
                  <div className="control-divider" />
                </div>
              )}
              {(settings.mode === "mosaic" ||
                settings.mode === "cross-stitch" ||
                isOpticalMode(settings.mode) ||
                settings.mode === "fibonacci") && (
                <>
                  {settings.mode === "mosaic" && (
                    <label className="select-field">
                      Cell shape
                      <select
                        value={settings.cellShape ?? "rounded"}
                        onChange={(e) =>
                          update({
                            cellShape: e.target.value as
                              "square" | "rounded" | "hexagon",
                          })
                        }
                      >
                        <option value="rounded">Rounded squares</option>
                        <option value="square">Squares</option>
                        <option value="hexagon">Hexagons</option>
                      </select>
                    </label>
                  )}
                  {isOpticalMode(settings.mode) && (
                    <p className="fine-print">
                      {settings.mode === "colour-blend"
                        ? "Fill the numbered dots"
                        : "Fill the short numbered dashes"}{" "}
                      one colour at a time. Step back to see neighbouring
                      colours blend. Leave the white gaps unmarked.
                    </p>
                  )}
                  <label className="select-field">
                    {settings.mode === "mosaic"
                      ? "Mosaic colour style"
                      : "Marker palette"}
                    <select
                      value={
                        markerProfile
                          ? `${markerProfile.profile.id}:${markerProfile.count}`
                          : prototypePaletteCount
                            ? String(prototypePaletteCount)
                            : settings.palette
                              ? "saved"
                              : "1"
                      }
                      onChange={(e) => {
                        const selected = e.target.value;
                        if (selected === "saved") return;
                        const [profileId, count] = selected.split(":");
                        const n = Number(count ?? selected);
                        update({
                          palette:
                            n === 1
                              ? undefined
                              : count
                                ? getMarkerPalette(profileId, n as 16 | 32)
                                : (settings.mode === "mosaic"
                                    ? MOSAIC_MARKER_PALETTE
                                    : OPTICAL_MARKER_PALETTE
                                  ).slice(0, n),
                          ...((settings.mode === "fibonacci" && n > 1) ||
                          settings.mode === "cross-stitch"
                            ? { invert: false }
                            : {}),
                        });
                      }}
                    >
                      {!isOpticalMode(settings.mode) &&
                        settings.mode !== "cross-stitch" && (
                          <option value="1">Monochrome — one ink</option>
                        )}
                      {settings.mode === "mosaic" && (
                        <>
                          <option value="2">Two colours</option>
                          <option value="4">Four colours</option>
                          <option value="6">Six colours</option>
                        </>
                      )}
                      <option value="8">
                        Eight colours — prototype palette
                      </option>
                      {MARKER_PALETTE_PROFILES.flatMap((profile) =>
                        ([16, 32] as const).map((count) => (
                          <option
                            key={`${profile.id}:${count}`}
                            value={`${profile.id}:${count}`}
                          >
                            {profile.label} · {count} colours
                          </option>
                        )),
                      )}
                      {settings.palette &&
                        !markerProfile &&
                        !prototypePaletteCount && (
                          <option value="saved">
                            {settings.palette.length} colours — saved/custom
                            palette
                          </option>
                        )}
                    </select>
                  </label>
                  {settings.mode === "mosaic" && !settings.palette && (
                    <p className="fine-print">
                      One ink, with tile sizes creating light and shade. Select
                      a numbered colour palette for coloured tiles.
                    </p>
                  )}
                  {settings.palette && (
                    <>
                      {markerProfile && (
                        <p className="fine-print">
                          {markerProfile.profile.label}. Keys below include the
                          manufacturer pen codes.{" "}
                          {markerProfile.profile.disclaimer}{" "}
                          <a
                            href={markerProfile.profile.productUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View marker set
                          </a>
                        </p>
                      )}
                      <ol
                        className="mosaic-colour-key"
                        aria-label={
                          settings.mode === "mosaic"
                            ? "Mosaic colour key"
                            : "Marker colour key"
                        }
                      >
                        {settings.palette.map((colour, index) => (
                          <li
                            key={colour}
                            title={
                              markerProfile
                                ? `Pen ${markerProfile.profile.colours[index].code}: ${markerProfile.profile.colours[index].label} · ${colour} (digital approximation)`
                                : colour
                            }
                            aria-label={`Colour ${index + 1}: ${colour}${markerProfile ? `; pen ${markerProfile.profile.colours[index].code}; ${markerProfile.profile.colours[index].label}` : ""}`}
                          >
                            <span
                              className="mosaic-colour-chip"
                              style={{ backgroundColor: colour }}
                              aria-hidden="true"
                            />
                            <span>
                              {index + 1}
                              {markerProfile
                                ? ` · ${markerProfile.profile.colours[index].code}`
                                : ""}
                            </span>
                          </li>
                        ))}
                      </ol>
                      <p className="fine-print">
                        {settings.mode === "cross-stitch"
                          ? "Match 1 and above to this colour key. Crosses marked 0 stay blank; no white pen is required."
                          : "Match each template number to this colour key. Blank canvas stays unmarked."}
                      </p>
                    </>
                  )}
                </>
              )}
              <h3 className="field-heading">How would you like to make it?</h3>
              {presetsStatus === "loading" && (
                <p className="fine-print" role="status">
                  Loading studio presets. Built-in choices are ready below.
                </p>
              )}
              {presetsStatus === "error" && (
                <p className="fine-print" role="status">
                  Studio presets could not be loaded. Built-in choices are still
                  available.
                </p>
              )}
              {publishedPresets.length > 0 && (
                <>
                  <div className="preset-grid">
                    {publishedPresets.map((p) => (
                      <button
                        key={`${p.id}:${p.version}`}
                        className={`preset-card ${Object.entries(p.settings).every(([key, value]) => JSON.stringify(settings[key as keyof RenderSettings]) === JSON.stringify(value)) ? "selected" : ""}`}
                        aria-pressed={Object.entries(p.settings).every(
                          ([key, value]) =>
                            JSON.stringify(
                              settings[key as keyof RenderSettings],
                            ) === JSON.stringify(value),
                        )}
                        onClick={() => choosePublishedPreset(p)}
                      >
                        <strong>{p.name}</strong>
                        <small>{p.description}</small>
                        <small>Studio preset · version {p.version}</small>
                      </button>
                    ))}
                  </div>
                  <p className="fine-print">
                    These versioned presets apply renderer settings to your
                    design. Your canvas size, crop, lettering and ink choice
                    stay as selected.
                  </p>
                  <h3 className="field-heading">Built-in presets</h3>
                </>
              )}
              <div className="preset-grid">
                {(["easy", "standard", "detailed"] as const).map((key, i) => (
                  <button
                    key={key}
                    className={`preset-card ${activePreset === key ? "selected" : ""}`}
                    aria-pressed={activePreset === key}
                    onClick={() => choosePreset(key)}
                  >
                    <span
                      className={`dot-swatch density-${i}`}
                      aria-hidden="true"
                    />
                    <strong>{PRESET_NAMES[key]}</strong>
                    <small>
                      {i === 0
                        ? "A gentle starting point"
                        : i === 1
                          ? "More of the little details"
                          : "Our finest detail"}
                    </small>
                    {activePreset === key && <Check size={14} />}
                  </button>
                ))}
              </div>
              <div className="small-presets">
                {(["bold", "portrait"] as const).map((key) => (
                  <button
                    className={activePreset === key ? "selected" : ""}
                    aria-pressed={activePreset === key}
                    key={key}
                    onClick={() => choosePreset(key)}
                  >
                    {PRESET_NAMES[key]}
                  </button>
                ))}
              </div>
              <div className="control-divider" />
              <h3 className="field-heading">
                {usesOpticalColour(settings) || settings.mode === "cross-stitch"
                  ? "Lettering and guide colour"
                  : "A colour that feels like you"}
              </h3>
              <div
                className="ink-choices"
                role="group"
                aria-label="Marker colour"
              >
                {INKS.map((ink) => (
                  <button
                    key={ink.id}
                    className={inkId === ink.id ? "selected" : ""}
                    aria-pressed={inkId === ink.id}
                    onClick={() => {
                      setInkId(ink.id);
                      update({ inkColor: ink.color });
                    }}
                    aria-label={ink.label}
                    title={ink.label}
                  >
                    <span style={{ background: ink.color }}>
                      {inkId === ink.id && <Check size={13} />}
                    </span>
                    <small>{ink.label}</small>
                  </button>
                ))}
              </div>
              <div className="control-divider" />
              <details className="tuning" open={lab || undefined}>
                <summary>
                  <SlidersHorizontal size={16} />
                  Fine-tune your image
                  <ChevronDown size={15} />
                </summary>
                <Range
                  label="Contrast"
                  min={0.5}
                  max={2}
                  step={0.01}
                  value={settings.contrast}
                  onChange={(contrast) => update({ contrast })}
                />
                <Range
                  label="Brightness"
                  min={-0.4}
                  max={0.4}
                  step={0.02}
                  value={settings.brightness}
                  onChange={(brightness) => update({ brightness })}
                />
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={settings.autoExposure !== false}
                    onChange={(e) => update({ autoExposure: e.target.checked })}
                  />
                  Recover shadow detail automatically
                </label>
                <Range
                  label="Gamma"
                  min={0.4}
                  max={2.2}
                  step={0.05}
                  value={settings.gamma}
                  onChange={(gamma) => update({ gamma })}
                />
                {lab && (
                  <>
                    <Range
                      label={
                        isOpticalMode(settings.mode)
                          ? "Mark spacing"
                          : "Dot spacing"
                      }
                      min={2}
                      max={10}
                      step={0.1}
                      suffix=" mm"
                      value={settings.spacingMm}
                      onChange={(spacingMm) => update({ spacingMm })}
                    />
                    <Range
                      label={
                        isOpticalMode(settings.mode)
                          ? "Minimum mark width"
                          : "Minimum diameter"
                      }
                      min={0.5}
                      max={3}
                      step={0.1}
                      suffix=" mm"
                      value={settings.minDiameterMm}
                      onChange={(minDiameterMm) => update({ minDiameterMm })}
                    />
                    <Range
                      label={
                        isOpticalMode(settings.mode)
                          ? "Maximum mark size"
                          : "Maximum diameter"
                      }
                      min={1}
                      max={8}
                      step={0.1}
                      suffix=" mm"
                      value={settings.maxDiameterMm}
                      onChange={(maxDiameterMm) => update({ maxDiameterMm })}
                    />
                    <Range
                      label="Edge emphasis"
                      min={0}
                      max={1}
                      step={0.05}
                      value={settings.edgeEmphasis}
                      onChange={(edgeEmphasis) => update({ edgeEmphasis })}
                    />
                    <Range
                      label="Density"
                      min={0.3}
                      max={1.5}
                      step={0.05}
                      value={settings.density}
                      onChange={(density) => update({ density })}
                    />
                    {settings.mode === "dots" && (
                      <>
                        <Range
                          label="Detail preservation"
                          min={0}
                          max={1}
                          step={0.05}
                          value={settings.detailPreservation ?? 0}
                          onChange={(detailPreservation) =>
                            update({ detailPreservation })
                          }
                        />
                        <p className="field-note">
                          Sample a smaller area around each dot to retain fine
                          tonal features. Higher values can also reveal grain or
                          busy backgrounds; compare both previews.
                        </p>
                      </>
                    )}
                    <Range
                      label="Highlight threshold"
                      min={0}
                      max={0.5}
                      step={0.01}
                      value={settings.threshold}
                      onChange={(threshold) => update({ threshold })}
                    />
                    <Range
                      label="Guide opacity"
                      min={0.08}
                      max={0.6}
                      step={0.02}
                      value={settings.guideOpacity}
                      onChange={(guideOpacity) => update({ guideOpacity })}
                    />
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={settings.guideColor === undefined}
                        onChange={(e) =>
                          update({
                            guideColor: e.target.checked
                              ? undefined
                              : effectiveGuideColor(settings),
                          })
                        }
                      />
                      {usesOpticalColour(settings) ||
                      settings.mode === "cross-stitch"
                        ? "Match guide to lettering colour"
                        : "Match guide to marker colour"}
                    </label>
                    {settings.guideColor !== undefined && (
                      <label className="select-field">
                        Guide colour
                        <input
                          type="color"
                          value={settings.guideColor}
                          onChange={(e) =>
                            update({ guideColor: e.target.value })
                          }
                        />
                        <span className="field-note">
                          {settings.guideColor} · Template only. Test printed
                          visibility and marker coverage.
                        </span>
                      </label>
                    )}
                    <Range
                      label="Safe margin"
                      min={0}
                      max={30}
                      step={1}
                      suffix=" mm"
                      value={settings.safeMarginMm}
                      onChange={(safeMarginMm) => update({ safeMarginMm })}
                    />
                    <Range
                      label="Guide line weight"
                      min={0.05}
                      max={0.5}
                      step={0.01}
                      suffix=" mm"
                      value={settings.guideWidthMm ?? 0.15}
                      onChange={(guideWidthMm) => update({ guideWidthMm })}
                    />
                    {!usesOpticalColour(settings) &&
                      settings.mode !== "cross-stitch" && (
                        <label className="check-label">
                          <input
                            type="checkbox"
                            checked={settings.invert}
                            onChange={(e) =>
                              update({ invert: e.target.checked })
                            }
                          />
                          Invert tones (experimental)
                        </label>
                      )}
                    <button className="text-button" onClick={savePreset}>
                      <Save size={14} />
                      Save this preset
                    </button>
                    <button
                      className="text-button"
                      onClick={copyPresetSettings}
                    >
                      Copy preset settings
                    </button>
                    {customPresets.length > 0 && (
                      <label className="select-field">
                        Your presets
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            const p = customPresets[Number(e.target.value)];
                            if (p) {
                              update({
                                palette: undefined,
                                cellShape: undefined,
                                guideColor: undefined,
                                detailPreservation: 0,
                                ...presetSettings(p.settings),
                              });
                            }
                          }}
                        >
                          <option value="" disabled>
                            Choose saved preset
                          </option>
                          {customPresets.map((p, i) => (
                            <option value={i} key={i}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </>
                )}
              </details>
              <button
                className="button full"
                onClick={() => setPanel("finish")}
              >
                Make it yours
                <ArrowRight size={17} />
              </button>
            </div>
          )}
          {panel === "finish" && (
            <div className="control-content">
              <div className="control-heading">
                <span className="eyebrow">The finishing touches</span>
                <h2>A place on your wall.</h2>
                <p>Give your photograph room to breathe.</p>
              </div>
              <label className="select-field">
                Canvas size
                <select
                  value={productId}
                  disabled={
                    !!subjectMask ||
                    catalogueStatus !== "ready" ||
                    !products.length
                  }
                  onChange={(e) => selectProduct(e.target.value)}
                >
                  {!product && (
                    <option value={productId} disabled>
                      {productId
                        ? "Saved size unavailable — choose a size"
                        : "Choose an available size"}
                    </option>
                  )}
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              {selection?.product && !selection.dimensionsMatch && (
                <button
                  className="button light small"
                  onClick={() => selectProduct(productId)}
                  disabled={!!subjectMask}
                >
                  Apply current size: {selection.dimensions!.widthMm} ×{" "}
                  {selection.dimensions!.heightMm} mm
                </button>
              )}
              <button
                className="text-button"
                disabled={!!subjectMask}
                onClick={() =>
                  update({
                    widthMm: settings.heightMm,
                    heightMm: settings.widthMm,
                  })
                }
              >
                <RotateCcw size={14} />
                Switch portrait / landscape
              </button>
              {selectionLockNotice}
              <label className="select-field">
                Finish
                <select
                  value={finishId}
                  disabled={catalogueStatus !== "ready" || !finishes.length}
                  onChange={(e) => {
                    setSaved(false);
                    setFinishId(e.target.value);
                  }}
                >
                  {!finish && (
                    <option value={finishId} disabled>
                      {finishId
                        ? "Saved finish unavailable — choose a finish"
                        : "Choose an available finish"}
                    </option>
                  )}
                  {finishes.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              {selection && !selection.ready && (
                <div role="status">
                  {selection.messages.map((message) => (
                    <p className="fine-print" key={message}>
                      {message}
                    </p>
                  ))}
                </div>
              )}
              {reviewRequired && (
                <div className="photo-advice" role="status">
                  <p>
                    Review these choices and the crop before continuing. Saving
                    after this review will replace the design stored on this
                    device.
                  </p>
                  <button
                    className="button light full"
                    disabled={!selection?.ready || rendering || !geometry}
                    onClick={() => {
                      setCatalogueReviewed(true);
                      setProjectIssue("");
                      setNotice(
                        "Current size and finish confirmed. Inspect both preview views before saving or ordering.",
                      );
                    }}
                  >
                    Use these size and finish choices
                  </button>
                </div>
              )}
              <div className="control-divider" />
              <label className="text-field">
                A few words, if you like
                <span>A name, a date, a little reminder.</span>
                <input
                  maxLength={64}
                  value={settings.text?.value ?? ""}
                  placeholder="Some things are worth slowing down for."
                  onChange={(e) =>
                    update({
                      text: { ...settings.text, value: e.target.value },
                    })
                  }
                  onBlur={() => {
                    if (settings.text?.value)
                      track("personalisation_added", {
                        mode: settings.mode,
                        productId,
                      });
                  }}
                />
              </label>
              {settings.text?.value && (
                <>
                  <label className="select-field">
                    Lettering
                    <select
                      value={settings.text.fontFamily ?? "serif"}
                      onChange={(e) =>
                        update({
                          text: {
                            ...settings.text!,
                            fontFamily: e.target.value as
                              "serif" | "sans-serif",
                          },
                        })
                      }
                    >
                      <option value="serif">Classic serif</option>
                      <option value="sans-serif">Simple sans</option>
                    </select>
                  </label>
                  <label className="select-field">
                    Placement
                    <select
                      value={settings.text.placement ?? "bottom-center"}
                      onChange={(e) =>
                        update({
                          text: {
                            ...settings.text!,
                            placement: e.target.value as
                              | "bottom-center"
                              | "bottom-left"
                              | "bottom-right"
                              | "top-center",
                          },
                        })
                      }
                    >
                      <option value="bottom-center">Bottom centre</option>
                      <option value="bottom-left">Bottom left</option>
                      <option value="bottom-right">Bottom right</option>
                      <option value="top-center">Top centre</option>
                    </select>
                  </label>
                  <Range
                    label="Letter size"
                    min={3}
                    max={8}
                    step={0.5}
                    suffix=" mm"
                    value={settings.text.sizeMm ?? 7}
                    onChange={(sizeMm) =>
                      update({ text: { ...settings.text!, sizeMm } })
                    }
                  />
                </>
              )}
              <div className="control-divider" />
              {lab ? (
                <>
                  <h3>Take it to the workbench</h3>
                  <p className="muted">
                    Exports follow your chosen view. SVG keeps every mark crisp
                    at its exact physical size.
                  </p>
                  <div className="export-grid">
                    {(["svg", "png", "pdf", "package"] as const).map(
                      (format) => (
                        <button
                          key={format}
                          className="button light"
                          disabled={!geometry || !!busy}
                          onClick={() => exportFile(format)}
                        >
                          <ArrowDownToLine size={15} />
                          {format === "package"
                            ? "Full package"
                            : format.toUpperCase()}
                        </button>
                      ),
                    )}
                  </div>
                  <p className="fine-print">
                    Artwork PDF and PNG: 150 dpi. Print at 100% scale. The full
                    package also includes a separate A4 making guide, colour key
                    and packing checklist, all drafts for physical trials.
                    Materials and instructions require review before use.
                  </p>
                  {settings.mode === "dots" && (
                    <p className="fine-print">
                      Testing a canvas and marker combination?{" "}
                      <a
                        href="/production-coupons/srs-dot-coupons.pdf"
                        download
                      >
                        Download the measured dot test sheets (PDF)
                      </a>
                      . These are unvalidated test candidates. Print at actual
                      size and measure the calibration marks before use.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div className="price-row">
                    <span>
                      Your personalised kit
                      <small>
                        {catalogue?.prototype
                          ? "Indicative prototype price"
                          : "Current catalogue price"}
                      </small>
                    </span>
                    <strong>
                      {catalogueStatus === "loading"
                        ? "Loading…"
                        : product && finish
                          ? formatPrice(
                              product.pricePence + finish.additionalPence,
                            )
                          : "Unavailable"}
                    </strong>
                  </div>
                  <p className="muted">
                    Canvas template, matching marker and a simple making guide.
                    Shipping calculated at checkout.
                  </p>
                  {!referenceId && (
                    <label className="check-label rights">
                      <input
                        type="checkbox"
                        checked={rights}
                        onChange={(e) => setRights(e.target.checked)}
                      />
                      I have permission to use this photograph.
                    </label>
                  )}
                  <button
                    className="button full"
                    onClick={reviewKit}
                    disabled={
                      !geometry || !!busy || !modeAvailable || !kitAvailable
                    }
                  >
                    Review your kit
                    <ArrowRight size={17} />
                  </button>
                  <p className="fine-print">
                    Studio preview. Orders open after physical sample approval.
                  </p>
                </>
              )}
              <button className="text-button danger" onClick={remove}>
                <Trash2 size={14} />
                Remove saved design
              </button>
            </div>
          )}
          <div className="control-footnote">
            <CircleHelp size={16} />
            <span>
              {lab
                ? "A working space for perfecting the physical experience."
                : "No account needed. Just a photograph you love."}
            </span>
          </div>
        </aside>
      </main>
      {geometry?.warnings.length ? (
        <div className="render-warnings" role="status">
          {geometry.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      ) : null}
      {error && (
        <div role="alert" className="toast error">
          <span>{error}</span>
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <X size={18} />
          </button>
        </div>
      )}
      {notice && (
        <div role="status" className="toast">
          <Check size={18} />
          <span>{notice}</span>
        </div>
      )}
      {!lab && (
        <div className="studio-lab-link">
          Curious about the process?{" "}
          <Link href="/lab/dots">
            Explore the rendering lab <ArrowRight size={14} />
          </Link>
        </div>
      )}
      {panel !== "photo" && (
        <input
          ref={fileInput}
          hidden
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => {
            void upload(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      )}
    </div>
  );
}
