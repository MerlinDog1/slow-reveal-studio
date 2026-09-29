// After rebuilding digital assets: node scripts/update-marketing-manifest.mjs
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
const dir = "public/marketing";
const existing = JSON.parse(
  await readFile(path.join(dir, "manifest.json"), "utf8"),
);
const additional = JSON.parse(
  await readFile(path.join(dir, "generated-additional.json"), "utf8"),
);
const digital = JSON.parse(
  await readFile(path.join(dir, "digital-studies.json"), "utf8"),
);
const presentation = JSON.parse(
  await readFile(path.join(dir, "generated-presentation.json"), "utf8"),
);
const slots = [
  "home-hero",
  "dots-progression",
  "dots-hand-detail",
  "dots-guide-macro",
  "kit-flatlay",
  "finished-in-home",
  "example-pet",
  "example-couple",
  "example-place",
  "mosaic-progression",
  "contour-progression",
  "lines-progression",
  "size-comparison",
  "colour-options",
  "family-making",
  "macaw-on-wall",
];
const map = new Map();
for (const asset of [
  ...existing.assets,
  ...additional,
  ...digital,
  ...presentation,
]) {
  map.set(asset.id, { ...map.get(asset.id), ...asset });
}
const assets = [];
for (const id of slots) {
  const asset = map.get(id);
  assert.ok(asset, `Slot ${id} is populated`);
  const bytes = await readFile(path.join("public", asset.file));
  const meta = await sharp(bytes).metadata();
  assert.ok(meta.width && meta.height);
  assert.equal(asset.isPhysicalProductEvidence, false);
  const sourceSha256 = createHash("sha256").update(bytes).digest("hex");
  // Preserve matching responsive versions; a changed original invalidates old derivative metadata.
  const derivatives = asset.derivatives?.filter(
    (derivative) => derivative.sourceSha256 === sourceSha256,
  );
  assets.push({
    ...asset,
    width: meta.width,
    height: meta.height,
    sha256: sourceSha256,
    bytes: bytes.length,
    ...(derivatives ? { derivatives } : {}),
  });
}
const manifest = {
  schemaVersion: 2,
  assets,
  outstandingSlots: [],
  conceptSlotCoverage:
    "16 of 16 populated: 12 generated concepts + 4 deterministic renderer studies; additional mode comparisons have their own reveal/manifest.json",
  realProductionPhotographyStatus: "pending physical kit validation",
  ...(existing.optimisation ? { optimisation: existing.optimisation } : {}),
  updateCommands: [
    "node --import tsx scripts/build-marketing-assets.mjs",
    "node scripts/update-marketing-manifest.mjs",
    "node scripts/optimise-marketing-assets.mjs",
  ],
};
await writeFile(
  path.join(dir, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    slots: assets.length,
    generated: assets.filter((a) => a.status === "generated-concept").length,
    digital: assets.filter((a) => a.status === "renderer-digital-study").length,
    bytes: assets.reduce((sum, a) => sum + a.bytes, 0),
    rendererVersions: [...new Set(digital.map((a) => a.rendererVersion))],
  }),
);
