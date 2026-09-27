// Rebuild only licensed digital marketing studies: node --import tsx scripts/build-marketing-assets.mjs
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import rendererModule from "../lib/renderers/index.ts";
import catalogueModule from "../lib/catalog.ts";
const { DEFAULT_SETTINGS, RENDERER_VERSION, renderImage, toSvg } =
  rendererModule;
const { INKS } = catalogueModule;

const out = path.resolve("public/marketing");
const digital = path.join(out, "digital");
await mkdir(digital, { recursive: true });
const sources = JSON.parse(
  await readFile("public/references/manifest.json", "utf8"),
);
const records = [];
const sha = (data) => createHash("sha256").update(data).digest("hex");
const escape = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const svgBody = (svg) => svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
const layout = {
  width: 2200,
  height: 930,
  panelWidth: 496,
  panelHeight: 620,
  gap: 40,
  left: 48,
  top: 174,
};
function textLayer(title, subtitle, labels, footer) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}"><text x="48" y="65" font-family="Georgia,serif" font-size="42" fill="#1e1e1c">${escape(title)}</text><text x="48" y="109" font-family="Arial,sans-serif" font-size="21" fill="#665e54">${escape(subtitle)}</text>${labels.map((label, i) => `<text x="${layout.left + i * (layout.panelWidth + layout.gap)}" y="153" font-family="Arial,sans-serif" font-size="20" fill="#1e1e1c">${escape(label)}</text>`).join("")}<text x="48" y="844" font-family="Arial,sans-serif" font-size="19" fill="#665e54">${escape(footer)}</text><text x="48" y="885" font-family="Arial,sans-serif" font-size="19" fill="#665e54">Digital rendering · simulated completion · physical samples remain unvalidated.</text></svg>`,
  );
}
async function canvasImage(svg) {
  return sharp(Buffer.from(svg))
    .resize(layout.panelWidth, layout.panelHeight, { fit: "fill" })
    .png()
    .toBuffer();
}
async function sourceAndGeometry(id, mode, patch = {}) {
  const source = sources.find((s) => s.id === id);
  assert.ok(source, `Licensed fixture ${id} exists`);
  const bytes = await readFile(path.join("public", source.file));
  assert.equal(sha(bytes), source.sha256, "Source provenance hash matches");
  const { data, info } = await sharp(bytes)
    .autoOrient()
    .resize(800, 1000, { fit: "cover", position: "centre" })
    .flatten({ background: "#ffffff" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const settings = {
    ...DEFAULT_SETTINGS,
    mode,
    guideWidthMm: 0.3,
    guideOpacity: 0.5,
    ...patch,
  };
  const input = {
    data: new Uint8ClampedArray(data),
    width: info.width,
    height: info.height,
  };
  const geometry = renderImage(input, settings);
  assert.deepEqual(
    geometry,
    renderImage(input, settings),
    "Deterministic geometry",
  );
  const cropped = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
  return { source, geometry, cropped };
}
async function saveStudy(id, title, sourceId, mode, patch = {}) {
  const { source, geometry, cropped } = await sourceAndGeometry(
    sourceId,
    mode,
    patch,
  );
  const half = {
    ...geometry,
    circles: geometry.circles.filter((c) => c.x < geometry.widthMm / 2),
    cells: geometry.cells.filter(
      (c) => c.x + c.width / 2 < geometry.widthMm / 2,
    ),
    paths: geometry.paths.filter(
      (p) =>
        p.points.reduce((sum, point) => sum + point.x, 0) / p.points.length <
        geometry.widthMm / 2,
    ),
  };
  for (const key of ["circles", "cells", "paths"])
    assert.ok(
      half[key].every((mark) => geometry[key].includes(mark)),
      "Progress uses exact full-geometry marks",
    );
  const template = toSvg(geometry, "template");
  const finished = toSvg(geometry, "finished");
  const progress = template.replace(
    "</svg>",
    `${svgBody(toSvg(half, "finished", { background: false }))}</svg>`,
  );
  const imagePanels = [
    await sharp(cropped)
      .resize(layout.panelWidth, layout.panelHeight)
      .png()
      .toBuffer(),
    await canvasImage(template),
    await canvasImage(progress),
    await canvasImage(finished),
  ];
  const key = geometry.settings.palette
    ? ` Palette: ${geometry.settings.palette.join(", ")}; template numbers map in that order.`
    : "";
  const composite = imagePanels.map((input, i) => ({
    input,
    left: layout.left + i * (layout.panelWidth + layout.gap),
    top: layout.top,
  }));
  const subtitle = geometry.settings.palette
    ? "One geometry snapshot. Colour key: 1 Ink / 2 Brown / 3 Sage / 4 Ochre (illustrative screen colours)."
    : "One source. One geometry snapshot. Four stages of the making idea.";
  composite.push({
    input: textLayer(
      title,
      subtitle,
      [
        "01  Source photograph",
        "02  Circle guide / template".replace(
          "Circle guide",
          mode === "dots"
            ? "Circle guide"
            : mode === "mosaic"
              ? "Cell guide"
              : "Trace guide",
        ),
        "03  Simulated partial completion",
        "04  Finished digital preview",
      ],
      `Photo: ${source.author} / Unsplash. Licensed fixture; not a customer result.`,
    ),
    left: 0,
    top: 0,
  });
  const file = `${id}-digital.png`;
  await sharp({
    create: {
      width: layout.width,
      height: layout.height,
      channels: 3,
      background: "#f4efe6",
    },
  })
    .composite(composite)
    .png()
    .toFile(path.join(out, file));
  await writeFile(path.join(digital, `${id}-template.svg`), template);
  await writeFile(path.join(digital, `${id}-progress.svg`), progress);
  await writeFile(path.join(digital, `${id}-finished.svg`), finished);
  await writeFile(
    path.join(digital, `${id}-geometry.json`),
    JSON.stringify(geometry),
  );
  await writeFile(path.join(digital, `${id}-source.png`), cropped);
  records.push({
    id,
    file: `/marketing/${file}`,
    alt: `${title}: the same licensed ${sourceId} source beside its ${mode} template, simulated partial completion and finished digital artwork.`,
    status: "renderer-digital-study",
    isPhysicalProductEvidence: false,
    requiredCaption: "Digital rendering · simulated completion",
    generatedAt: "2026-09-27",
    tool: "shared TypeScript renderer + Sharp layout",
    rendererVersion: RENDERER_VERSION,
    sourceImages: [source.file],
    sourceAttribution: {
      author: source.author,
      source: source.source,
      license: source.license,
      licenseUrl: source.licenseUrl,
      sha256: source.sha256,
    },
    geometryFile: `/marketing/digital/${id}-geometry.json`,
    geometrySha256: sha(JSON.stringify(geometry)),
    deterministic: true,
    qa:
      "Template and finished stages serialize exactly one geometry. Partial stage overlays a strict subset of those marks on the complete guide; no AI-drawn replacement art." +
      key,
    licensing:
      "Derived from the attributed licensed reference photograph. No customer-result or endorsement claim.",
    reproduction: "node --import tsx scripts/build-marketing-assets.mjs",
  });
}

await saveStudy("dots-progression", "One dot at a time.", "black-dog", "dots");
await saveStudy(
  "mosaic-progression",
  "Small shapes. A bigger picture.",
  "building",
  "mosaic",
  {
    spacingMm: 5.5,
    maxDiameterMm: 5,
    cellShape: "rounded",
    palette: ["#1e1e1c", "#68442f", "#7b8b77", "#c6a25a"],
  },
);
await saveStudy(
  "contour-progression",
  "Follow the lines that matter.",
  "vehicle",
  "contour",
  { spacingMm: 3.5, edgeEmphasis: 0.4 },
);

const { source, geometry } = await sourceAndGeometry("black-dog", "dots");
const colours = INKS.map((ink) => ({
  ...geometry,
  settings: { ...geometry.settings, inkColor: ink.color },
}));
for (const g of colours)
  assert.deepEqual(
    g.circles,
    geometry.circles,
    "Colour views preserve exact circle geometry",
  );
const panels = await Promise.all(
  colours.map((g) => canvasImage(toSvg(g, "finished"))),
);
const overlay = panels.map((input, i) => ({
  input,
  left: layout.left + i * (layout.panelWidth + layout.gap),
  top: layout.top,
}));
overlay.push({
  input: textLayer(
    "A colour that feels like you.",
    "Identical marks in four proposed marker colours. Screen colours do not certify pigment or coverage.",
    INKS.map((ink) => ink.label),
    `Photo: ${source.author} / Unsplash. Material swatches and colour approval remain outstanding.`,
  ),
  left: 0,
  top: 0,
});
await sharp({
  create: {
    width: layout.width,
    height: layout.height,
    channels: 3,
    background: "#f4efe6",
  },
})
  .composite(overlay)
  .png()
  .toFile(path.join(out, "colour-options-digital.png"));
await writeFile(
  path.join(digital, "colour-options-geometry.json"),
  JSON.stringify(geometry),
);
records.push({
  id: "colour-options",
  file: "/marketing/colour-options-digital.png",
  alt: "The same black-dog dot portrait geometry rendered in soft black, deep navy, warm sepia and forest green.",
  status: "renderer-digital-study",
  isPhysicalProductEvidence: false,
  requiredCaption: "Digital rendering · screen colours are illustrative",
  generatedAt: "2026-09-27",
  tool: "shared TypeScript renderer + Sharp layout",
  rendererVersion: RENDERER_VERSION,
  sourceImages: [source.file],
  sourceAttribution: {
    author: source.author,
    source: source.source,
    license: source.license,
    licenseUrl: source.licenseUrl,
    sha256: source.sha256,
  },
  geometryFile: "/marketing/digital/colour-options-geometry.json",
  geometrySha256: sha(JSON.stringify(geometry)),
  palette: INKS,
  deterministic: true,
  qa: "All four variants retain exactly the same circle coordinates/radii. No physical marker appearance, metallic reflectance or material result is claimed.",
  licensing:
    "Derived from the attributed licensed reference photograph. No customer-result or endorsement claim.",
  reproduction: "node --import tsx scripts/build-marketing-assets.mjs",
});
for (const record of records) {
  const bytes = await readFile(path.join("public", record.file));
  const meta = await sharp(bytes).metadata();
  Object.assign(record, {
    width: meta.width,
    height: meta.height,
    sha256: sha(bytes),
    bytes: bytes.length,
  });
}
await writeFile(
  path.join(out, "digital-studies.json"),
  JSON.stringify(records, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    records.map(({ id, file, width, height, geometrySha256 }) => ({
      id,
      file,
      width,
      height,
      geometrySha256,
    })),
    null,
    2,
  ),
);
