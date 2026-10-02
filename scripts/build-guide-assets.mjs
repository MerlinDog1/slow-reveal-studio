// Public licensed examples only. Run: node --import tsx scripts/build-guide-assets.mjs
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import renderer from "../lib/renderers/index.ts";

const { DEFAULT_SETTINGS, renderImage, toSvg, RENDERER_VERSION } = renderer;
const destination = path.resolve("public/guides");
const provenance = JSON.parse(
  await readFile("public/references/manifest.json", "utf8"),
);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const records = [];
await mkdir(destination, { recursive: true });

async function fixture(id) {
  const reference = provenance.find((entry) => entry.id === id);
  assert.ok(reference, "Licensed reference exists");
  const bytes = await readFile(path.join("public", reference.file));
  assert.equal(hash(bytes), reference.sha256, "Reference provenance verified");
  return { reference, bytes };
}
async function imageFiles(id, bytes, metadata) {
  const derivatives = [];
  for (const width of [640, 1280]) {
    const output = await sharp(bytes)
      .resize({ width })
      .webp({ quality: 84, effort: 5 })
      .toBuffer();
    const info = await sharp(output).metadata();
    const file = `/guides/${id}-${width}.webp`;
    await writeFile(path.join("public", file), output);
    derivatives.push({
      file,
      width: info.width,
      height: info.height,
      bytes: output.length,
      sha256: hash(output),
    });
  }
  records.push({ id, ...metadata, derivatives });
}
async function geometryFor(bytes, text) {
  const { data, info } = await sharp(bytes)
    .resize(800, 1000, { fit: "cover" })
    .flatten({ background: "#ffffff" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = {
    data: new Uint8ClampedArray(data),
    width: info.width,
    height: info.height,
  };
  const settings = {
    ...DEFAULT_SETTINGS,
    guideOpacity: 0.45,
    guideWidthMm: 0.2,
    ...(text ? { text } : {}),
  };
  const geometry = renderImage(pixels, settings);
  assert.deepEqual(
    geometry,
    renderImage(pixels, settings),
    "Example geometry is deterministic",
  );
  return geometry;
}
const pet = await fixture("light-pet");
for (const [id, crop] of [
  ["wide", null],
  ["closer", { left: 320, top: 990, width: 850, height: 1062 }],
]) {
  let source = sharp(pet.bytes).autoOrient();
  if (crop) source = source.extract(crop);
  const bytes = await source
    .resize(800, 1000, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();
  const geometry = await geometryFor(bytes);
  const metadata = {
    source: pet.reference,
    crop,
    cropMode: "centre cover to 4:5 after optional extraction",
    isPhysicalEvidence: false,
  };
  await imageFiles(`photo-${id}`, bytes, {
    ...metadata,
    kind: "licensed-photo-crop",
  });
  await imageFiles(`dots-${id}`, Buffer.from(toSvg(geometry, "finished")), {
    ...metadata,
    kind: "digital-rendering",
    rendererVersion: RENDERER_VERSION,
    geometrySha256: hash(JSON.stringify(geometry)),
  });
  await writeFile(
    path.join(destination, `dots-${id}-geometry.json`),
    JSON.stringify(geometry),
  );
}
const dog = await fixture("black-dog");
const geometry = await geometryFor(dog.bytes, {
  value: "Always by my side",
  fontFamily: "serif",
  sizeMm: 8,
  placement: "bottom-center",
});
assert.equal(geometry.text?.value, "Always by my side");
await writeFile(
  path.join(destination, "personalisation-geometry.json"),
  JSON.stringify(geometry),
);
for (const variant of ["finished", "template"]) {
  const svg = toSvg(geometry, variant);
  assert.ok(
    svg.includes('data-lettering="outlines"'),
    "Example lettering uses production outline serializer",
  );
  await writeFile(
    path.join(destination, `personalisation-${variant}.svg`),
    svg,
  );
  await imageFiles(`personalisation-${variant}`, Buffer.from(svg), {
    source: dog.reference,
    kind: "digital-rendering",
    isPhysicalEvidence: false,
    caption: "Digital renderer example. Sample wording; not a customer result.",
    rendererVersion: RENDERER_VERSION,
    geometrySha256: hash(JSON.stringify(geometry)),
  });
}
await writeFile(
  path.join(destination, "manifest.json"),
  `${JSON.stringify({ schemaVersion: 1, assets: records }, null, 2)}\n`,
);
console.log(
  `Built ${records.length} licensed guide specimens with 640/1280 WebP derivatives.`,
);
