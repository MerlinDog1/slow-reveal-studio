import { buildKitGuide, KIT_GUIDE_PAGE, type KitGuideModel } from "./kit-guide";
import { measureLettering, outlineLettering } from "./renderers/fonts";
import { escapeXml, toSvg } from "./renderers/svg";
import {
  supportsPalette,
  isOpticalMode,
  type RenderGeometry,
} from "./renderers/types";

const INK = "#222522",
  MUTED = "#59615a",
  ACCENT = "#8b5437";

function label(
  value: string,
  x: number,
  y: number,
  size = 3.2,
  color = INK,
  family: "serif" | "sans-serif" = "sans-serif",
) {
  const shape = outlineLettering({
    value,
    x,
    y,
    sizeMm: size,
    fontFamily: family,
    anchor: "start",
    maxWidthMm: 180,
  });
  const b = shape.bounds;
  if (b.x < 11 || b.y < 9 || b.x + b.width > 199 || b.y + b.height > 289)
    throw new Error("Kit guide annotation exceeds the printable page area.");
  return `<g data-guide-label="${escapeXml(value)}" data-bounds-mm="${[b.x, b.y, b.width, b.height].join(",")}" aria-label="${escapeXml(value)}" fill="${color}" transform="translate(${shape.x} ${shape.y}) scale(${shape.scale})">${shape.glyphs.map((glyph) => `<path d="${glyph.d}" transform="translate(${glyph.x} 0)"/>`).join("")}</g>`;
}

function paragraph(
  value: string,
  x: number,
  y: number,
  width: number,
  size = 3.2,
  color = INK,
  leading = 4.5,
) {
  const lines: string[] = [];
  let line = "";
  for (const word of value.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    const metrics = measureLettering(candidate, "sans-serif");
    if ((metrics.width / metrics.units) * size > width && line) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  return {
    svg: lines
      .map((text, i) => label(text, x, y + i * leading, size, color))
      .join(""),
    nextY: y + lines.length * leading,
  };
}

function shell(
  model: KitGuideModel,
  page: number,
  title: string,
  content: string,
  pageCount = 2,
) {
  const header = [
    label("SLOW REVEAL STUDIO / MAKING TRIAL", 14, 16, 2.8, MUTED),
    label(title, 14, 29, 6.3, INK, "serif"),
    '<rect x="14" y="35" width="182" height="13" rx="1" fill="#f5e9dc"/>',
    label("DRAFT FOR PHYSICAL TRIAL - NOT APPROVED", 18, 40.5, 3.1, ACCENT),
    label(
      "Digital instructions and targets. Physical materials and completion remain unvalidated.",
      18,
      45.1,
      2.6,
      ACCENT,
    ),
    label(
      `Artwork: ${model.dimensions.widthMm} x ${model.dimensions.heightMm} mm | ${model.mode}`,
      14,
      55,
      3.1,
      MUTED,
    ),
    '<path d="M14 279 H196" stroke="#d8dcd7" stroke-width="0.25"/>',
    label(`${model.version} | ${model.rendererVersion}`, 14, 284, 2.3, MUTED),
    label(
      `A4 guide, not the production template | ${page} / ${pageCount}`,
      14,
      288,
      2.3,
      MUTED,
    ),
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${KIT_GUIDE_PAGE.widthMm}mm" height="${KIT_GUIDE_PAGE.heightMm}mm" viewBox="0 0 210 297" role="img" aria-label="${escapeXml(title)}"><title>${escapeXml(`Draft making guide: ${model.mode}, page ${page}`)}</title><metadata>${escapeXml(JSON.stringify({ version: model.version, rendererVersion: model.rendererVersion, status: model.status, mode: model.mode, page, units: "mm" }))}</metadata><rect width="210" height="297" fill="#ffffff"/>${header.join("")}${content}</svg>`;
}

function selectedGeometry(
  geometry: RenderGeometry,
  sample: KitGuideModel["sample"],
): RenderGeometry {
  return {
    ...geometry,
    settings: { ...geometry.settings, text: undefined },
    text: undefined,
    circles: sample.circleIndices.map((i) => geometry.circles[i]),
    cells: sample.cellIndices.map((i) => geometry.cells[i]),
    paths: sample.pathIndices.map((i) => geometry.paths[i]),
  };
}

function examplePanels(geometry: RenderGeometry, model: KitGuideModel) {
  const b = model.sample.boundsMm;
  const scale = Math.min(4, 82 / b.width, 58 / b.height);
  const sample = selectedGeometry(geometry, model.sample);
  const parts = [
    label("THE SAME SAVED MARKS, IN TWO VIEWS", 14, 183, 3.1, MUTED),
  ];
  for (const [index, variant] of (
    ["template", "finished"] as const
  ).entries()) {
    const x = 14 + index * 94,
      y = 194;
    const svg = toSvg(sample, variant, {
      background: false,
      title: `Selected ${variant} marks`,
    });
    const body = svg.slice(svg.indexOf(">") + 1, svg.lastIndexOf("</svg>"));
    const tx = x + (88 - b.width * scale) / 2,
      ty = y + (62 - b.height * scale) / 2;
    parts.push(
      label(
        variant === "template"
          ? "Printed guide (digital)"
          : "Filled / traced target (digital)",
        x,
        190,
        3,
      ),
    );
    parts.push(
      `<rect x="${x}" y="${y}" width="88" height="62" fill="${isOpticalMode(geometry.mode) || geometry.mode === "cross-stitch" ? "#ffffff" : geometry.settings.invert ? "#1e1e1c" : "#f8f5ef"}" stroke="#d8dcd7" stroke-width="0.25"/>`,
    );
    parts.push(
      `<g data-guide-example="${variant}" data-scale="${scale}" transform="translate(${tx} ${ty}) scale(${scale}) translate(${-b.x} ${-b.y})">${body}</g>`,
    );
  }
  parts.push(
    paragraph(
      `Selected whole marks, shown at about ${Math.round(scale * 100)}% of their artwork size on a 100% A4 print. Other marks and personal lettering are omitted. These are not hand-completed samples.`,
      14,
      262,
      182,
      2.8,
      MUTED,
      4,
    ).svg,
  );
  if (!sample.circles.length && !sample.cells.length && !sample.paths.length)
    parts.push(
      label("No artwork marks: resolve before packing.", 17, 223, 3, ACCENT),
    );
  return parts.join("");
}

function makingPage(
  geometry: RenderGeometry,
  model: KitGuideModel,
  pageCount = 2,
) {
  const parts = [
    paragraph(
      "For the trial participant: work on a small area first. The operator must supply and approve the trial materials before use.",
      14,
      65,
      182,
      3.1,
      MUTED,
    ).svg,
  ];
  let y = 82;
  model.steps.forEach((step, index) => {
    parts.push(label(`${index + 1}. ${step.title}`, 14, y, 4.2));
    const body = paragraph(step.body, 20, y + 6, 172, 3.3, INK, 4.5);
    parts.push(body.svg);
    y = Math.max(y + 23, body.nextY + 7);
  });
  if (y > 178)
    throw new Error("Kit guide making instructions exceed the sample area.");
  parts.push(examplePanels(geometry, model));
  return shell(model, 1, model.title, parts.join(""), pageCount);
}

function keyPage(
  model: KitGuideModel,
  separatePacking = false,
  legend = model.legend,
  page = 2,
  pageCount = 2,
) {
  const parts = [label("DIGITAL COLOUR KEY", 14, 66, 3.7)];
  parts.push(
    label(
      supportsPalette(model.mode)
        ? `Key / selected colour / ${model.mode === "mosaic" ? "cells" : "marks"} in this artwork`
        : "Selected artwork ink",
      14,
      73,
      3,
      MUTED,
    ),
  );
  let y = 80;
  for (const entry of legend) {
    parts.push(
      `<rect x="14" y="${y - 3.4}" width="7" height="5.8" rx="0.5" fill="${entry.color}" stroke="#9caaa0" stroke-width="0.2"/>`,
    );
    const text = `${entry.index === null ? "Single ink" : `Key ${entry.id}`}${entry.markerCode ? ` / pen ${entry.markerCode}` : ""}  ${entry.color}${supportsPalette(model.mode) ? `  |  ${entry.usedCellCount} ${model.mode === "mosaic" ? "cells" : "marks"}${entry.usedCellCount ? "" : " (unused)"}` : ""}`;
    parts.push(label(text, 25, y + 0.8, 3.4));
    y += 8;
  }
  y += 3;
  const keyNote = paragraph(
    (model.markerProfile
      ? `Reference set: ${model.markerProfile.label}. `
      : "") +
      (model.mode === "cross-stitch"
        ? `Key 0 means leave blank: ${model.blankCellCount ?? 0} crosses need no pen. These digital swatches are unverified. Assign and test the physical markers before the trial.`
        : "Blank canvas is not an additional numbered colour. These screen/print swatches do not verify a marker match. Assign physical markers by the key before the trial."),
    14,
    y,
    182,
    3,
    MUTED,
    4.2,
  );
  parts.push(keyNote.svg);
  if (separatePacking)
    return shell(model, page, "Colour key", parts.join(""), pageCount);
  parts.push(packingSection(model, Math.max(120, keyNote.nextY + 9)));
  return shell(model, 2, "Colour key & trial materials", parts.join(""));
}

function packingSection(
  model: KitGuideModel,
  y: number,
  materials = model.materials,
) {
  const parts = [label("OPERATOR: PACKING REQUIREMENTS", 14, y, 3.7)];
  y += 6;
  parts.push(
    label(
      "Unconfirmed items. This list is not a packing or product approval record.",
      14,
      y,
      3,
      ACCENT,
    ),
  );
  y += 8;
  for (const item of materials) {
    parts.push(
      `<rect x="14" y="${y - 2.5}" width="3" height="3" fill="none" stroke="#59615a" stroke-width="0.3"/>`,
    );
    const row = paragraph(item.label, 20, y, 175, 2.9, INK, 4.2);
    parts.push(row.svg);
    y = row.nextY + 3;
  }
  if (y > 254)
    throw new Error("Kit guide packing requirements exceed their page area.");
  parts.push(label("BEFORE APPROVING PHYSICAL INSTRUCTIONS", 14, 258, 3.3));
  parts.push(
    paragraph(
      "Record marker assignments, coverage and handling; test guide readability, comfort and first-time understanding. Supplier handling and drying guidance still needs review. No drying time or pen quantity is claimed here.",
      14,
      265,
      182,
      2.9,
      MUTED,
      4.2,
    ).svg,
  );
  return parts.join("");
}

/** Paginate larger palettes without shrinking their keys or packing checklists. */
export function kitGuidePages(geometry: RenderGeometry): string[] {
  const model = buildKitGuide(geometry);
  if (model.legend.length <= 8)
    return [makingPage(geometry, model), keyPage(model)];
  const keyPageCount = Math.ceil(model.legend.length / 16);
  const packingPageCount = Math.ceil(model.materials.length / 18);
  const pageCount = 1 + keyPageCount + packingPageCount;
  return [
    makingPage(geometry, model, pageCount),
    ...Array.from({ length: keyPageCount }, (_, i) =>
      keyPage(
        model,
        true,
        model.legend.slice(i * 16, (i + 1) * 16),
        i + 2,
        pageCount,
      ),
    ),
    ...Array.from({ length: packingPageCount }, (_, i) =>
      shell(
        model,
        2 + keyPageCount + i,
        "Trial materials",
        packingSection(model, 66, model.materials.slice(i * 18, (i + 1) * 18)),
        pageCount,
      ),
    ),
  ];
}
