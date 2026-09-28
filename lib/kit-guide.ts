import {
  normalizeSettings,
  supportsPalette,
  round,
  type RenderGeometry,
  type RenderMode,
} from "./renderers/types";

export const KIT_GUIDE_VERSION = "srs-kit-guide/1.0.0";
export const KIT_GUIDE_PAGE = { widthMm: 210, heightMm: 297 } as const;

export interface KitGuideModel {
  version: string;
  rendererVersion: string;
  status: "draft-for-physical-trial";
  mode: RenderMode;
  dimensions: { widthMm: number; heightMm: number };
  title: string;
  steps: { title: string; body: string }[];
  materials: { id: string; label: string; assignmentStatus: "unresolved" }[];
  legend: {
    id: string;
    index: number | null;
    color: string;
    usedCellCount: number;
  }[];
  warnings: string[];
  sample: {
    circleIndices: number[];
    cellIndices: number[];
    pathIndices: number[];
    boundsMm: { x: number; y: number; width: number; height: number };
  };
}

const ACTIVITIES: Record<
  RenderMode,
  { title: string; steps: KitGuideModel["steps"] }
> = {
  fibonacci: {
    title: "Follow the sunflower spirals",
    steps: [
      {
        title: "Choose a small spiral section",
        body: "Find a short arc of outlined dots. The sunflower pattern curves in both directions; choose a direction that feels comfortable.",
      },
      {
        title: "Fill each separate circle",
        body: "Use the selected trial marker to fill each circle to its printed size. Keep the dots separate; do not draw connecting spiral lines.",
      },
      {
        title: "Follow the changing sizes",
        body: "Larger circles build the shadows and smaller circles form lighter details. Leave areas without circles unmarked.",
      },
      {
        title: "Step back and compare",
        body: "Compare a filled patch with the digital reference. Record guide visibility, dot control and any marks that join.",
      },
    ],
  },
  stipple: {
    title: "Build shade with scattered dots",
    steps: [
      {
        title: "Start with a small patch",
        body: "Choose a small group of outlined circles. The irregular spacing is part of the picture; do not arrange the dots into rows.",
      },
      {
        title: "Fill each separate dot",
        body: "Use the selected trial marker to fill each printed circle. Follow its size and keep neighbouring dots separate.",
      },
      {
        title: "Leave the light areas open",
        body: "Dense dots create shadows and sparse dots create highlights. Leave unmarked canvas untouched; do not add extra dots to fill the gaps.",
      },
      {
        title: "Step back and compare",
        body: "Compare a filled patch with the digital reference at a distance. Record guide visibility, dot control and any marks that join.",
      },
    ],
  },
  dots: {
    title: "Fill the circles",
    steps: [
      {
        title: "Find a small area",
        body: "Choose a few outlined circles. The spaces between them are part of the image.",
      },
      {
        title: "Fill each circle",
        body: "Use the trial marker to fill inside each circular boundary. Keep separate circles separate.",
      },
      {
        title: "Follow the changing sizes",
        body: "Fill the shape that is printed, including the smaller circles. Do not turn every mark into the same size.",
      },
      {
        title: "Compare and record",
        body: "Compare the filled area with the digital reference. Record guide visibility, control and any marks that join.",
      },
    ],
  },
  mosaic: {
    title: "Fill the cells",
    steps: [
      {
        title: "Check the key first",
        body: "For numbered cells, match the printed number to the key on page 2. The operator must first assign and test the physical markers.",
      },
      {
        title: "Fill within each cell",
        body: "Fill the outlined cell with its assigned colour. In a single-ink design, use the selected ink for every cell.",
      },
      {
        title: "Keep the blank spaces",
        body: "Leave areas without cells unmarked. Blank paper is not an extra numbered marker colour.",
      },
      {
        title: "Compare and record",
        body: "Compare a small filled area with the digital reference. Record number readability, colour matching and coverage.",
      },
    ],
  },
  "colour-blend": {
    title: "Build colour with dots",
    steps: [
      {
        title: "Match the numbered pens",
        body: "Match each printed number to the key on page 2. The operator must assign and test the physical markers first.",
      },
      {
        title: "Fill one colour at a time",
        body: "Fill the numbered circles with their assigned pen. Keep each colour inside its own boundary; do not mix wet inks.",
      },
      {
        title: "Keep the white gaps",
        body: "Leave unmarked canvas untouched. The spaces and neighbouring pen colours both contribute to the picture.",
      },
      {
        title: "Step back and compare",
        body: "Compare close up and from a distance. Record number readability, colour matching and whether the separate dots blend visually.",
      },
    ],
  },
  "tv-weave": {
    title: "Weave colour with dashes",
    steps: [
      {
        title: "Match the numbered pens",
        body: "Match each printed number to the key on page 2. The operator must assign and test the physical markers first.",
      },
      {
        title: "Fill the vertical dashes",
        body: "Fill each short outlined dash with its numbered colour. Keep adjacent dashes separate; do not join them into long stripes.",
      },
      {
        title: "Keep the white gaps",
        body: "Leave unmarked canvas untouched. Fill one number at a time without overlapping or mixing the inks.",
      },
      {
        title: "Step back and compare",
        body: "View the woven pattern close up, then from a distance. Record readability, control and how the separate colours blend visually.",
      },
    ],
  },
  contour: {
    title: "Trace the paths",
    steps: [
      {
        title: "Find one guide path",
        body: "Start with a short section and follow the printed route. Separate paths remain separate.",
      },
      {
        title: "Trace along the guide",
        body: "Use the trial marker to follow the path. The finished reference shows the intended line, not a filled region.",
      },
      {
        title: "Keep the open spaces",
        body: "Do not fill between paths or connect their ends unless the printed guide already connects them.",
      },
      {
        title: "Compare and record",
        body: "Compare the traced section with the digital reference. Record control, line width and where the guide remains visible.",
      },
    ],
  },
  "line-amplification": {
    title: "Fill the horizontal strips",
    steps: [
      {
        title: "Use a ruler or straight edge",
        body: "A ruler or straight edge is required for this activity. Align it with the long horizontal edge of a printed strip.",
      },
      {
        title: "Fill the outlined strip",
        body: "Fill between the two printed boundaries. Follow the changing strip thickness; do not replace it with one thin centre line.",
      },
      {
        title: "Keep the interruptions",
        body: "Leave blank gaps between strips unmarked. Move the straight edge carefully and observe any dragging or smearing during the trial.",
      },
      {
        title: "Compare and record",
        body: "Compare with the digital reference. Record ruler handling, edge control and whether the narrow strips are comfortable to fill.",
      },
    ],
  },
};

type Bound = { x: number; y: number; width: number; height: number };

function primitiveBounds(geometry: RenderGeometry) {
  const finite = (value: number) => {
    if (!Number.isFinite(value))
      throw new Error("Kit guide geometry must be finite.");
    return value;
  };
  const bound = (xs: number[], ys: number[], padding = 0): Bound => {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const x of xs) {
      minX = Math.min(minX, finite(x));
      maxX = Math.max(maxX, x);
    }
    for (const y of ys) {
      minY = Math.min(minY, finite(y));
      maxY = Math.max(maxY, y);
    }
    const result = {
      x: minX - padding,
      y: minY - padding,
      width: maxX - minX + 2 * padding,
      height: maxY - minY + 2 * padding,
    };
    if (
      !Number.isFinite(result.width) ||
      !Number.isFinite(result.height) ||
      result.width <= 0 ||
      result.height <= 0 ||
      result.x < -0.001 ||
      result.y < -0.001 ||
      result.x + result.width > geometry.widthMm + 0.001 ||
      result.y + result.height > geometry.heightMm + 0.001
    )
      throw new Error(
        "Kit guide marks must have positive size and stay inside the canvas.",
      );
    return result;
  };
  return {
    circles: geometry.circles.map((circle) => {
      if (finite(circle.r) <= 0)
        throw new Error("Kit guide circle radius must be positive.");
      return bound([circle.x], [circle.y], circle.r);
    }),
    cells: geometry.cells.map((cell) => {
      if (finite(cell.width) <= 0 || finite(cell.height) <= 0)
        throw new Error("Kit guide cell size must be positive.");
      if (
        cell.radius !== undefined &&
        (!Number.isFinite(cell.radius) || cell.radius < 0)
      )
        throw new Error("Invalid kit guide cell radius.");
      if (cell.points && (cell.points.length < 3 || cell.points.length > 32))
        throw new Error("Invalid kit guide polygon.");
      return cell.points
        ? bound(
            cell.points.map((p) => p.x),
            cell.points.map((p) => p.y),
          )
        : bound([cell.x, cell.x + cell.width], [cell.y, cell.y + cell.height]);
    }),
    paths: geometry.paths.map((path) => {
      if (
        finite(path.width) <= 0 ||
        path.points.length < 2 ||
        path.points.length > 200000
      )
        throw new Error("Invalid kit guide path.");
      return bound(
        path.points.map((p) => p.x),
        path.points.map((p) => p.y),
        path.width / 2,
      );
    }),
  };
}

function sampleFrom(geometry: RenderGeometry): KitGuideModel["sample"] {
  const bounds = primitiveBounds(geometry);
  const select = (items: Bound[], limit: number) =>
    items
      .map((b, index) => ({
        index,
        distance: Math.hypot(
          b.x + b.width / 2 - geometry.widthMm / 2,
          b.y + b.height / 2 - geometry.heightMm / 2,
        ),
      }))
      .sort((a, b) => a.distance - b.distance || a.index - b.index)
      .slice(0, limit)
      .map((item) => item.index)
      .sort((a, b) => a - b);
  const circleIndices = select(bounds.circles, 16),
    cellIndices = select(bounds.cells, 12),
    pathIndices = select(bounds.paths, 3);
  const selected = [
    ...circleIndices.map((i) => bounds.circles[i]),
    ...cellIndices.map((i) => bounds.cells[i]),
    ...pathIndices.map((i) => bounds.paths[i]),
  ];
  if (!selected.length)
    return {
      circleIndices,
      cellIndices,
      pathIndices,
      boundsMm: {
        x: 0,
        y: 0,
        width: geometry.widthMm,
        height: geometry.heightMm,
      },
    };
  const x = Math.min(...selected.map((b) => b.x)) - 2,
    y = Math.min(...selected.map((b) => b.y)) - 2;
  return {
    circleIndices,
    cellIndices,
    pathIndices,
    boundsMm: {
      x: round(x),
      y: round(y),
      width: round(Math.max(...selected.map((b) => b.x + b.width)) + 2 - x),
      height: round(Math.max(...selected.map((b) => b.y + b.height)) + 2 - y),
    },
  };
}

/** Saved geometry is the authority. No source image, customer lettering or live catalogue is copied. */
export function buildKitGuide(geometry: RenderGeometry): KitGuideModel {
  const settings = normalizeSettings(
    geometry.mode === "fibonacci" &&
      geometry.circles.length &&
      !geometry.cells.length
      ? { ...geometry.settings, palette: undefined }
      : geometry.settings,
  );
  if (
    geometry.mode !== settings.mode ||
    geometry.widthMm !== settings.widthMm ||
    geometry.heightMm !== settings.heightMm
  )
    throw new Error(
      "Kit guide geometry does not match its saved mode and dimensions.",
    );
  if (!/^[a-z0-9./_-]{1,80}$/i.test(geometry.version))
    throw new Error("Invalid kit guide renderer version.");
  if (
    geometry.circles.length + geometry.cells.length + geometry.paths.length >
    60000
  )
    throw new Error("Kit guide geometry exceeds the mark limit.");
  if (
    (geometry.mode !== "dots" &&
      geometry.mode !== "stipple" &&
      geometry.mode !== "fibonacci" &&
      geometry.circles.length) ||
    (!supportsPalette(geometry.mode) &&
      geometry.mode !== "line-amplification" &&
      geometry.cells.length) ||
    (geometry.mode !== "contour" && geometry.paths.length) ||
    (geometry.mode === "fibonacci" &&
      geometry.circles.length &&
      geometry.cells.length)
  )
    throw new Error("Kit guide marks do not match the selected activity.");
  const legend: KitGuideModel["legend"] = [];
  if (
    supportsPalette(geometry.mode) &&
    settings.palette &&
    // Pre-colour Fibonacci snapshots could retain an unused palette setting.
    !(geometry.mode === "fibonacci" && geometry.circles.length)
  ) {
    if (geometry.settings.palette?.length !== settings.palette.length)
      throw new Error(
        "Kit guide palette must already have distinct canonical entries.",
      );
    settings.palette.forEach((color, index) =>
      legend.push({
        id: String(index + 1),
        index: index + 1,
        color,
        usedCellCount: 0,
      }),
    );
    for (const cell of geometry.cells) {
      const entry = legend.find((item) => item.id === cell.label);
      if (
        !entry ||
        typeof cell.color !== "string" ||
        cell.color.toLowerCase() !== entry.color
      )
        throw new Error(
          "Kit guide palette cell label and colour do not match the saved palette.",
        );
      entry.usedCellCount++;
    }
  } else {
    for (const cell of geometry.cells) {
      if (
        cell.label !== undefined ||
        (cell.color !== undefined &&
          cell.color.toLowerCase() !== settings.inkColor)
      )
        throw new Error(
          "Unnumbered kit guide cells must use the selected single ink.",
        );
    }
    legend.push({
      id: "ink",
      index: null,
      color: settings.inkColor,
      usedCellCount: geometry.cells.length,
    });
  }
  const material = (
    id: string,
    label: string,
  ): KitGuideModel["materials"][number] => ({
    id,
    label,
    assignmentStatus: "unresolved",
  });
  const materials = [
    material(
      "canvas",
      `Printed canvas: ${geometry.widthMm} x ${geometry.heightMm} mm; substrate and finish require trial approval.`,
    ),
    ...legend
      .filter((entry) => entry.index === null || entry.usedCellCount > 0)
      .map((entry) =>
        material(
          `marker-${entry.id}`,
          entry.index === null
            ? `Mode-appropriate marker for single ink ${entry.color}; tip, SKU, lot and quantity unassigned.`
            : `Marker matching key ${entry.id} (${entry.color}); SKU, lot and quantity unassigned.`,
        ),
      ),
    material(
      "making-guide",
      "Printed making guide and colour key; this draft still requires a physical comprehension trial.",
    ),
  ];
  if (geometry.mode === "line-amplification")
    materials.push(
      material(
        "straight-edge",
        "Ruler / straight edge: required for every Line Amplification kit.",
      ),
    );
  const warnings = [
    "Draft for physical trials. This guide does not approve a product, material combination or production setting.",
    "Digital colour swatches are references, not verified matches to physical marker ink.",
    "Marker selection, quantity, handling and drying instructions remain unresolved until the material trial and supplier instructions are reviewed.",
    "Selected artwork examples omit personal lettering and are digital targets, not hand-completed samples.",
  ];
  if (
    !geometry.circles.length &&
    !geometry.cells.length &&
    !geometry.paths.length
  )
    warnings.push(
      "No artwork marks are present. Do not pack this design without resolving the empty artwork.",
    );
  if (geometry.mode === "line-amplification")
    warnings.push(
      "Line Amplification remains a research activity until ruler and completion trials pass.",
    );
  const activity =
    geometry.mode === "fibonacci" && legend[0]?.index !== null
      ? {
          title: "Build colour along the sunflower spirals",
          steps: [
            {
              title: "Match the numbered pens",
              body: "Match each printed number to the key on page 2. The operator must assign and test the physical markers first.",
            },
            {
              title: "Follow a spiral of dots",
              body: "Choose a short sunflower arc and fill each numbered circle with its matching pen. Fill one colour at a time without joining the dots.",
            },
            {
              title: "Keep the white gaps",
              body: "Leave unmarked canvas untouched. Each dot uses one pen colour; neighbouring colours blend visually when viewed from a distance.",
            },
            {
              title: "Step back and compare",
              body: "Compare the filled patch with the digital reference. Record number readability, marker matching and whether nearby colours blend.",
            },
          ],
        }
      : ACTIVITIES[geometry.mode];
  return {
    version: KIT_GUIDE_VERSION,
    rendererVersion: geometry.version,
    status: "draft-for-physical-trial",
    mode: geometry.mode,
    dimensions: { widthMm: geometry.widthMm, heightMm: geometry.heightMm },
    title: activity.title,
    steps: activity.steps.map((step) => ({
      ...step,
      body:
        legend.length > 16
          ? step.body.replace("the key on page 2", "the key on pages 2 and 3")
          : step.body,
    })),
    materials,
    legend,
    warnings,
    sample: sampleFrom(geometry),
  };
}

export function kitGuideText(model: KitGuideModel): string {
  return [
    "SLOW REVEAL STUDIO - DRAFT FOR PHYSICAL TRIAL",
    model.title,
    `${model.dimensions.widthMm} x ${model.dimensions.heightMm} mm artwork. Guide status: ${model.status}.`,
    "",
    "MAKING TRIAL",
    ...model.steps.map(
      (step, index) => `${index + 1}. ${step.title}\n${step.body}`,
    ),
    "",
    "DIGITAL COLOUR KEY",
    ...model.legend.map(
      (entry) =>
        `${entry.index === null ? "Single ink" : `Key ${entry.id}`}: ${entry.color}${supportsPalette(model.mode) ? `; ${entry.usedCellCount} ${model.mode === "mosaic" ? "cells" : "marks"}` : ""}. Physical marker assignment unresolved.`,
    ),
    "Leave unmarked canvas unmarked; it is not an additional numbered colour.",
    "",
    "OPERATOR: PACKING REQUIREMENTS - NOT PACKING CONFIRMATION",
    ...model.materials.map((item) => `[ ] ${item.label}`),
    "",
    "UNRESOLVED BEFORE PHYSICAL APPROVAL",
    ...model.warnings,
    "",
    `${model.version}; renderer ${model.rendererVersion}. No order identity or personal lettering is included in this guide.`,
    "",
  ].join("\n");
}

export { kitGuidePages } from "./kit-guide-svg";
