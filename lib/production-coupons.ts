import {
  DEFAULT_SETTINGS,
  FONT_OUTLINE_VERSION,
  RENDERER_VERSION,
  round,
  toSvg,
  type Circle,
  type RenderGeometry,
  type TextGeometry,
  type TracePath,
} from "./renderers";

export const COUPON_VERSION = "srs-dot-coupons/1.0.0";
export const COUPON_PAGE = { widthMm: 210, heightMm: 297, dpi: 300 } as const;
export const COUPON_DIAMETERS_MM = [0.8, 1, 1.2, 1.5, 2, 3, 4, 5, 6] as const;
export const COUPON_GAPS_MM = [0.2, 0.4, 0.6, 0.8, 1] as const;
export const COUPON_GUIDE_WIDTHS_MM = [0.08, 0.12, 0.16, 0.2, 0.3] as const;
export const COUPON_GUIDE_OPACITIES = [0.1, 0.2, 0.3, 0.4] as const;

export type CouponSample = {
  id: string;
  kind: "diameter" | "gap" | "guide";
  diameterMm?: number;
  diametersMm?: number[];
  clearGapMm?: number;
  guideWidthMm: number;
  guideOpacity: number;
  geometry: RenderGeometry;
};
export type CouponSheet = {
  id: string;
  title: string;
  variant: "template" | "finished";
  samples: CouponSample[];
  annotations: TextGeometry[];
  calibration: RenderGeometry;
};
export type CouponPack = ReturnType<typeof buildProductionCoupons>;

function geometry(
  circles: Circle[] = [],
  guideWidthMm = 0.16,
  guideOpacity = 0.3,
  paths: TracePath[] = [],
): RenderGeometry {
  return {
    version: RENDERER_VERSION,
    mode: "dots",
    widthMm: COUPON_PAGE.widthMm,
    heightMm: COUPON_PAGE.heightMm,
    settings: {
      ...DEFAULT_SETTINGS,
      widthMm: COUPON_PAGE.widthMm,
      heightMm: COUPON_PAGE.heightMm,
      minDiameterMm: 0.8,
      maxDiameterMm: 6,
      spacingMm: 8,
      safeMarginMm: 10,
      inkColor: "#000000",
      guideWidthMm,
      guideOpacity,
    },
    circles,
    cells: [],
    paths,
    stats: {
      markCount: circles.length + paths.length,
      estimatedCompletionMinutes: 0,
      inkAreaMm2: round(
        circles.reduce((area, circle) => area + Math.PI * circle.r ** 2, 0),
      ),
      sourceWidth: 0,
      sourceHeight: 0,
      effectiveSpacingMm: 0,
      effectiveMinDiameterMm: circles.length
        ? Math.min(...circles.map((c) => c.r * 2))
        : 0,
      effectiveMaxDiameterMm: circles.length
        ? Math.max(...circles.map((c) => c.r * 2))
        : 0,
      meanLuminance: 0,
      tonalRange: 0,
      exposureScale: 1,
    },
    warnings: [
      "Unvalidated physical test candidates. Not approved production settings.",
      "Synthetic coupon geometry; source-image and estimated-time statistics are not applicable.",
    ],
  };
}

function label(
  value: string,
  x: number,
  y: number,
  sizeMm = 2.8,
  anchor: TextGeometry["anchor"] = "start",
  maxWidthMm = 170,
): TextGeometry {
  return {
    value,
    x,
    y,
    sizeMm,
    fontFamily: "sans-serif",
    fontVersion: FONT_OUTLINE_VERSION,
    anchor,
    maxWidthMm,
  };
}

/** Calibration dimensions refer to centre-lines / tick centres, not outside stroke edges. */
function calibrationGeometry() {
  const paths: TracePath[] = [];
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    paths.push({
      points: [
        { x: x1, y: y1 },
        { x: x2, y: y2 },
      ],
      width: 0.2,
    });
  line(25, 259, 125, 259);
  line(190, 70, 190, 170);
  for (let mm = 0; mm <= 100; mm += 10) {
    const halfTick = mm % 50 === 0 ? 2 : 1;
    line(25 + mm, 259 - halfTick, 25 + mm, 259 + halfTick);
    line(190 - halfTick, 70 + mm, 190 + halfTick, 70 + mm);
  }
  paths.push({
    points: [
      { x: 148, y: 247 },
      { x: 168, y: 247 },
      { x: 168, y: 267 },
      { x: 148, y: 267 },
      { x: 148, y: 247 },
    ],
    width: 0.2,
  });
  return geometry([], 0.16, 0.3, paths);
}

function commonAnnotations(
  title: string,
  variant: CouponSheet["variant"],
  page: number,
): TextGeometry[] {
  return [
    label("SLOW REVEAL STUDIO / MATERIAL TEST", 15, 17, 2.7),
    { ...label(title, 15, 28, 5.8), fontFamily: "serif" },
    label(
      variant === "template"
        ? "GUIDE SHEET - fill these circles during the trial."
        : "FILLED REFERENCE - digital target; not a hand-completed sample.",
      15,
      36,
      2.75,
    ),
    label(
      "Candidate values only. No substrate, marker or setting is approved by this sheet.",
      15,
      43,
      2.65,
    ),
    label("Y 100 mm", 190, 62, 2.7, "middle", 23),
    label("tick centres", 190, 179, 2.35, "middle", 24),
    label("X 100 mm between end-tick centres", 25, 251, 2.65, "start", 112),
    label("20 x 20 mm", 158, 242, 2.65, "middle", 32),
    label("centre-lines", 158, 273, 2.3, "middle", 32),
    label("0", 25, 266, 2.5, "middle", 8),
    label("100", 125, 266, 2.5, "middle", 10),
    label("Print at 100% / Actual size. Never use Fit to page.", 15, 281, 3),
    label(`A4 210 x 297 mm / ${COUPON_VERSION} / ${page} of 4`, 15, 289, 2.5),
  ];
}

function diameterAndGapSamples() {
  const samples: CouponSample[] = [];
  const annotations: TextGeometry[] = [
    label("DIAMETER / 8 repeats / 2 mm clear gap", 15, 56, 3),
    label("Guide: 0.16 mm at 30% opacity", 99, 56, 2.45, "start", 75),
  ];
  COUPON_DIAMETERS_MM.forEach((diameterMm, index) => {
    const id = `D${String(index + 1).padStart(2, "0")}`;
    const y = 67 + index * 9;
    samples.push({
      id,
      kind: "diameter",
      diameterMm,
      clearGapMm: 2,
      guideWidthMm: 0.16,
      guideOpacity: 0.3,
      geometry: geometry(
        Array.from({ length: 8 }, (_, j) => ({
          x: round(100 + j * (diameterMm + 2)),
          y,
          r: diameterMm / 2,
        })),
      ),
    });
    annotations.push(
      label(`${id} / ${diameterMm.toFixed(1)} mm diameter`, 15, y + 1, 3),
    );
  });
  annotations.push(
    label("CLEAR GAP / 3 mm circles / 8 repeats", 15, 162, 3),
    label("Same 0.16 mm / 30% guide", 99, 162, 2.45, "start", 75),
  );
  COUPON_GAPS_MM.forEach((clearGapMm, index) => {
    const id = `G${String(index + 1).padStart(2, "0")}`;
    const y = 175 + index * 11;
    samples.push({
      id,
      kind: "gap",
      diameterMm: 3,
      clearGapMm,
      guideWidthMm: 0.16,
      guideOpacity: 0.3,
      geometry: geometry(
        Array.from({ length: 8 }, (_, j) => ({
          x: round(104 + j * (3 + clearGapMm)),
          y,
          r: 1.5,
        })),
      ),
    });
    annotations.push(
      label(
        `${id} / ${clearGapMm.toFixed(1)} mm edge-to-edge gap`,
        15,
        y + 1,
        2.9,
      ),
    );
  });
  annotations.push(
    label(
      "Gaps describe the finished fill boundaries. The guide is inset inside each circle.",
      15,
      232,
      2.45,
    ),
    label(
      "The 0.2 mm gap is a deliberate trial below the current 0.25 mm renderer safeguard.",
      15,
      237,
      2.45,
    ),
  );
  return { samples, annotations };
}

function guideSamples() {
  const samples: CouponSample[] = [];
  const annotations: TextGeometry[] = [
    label(
      "GUIDE WIDTH x OPACITY / each cell: 1, 3, 5 mm circles (left to right)",
      15,
      52,
      2.65,
    ),
  ];
  COUPON_GUIDE_WIDTHS_MM.forEach((guideWidthMm, column) => {
    const x = 30 + column * 33;
    annotations.push(
      label(`${guideWidthMm.toFixed(2)} mm`, x, 64, 3.2, "middle", 28),
    );
    COUPON_GUIDE_OPACITIES.forEach((guideOpacity, row) => {
      const id = `W${String(column + 1).padStart(2, "0")}-O${Math.round(guideOpacity * 100)}`;
      const y = 88 + row * 38;
      const circles = [
        { x: x - 8, y, r: 0.5 },
        { x, y, r: 1.5 },
        { x: x + 9, y, r: 2.5 },
      ];
      samples.push({
        id,
        kind: "guide",
        diametersMm: [1, 3, 5],
        guideWidthMm,
        guideOpacity,
        geometry: geometry(circles, guideWidthMm, guideOpacity),
      });
      annotations.push(
        label(id, x, y - 10, 2.8, "middle", 30),
        label(
          `${Math.round(guideOpacity * 100)}% opacity`,
          x,
          y + 13,
          2.6,
          "middle",
          30,
        ),
      );
    });
  });
  annotations.push(
    label(
      "Annotations and calibration are solid black, separate from the faint guides.",
      15,
      228,
      2.5,
    ),
    label(
      "Opacity is a digital input; RIP, UV ink, canvas and lighting change real visibility.",
      15,
      234,
      2.5,
    ),
  );
  return { samples, annotations };
}

/** Pure synthetic test geometry: no photographs, identifiers, timestamps or approval decisions. */
export function buildProductionCoupons() {
  const marks = diameterAndGapSamples();
  const guides = guideSamples();
  const definitions = [
    {
      id: "marks-guide",
      title: "Dot diameter and gap",
      variant: "template" as const,
      content: marks,
    },
    {
      id: "guides-guide",
      title: "Guide width and opacity",
      variant: "template" as const,
      content: guides,
    },
    {
      id: "marks-filled",
      title: "Dot diameter and gap",
      variant: "finished" as const,
      content: marks,
    },
    {
      id: "guides-filled",
      title: "Guide width and opacity",
      variant: "finished" as const,
      content: guides,
    },
  ];
  return {
    version: COUPON_VERSION,
    rendererVersion: RENDERER_VERSION,
    fontVersion: FONT_OUTLINE_VERSION,
    page: COUPON_PAGE,
    physicalValidation:
      "NOT PERFORMED - unvalidated test candidates; all observation fields remain blank",
    sheets: definitions.map(
      ({ id, title, variant, content }, index): CouponSheet => ({
        id,
        title,
        variant,
        samples: content.samples,
        annotations: [
          ...commonAnnotations(title, variant, index + 1),
          ...content.annotations,
        ],
        calibration: calibrationGeometry(),
      }),
    ),
  };
}

function body(svg: string) {
  return svg.slice(svg.indexOf(">") + 1, svg.lastIndexOf("</svg>"));
}

/** Compose shared serializers in one mm viewBox. The annotation layer always uses full black. */
export function couponSheetSvg(sheet: CouponSheet): string {
  const content = sheet.samples.map(
    (sample) =>
      `<g data-coupon-id="${sample.id}">${body(toSvg(sample.geometry, sheet.variant, { background: false }))}</g>`,
  );
  content.push(
    `<g data-calibration="tick-centres">${body(toSvg(sheet.calibration, "finished", { background: false }))}</g>`,
  );
  for (const annotation of sheet.annotations) {
    const annotationGeometry = { ...geometry(), text: annotation };
    content.push(
      `<g data-annotation="solid-black">${body(toSvg(annotationGeometry, "finished", { background: false }))}</g>`,
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${COUPON_PAGE.widthMm}mm" height="${COUPON_PAGE.heightMm}mm" viewBox="0 0 ${COUPON_PAGE.widthMm} ${COUPON_PAGE.heightMm}" role="img"><title>Unvalidated dot material coupon: ${sheet.id}</title><metadata>${COUPON_VERSION}; units mm; print at 100%; physical validation not performed</metadata>${content.join("")}</svg>`;
}

export function couponObservationRecord(pack: CouponPack): string {
  const samples = pack.sheets
    .filter((sheet) => sheet.variant === "template")
    .flatMap((sheet) => sheet.samples);
  return `# Dot coupon observation record\n\n**Unvalidated trial - this blank form grants no production approval.**\n\nPack: ${pack.version}. Print the PDF at 100% / Actual size. Disable Fit to page. Measure tick-centre calibration on each printed guide page before filling. If either 100 mm rule or the 20 mm square differs, stop, correct the print workflow and reprint; do not infer settings from a scaled sheet. Physical tolerance is agreed with the printer operator, not imposed by this form.\n\n## Trial identity\n\n- Sample ID / date / operator: __________\n- Printer / RIP / version / profile / passes / cure settings: __________\n- UV ink type / lot / print date / cure interval: __________\n- Canvas supplier / SKU / lot / weight / coating / preparation: __________\n- Pen supplier / SKU / lot / tip / ink: __________\n- Temperature / humidity / lighting: __________\n- PDF file SHA-256 (from manifest): __________\n- Guide page 1: X 100 mm measured ____; Y 100 mm measured ____; square W/H ____ / ____\n- Guide page 2: X 100 mm measured ____; Y 100 mm measured ____; square W/H ____ / ____\n- Printer-agreed tolerance / calibration decision and reason: __________\n\n## Observations\n\nDiameter and gap coupons use a 0.16 mm / 30% guide. D rows have eight equal circles with 2 mm finished edge gaps; G rows have eight 3 mm circles. W/O cells show 1, 3 and 5 mm circles in that order. Record actual results; opacity percentages are digital inputs, not measured ink coverage. The filled-reference pages are digital targets, not completed trials.\n\n| ID | Candidate values | Visible before filling | Coverage after filling | Spread / joins / bleed | Dry / smudge / drag | Comfort / notes |\n|---|---|---|---|---|---|---|\n${samples.map((sample) => `| ${sample.id} | ${sample.kind === "diameter" ? `${sample.diameterMm} mm diameter; 2 mm gap` : sample.kind === "gap" ? `3 mm diameter; ${sample.clearGapMm} mm gap` : `${sample.guideWidthMm.toFixed(2)} mm guide; ${Math.round(sample.guideOpacity * 100)}% opacity; 1/3/5 mm circles`} |  |  |  |  |  |`).join("\n")}\n\n## Follow-up (leave blank until a real trial)\n\n- Measured drying times and test method: __________\n- Adhesion / abrasion method agreed with printer and result: __________\n- Guide show-through after filling / viewing distance: __________\n- Pen usage / control / fatigue / error count: __________\n- Before/after photograph filenames and scale reference: __________\n- Candidate to retest / reason: __________\n- Rejected setting / reason: __________\n- Reviewer / date / next physical trial: __________\n\nA coupon result does not approve a full canvas, a different substrate or pen lot, a completion-time estimate or a commercial kit. The full PRODUCTION protocol and launch gates remain in force.\n`;
}
