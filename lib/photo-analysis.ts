/** Local, advisory image statistics. Contrast regions are not semantic subjects. */
export interface AnalysisPixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}
export interface AnalysisCrop {
  zoom: number;
  x: number;
  y: number;
  rotation: number;
}
export interface NormalizedBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface FaceDetectionResult {
  status: "checking" | "available" | "unavailable" | "failed" | "timeout";
  /** Boxes in the EXIF-oriented source, normalized to 0–1. No identity/landmarks are retained. */
  boxes: NormalizedBox[];
}
export interface PhotoAnalysisOptions {
  sourceWidth: number;
  sourceHeight: number;
  crop?: AnalysisCrop;
  widthMm?: number;
  heightMm?: number;
  safeMarginMm?: number;
  faces?: FaceDetectionResult;
}
export interface PhotoAdvice {
  id: string;
  severity: "notice" | "info";
  message: string;
}
export interface PhotoAnalysis {
  advice: PhotoAdvice[];
  metrics: {
    analysisWidth: number;
    analysisHeight: number;
    meanLuminance: number;
    tonalRange: number;
    edgeDensity: number;
    outerEdgeDensity: number;
    retainedWidthPixels: number;
    retainedHeightPixels: number;
    retainedSourceFraction: number;
    approximatePpi: number;
  };
  contrastRegion: {
    box: NormalizedBox;
    areaFraction: number;
    confidence: number;
  } | null;
  faces: {
    status: FaceDetectionResult["status"];
    detectedCount: number | null;
    visibleCount: number | null;
    trimmedCount: number | null;
    smallestVisibleWidthFraction: number | null;
  };
}

const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const rounded = (n: number) => Math.round(n * 10000) / 10000;
const median = (values: number[]) =>
  values.sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

/** Matches the editor's cover/zoom/quarter-turn transform, including pan direction. */
export function photoCropTransform(
  sourceWidth: number,
  sourceHeight: number,
  crop: AnalysisCrop,
  outputWidth: number,
  outputHeight: number,
) {
  if (
    ![sourceWidth, sourceHeight, outputWidth, outputHeight].every(
      (n) => Number.isFinite(n) && n > 0,
    ) ||
    !Number.isFinite(crop.zoom) ||
    crop.zoom < 1 ||
    crop.zoom > 4 ||
    ![0, 90, 180, 270].includes(crop.rotation) ||
    ![crop.x, crop.y].every((n) => Number.isFinite(n) && n >= -1 && n <= 1)
  )
    throw new Error("Invalid photo crop.");
  const radians = (crop.rotation * Math.PI) / 180;
  const cos = Math.round(Math.cos(radians)),
    sin = Math.round(Math.sin(radians));
  const rotatedWidth =
    Math.abs(sourceWidth * cos) + Math.abs(sourceHeight * sin);
  const rotatedHeight =
    Math.abs(sourceWidth * sin) + Math.abs(sourceHeight * cos);
  const scale =
    Math.max(outputWidth / rotatedWidth, outputHeight / rotatedHeight) *
    crop.zoom;
  const offsetX =
    outputWidth / 2 +
    (crop.x * Math.max(0, rotatedWidth * scale - outputWidth)) / 2;
  const offsetY =
    outputHeight / 2 +
    (crop.y * Math.max(0, rotatedHeight * scale - outputHeight)) / 2;
  return {
    scale,
    radians,
    offsetX,
    offsetY,
    cos,
    sin,
    retainedWidth: outputWidth / scale,
    retainedHeight: outputHeight / scale,
  };
}

export function mapFaceToCrop(
  box: NormalizedBox,
  options: PhotoAnalysisOptions,
): { box: NormalizedBox; visibleFraction: number } {
  const width = options.widthMm ?? 400,
    height = options.heightMm ?? 500;
  const t = photoCropTransform(
    options.sourceWidth,
    options.sourceHeight,
    options.crop ?? { zoom: 1, x: 0, y: 0, rotation: 0 },
    width,
    height,
  );
  const points = [
    [box.x, box.y],
    [box.x + box.width, box.y],
    [box.x, box.y + box.height],
    [box.x + box.width, box.y + box.height],
  ].map(([u, v]) => {
    const x = (u - 0.5) * options.sourceWidth,
      y = (v - 0.5) * options.sourceHeight;
    return {
      x: ((x * t.cos - y * t.sin) * t.scale + t.offsetX) / width,
      y: ((x * t.sin + y * t.cos) * t.scale + t.offsetY) / height,
    };
  });
  const x = Math.min(...points.map((p) => p.x)),
    y = Math.min(...points.map((p) => p.y));
  const right = Math.max(...points.map((p) => p.x)),
    bottom = Math.max(...points.map((p) => p.y));
  const visibleArea =
    Math.max(0, Math.min(1, right) - Math.max(0, x)) *
    Math.max(0, Math.min(1, bottom) - Math.max(0, y));
  return {
    box: { x, y, width: right - x, height: bottom - y },
    visibleFraction: clamp(
      visibleArea / Math.max(1e-10, (right - x) * (bottom - y)),
    ),
  };
}

export function analysePhoto(
  input: AnalysisPixels,
  options: PhotoAnalysisOptions,
): PhotoAnalysis {
  if (
    !Number.isInteger(input.width) ||
    !Number.isInteger(input.height) ||
    input.width < 1 ||
    input.height < 1 ||
    input.data.length !== input.width * input.height * 4
  )
    throw new Error("Invalid photo-analysis pixels.");
  const size = Math.min(1, 256 / Math.max(input.width, input.height));
  const width = Math.max(1, Math.round(input.width * size)),
    height = Math.max(1, Math.round(input.height * size));
  const luma = new Float32Array(width * height),
    colors = new Float32Array(width * height * 3);
  const offsets = size === 1 ? [0.5] : [0.25, 0.75];
  const sampleWeight = 1 / (offsets.length * offsets.length);
  const border: number[][] = [[], [], []],
    histogram = new Uint32Array(256);
  let sum = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const rgb = [0, 0, 0];
      for (const dy of offsets)
        for (const dx of offsets) {
          const sx = Math.min(
            input.width - 1,
            Math.floor(((x + dx) * input.width) / width),
          );
          const sy = Math.min(
            input.height - 1,
            Math.floor(((y + dy) * input.height) / height),
          );
          const i = (sy * input.width + sx) * 4,
            alpha = input.data[i + 3] / 255;
          for (let c = 0; c < 3; c++)
            rgb[c] +=
              ((input.data[i + c] / 255) * alpha + 1 - alpha) * sampleWeight;
        }
      const i = y * width + x;
      colors.set(rgb, i * 3);
      luma[i] = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
      sum += luma[i];
      histogram[Math.round(luma[i] * 255)]++;
      if (
        x < width * 0.1 ||
        x > width * 0.9 ||
        y < height * 0.1 ||
        y > height * 0.9
      )
        for (let c = 0; c < 3; c++) border[c].push(rgb[c]);
    }
  const percentile = (p: number) => {
    let count = 0;
    for (let i = 0; i < 256; i++) {
      count += histogram[i];
      if (count >= p * luma.length) return i / 255;
    }
    return 1;
  };
  const range = percentile(0.95) - percentile(0.05),
    mean = sum / luma.length;
  const background = border.map(median);
  const columns = 16,
    rows = 16;
  const tiles = Array.from({ length: columns * rows }, () => ({
    sum: 0,
    count: 0,
  }));
  let edgeCount = 0,
    edgeSamples = 0,
    outerEdges = 0,
    outerSamples = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const contrast = Math.sqrt(
        0.299 * (colors[i * 3] - background[0]) ** 2 +
          0.587 * (colors[i * 3 + 1] - background[1]) ** 2 +
          0.114 * (colors[i * 3 + 2] - background[2]) ** 2,
      );
      const tile =
        tiles[
          Math.min(rows - 1, Math.floor((y / height) * rows)) * columns +
            Math.min(columns - 1, Math.floor((x / width) * columns))
        ];
      tile.sum += contrast;
      tile.count++;
      if (x > 0 && y > 0 && x < width - 1 && y < height - 1) {
        const gradient =
          Math.hypot(
            luma[i + 1] - luma[i - 1],
            luma[i + width] - luma[i - width],
          ) / 2;
        const edge = gradient > 0.09 ? 1 : 0;
        edgeCount += edge;
        edgeSamples++;
        if (
          x < width * 0.25 ||
          x > width * 0.75 ||
          y < height * 0.25 ||
          y > height * 0.75
        ) {
          outerEdges += edge;
          outerSamples++;
        }
      }
    }
  const values = tiles.map((tile) => tile.sum / Math.max(1, tile.count));
  const strongest = Math.max(...values),
    threshold = Math.max(0.16, strongest * 0.48);
  const active = values.map((value) => value >= threshold),
    seen = new Uint8Array(tiles.length);
  let best: number[] = [],
    bestMass = 0;
  for (let i = 0; i < tiles.length; i++) {
    if (!active[i] || seen[i]) continue;
    const component: number[] = [],
      pending = [i];
    let mass = 0;
    seen[i] = 1;
    while (pending.length) {
      const at = pending.pop()!;
      component.push(at);
      mass += values[at];
      const x = at % columns,
        y = Math.floor(at / columns);
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        const nx = x + dx,
          ny = y + dy,
          next = ny * columns + nx;
        if (
          nx >= 0 &&
          ny >= 0 &&
          nx < columns &&
          ny < rows &&
          active[next] &&
          !seen[next]
        ) {
          seen[next] = 1;
          pending.push(next);
        }
      }
    }
    if (mass > bestMass) {
      best = component;
      bestMass = mass;
    }
  }
  let contrastRegion: PhotoAnalysis["contrastRegion"] = null;
  const totalMass = values.reduce((a, b) => a + b, 0);
  if (
    best.length >= 2 &&
    best.length < tiles.length * 0.65 &&
    strongest > 0.2
  ) {
    const x0 = Math.min(...best.map((i) => i % columns)),
      x1 = Math.max(...best.map((i) => i % columns)) + 1;
    const y0 = Math.min(...best.map((i) => Math.floor(i / columns))),
      y1 = Math.max(...best.map((i) => Math.floor(i / columns))) + 1;
    const confidence = clamp(bestMass / Math.max(totalMass, 0.0001));
    if (confidence > 0.45)
      contrastRegion = {
        box: {
          x: x0 / columns,
          y: y0 / rows,
          width: (x1 - x0) / columns,
          height: (y1 - y0) / rows,
        },
        areaFraction: ((x1 - x0) * (y1 - y0)) / tiles.length,
        confidence: rounded(confidence),
      };
  }
  const physicalWidth = options.widthMm ?? 400,
    physicalHeight = options.heightMm ?? 500;
  const transform = photoCropTransform(
    options.sourceWidth,
    options.sourceHeight,
    options.crop ?? { zoom: 1, x: 0, y: 0, rotation: 0 },
    physicalWidth,
    physicalHeight,
  );
  const retainedWidth = Math.round(transform.retainedWidth),
    retainedHeight = Math.round(transform.retainedHeight);
  const ppi =
    Math.min(retainedWidth / physicalWidth, retainedHeight / physicalHeight) *
    25.4;
  const edgeDensity = edgeCount / Math.max(1, edgeSamples),
    outerDensity = outerEdges / Math.max(1, outerSamples);
  const advice: PhotoAdvice[] = [];
  const add = (
    id: string,
    message: string,
    severity: PhotoAdvice["severity"] = "notice",
  ) => advice.push({ id, message, severity });
  if (Math.min(retainedWidth, retainedHeight) < 600 || ppi < 60)
    add(
      "crop-resolution",
      `This crop retains about ${retainedWidth} × ${retainedHeight} source pixels (${Math.round(ppi)} ppi at this canvas size). Zoom out or use a larger original for finer detail.`,
    );
  if (mean < 0.23)
    add(
      "dark",
      "This crop is quite dark. Compare the finished preview after increasing brightness or enabling automatic exposure.",
    );
  else if (mean > 0.84)
    add(
      "bright",
      "This crop is very bright. Check that the important details remain visible; a better-exposed original may help.",
    );
  if (range < 0.18)
    add(
      "low-contrast",
      "This crop has little tonal separation. Try the Bold preset or a photograph with clearer light and dark areas.",
    );
  if (edgeDensity < 0.008 && range > 0.18)
    add(
      "soft-detail",
      "Few sharp details were found. This can be deliberate softness or blur; zoom into faces and other important details before continuing.",
    );
  if (outerDensity > 0.2)
    add(
      "busy-surroundings",
      "There is a lot of fine detail around the image edges. A tighter crop or a plainer background may help the main subject stand out.",
    );
  if (contrastRegion) {
    if (contrastRegion.areaFraction < 0.14)
      add(
        "small-contrast-region",
        "Most contrasting detail sits in a small area. If that is your subject, try a tighter crop; this check does not identify people, pets or objects.",
      );
    const b = contrastRegion.box,
      marginX = (options.safeMarginMm ?? 10) / physicalWidth,
      marginY = (options.safeMarginMm ?? 10) / physicalHeight;
    if (
      b.x <= marginX ||
      b.y <= marginY ||
      b.x + b.width >= 1 - marginX ||
      b.y + b.height >= 1 - marginY
    )
      add(
        "detail-at-edge",
        "Strong visual detail touches the canvas edge or safe area. Check the guide and reposition or zoom out if anything important is being cut off.",
      );
  }
  const detection = options.faces ?? { status: "unavailable", boxes: [] };
  const mapped =
    detection.status === "available"
      ? detection.boxes.map((box) => mapFaceToCrop(box, options))
      : [];
  const visible = mapped.filter((face) => face.visibleFraction > 0.15),
    trimmed = mapped.filter((face) => face.visibleFraction < 0.97);
  const smallest = visible.length
    ? Math.min(...visible.map((face) => face.box.width))
    : null;
  if (detection.status === "available") {
    if (trimmed.length)
      add(
        "face-crop",
        `This crop trims or leaves out ${trimmed.length} possible face${trimmed.length === 1 ? "" : "s"}. If that is intentional, continue; otherwise zoom out or reposition.`,
      );
    if (smallest !== null && smallest < 0.16)
      add(
        "small-face",
        "A possible face is small in this composition. Try a tighter crop, or inspect the Detailed preview before choosing your size.",
      );
    if (visible.length > 1)
      add(
        "group-photo",
        `${visible.length} possible faces are visible. Check each person in the finished preview; a group photo can need more detail.`,
        "info",
      );
  }
  if (!advice.length)
    add(
      "promising",
      "The basic resolution, tone and crop checks look promising. Inspect the finished artwork and template before continuing.",
      "info",
    );
  return {
    advice,
    contrastRegion,
    metrics: {
      analysisWidth: width,
      analysisHeight: height,
      meanLuminance: rounded(mean),
      tonalRange: rounded(range),
      edgeDensity: rounded(edgeDensity),
      outerEdgeDensity: rounded(outerDensity),
      retainedWidthPixels: retainedWidth,
      retainedHeightPixels: retainedHeight,
      retainedSourceFraction: rounded(
        clamp(
          (transform.retainedWidth * transform.retainedHeight) /
            (options.sourceWidth * options.sourceHeight),
        ),
      ),
      approximatePpi: Math.round(ppi),
    },
    faces: {
      status: detection.status,
      detectedCount:
        detection.status === "available" ? detection.boxes.length : null,
      visibleCount: detection.status === "available" ? visible.length : null,
      trimmedCount: detection.status === "available" ? trimmed.length : null,
      smallestVisibleWidthFraction:
        smallest === null ? null : rounded(smallest),
    },
  };
}

interface NativeFace {
  boundingBox: { x: number; y: number; width: number; height: number };
}
type FaceDetectorConstructor = new (options: {
  maxDetectedFaces: number;
  fastMode: boolean;
}) => { detect: (source: CanvasImageSource) => Promise<NativeFace[]> };

/** Optional OS/browser detector. No model, remote request, recognition or image persistence. */
export async function detectLocalFaces(
  source: CanvasImageSource,
  width: number,
  height: number,
  host: { FaceDetector?: FaceDetectorConstructor } = globalThis as unknown as {
    FaceDetector?: FaceDetectorConstructor;
  },
  timeoutMs = 1400,
): Promise<FaceDetectionResult> {
  if (!host.FaceDetector) return { status: "unavailable", boxes: [] };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const detector = new host.FaceDetector({
      maxDetectedFaces: 12,
      fastMode: false,
    });
    const timeout = new Promise<FaceDetectionResult>((resolve) => {
      timer = setTimeout(
        () => resolve({ status: "timeout", boxes: [] }),
        timeoutMs,
      );
    });
    const result = detector
      .detect(source)
      .then((faces): FaceDetectionResult => ({
        status: "available",
        boxes: faces.slice(0, 12).flatMap(({ boundingBox: b }) => {
          if (
            ![b.x, b.y, b.width, b.height].every(Number.isFinite) ||
            b.width <= 0 ||
            b.height <= 0
          )
            return [];
          const x = clamp(b.x / width),
            y = clamp(b.y / height),
            right = clamp((b.x + b.width) / width),
            bottom = clamp((b.y + b.height) / height);
          return right > x && bottom > y
            ? [{ x, y, width: right - x, height: bottom - y }]
            : [];
        }),
      }))
      .catch((error): FaceDetectionResult => ({
        status: error?.name === "NotSupportedError" ? "unavailable" : "failed",
        boxes: [],
      }));
    return await Promise.race([result, timeout]);
  } catch {
    return { status: "failed", boxes: [] };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
