// Resize/encode only; original artwork and image files are preserved unchanged.
// Run from repository root: node scripts/optimise-marketing-assets.mjs
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const manifestPath = "public/marketing/manifest.json";
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const destination = "public/marketing/web";
await mkdir(destination, { recursive: true });
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
for (const asset of manifest.assets) {
  assert.match(asset.id, /^[a-z0-9-]+$/);
  const source = await readFile(path.join("public", asset.file));
  const sourceSha256 = sha(source);
  assert.equal(
    sourceSha256,
    asset.sha256,
    `${asset.id}: original matches manifest`,
  );
  asset.derivatives = [];
  for (const width of [640, 1280]) {
    const file = `/marketing/web/${asset.id}-${width}.webp`;
    const bytes = await sharp(source)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 80, effort: 5 })
      .toBuffer();
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, width);
    assert.ok(
      Math.abs(metadata.width / metadata.height - asset.width / asset.height) <
        0.008,
      "Aspect ratio retained within pixel rounding",
    );
    await writeFile(path.join("public", file), bytes);
    asset.derivatives.push({
      file,
      format: "webp",
      width: metadata.width,
      height: metadata.height,
      quality: 80,
      bytes: bytes.length,
      sha256: sha(bytes),
      sourceSha256,
    });
  }
  assert.equal(
    sha(await readFile(path.join("public", asset.file))),
    sourceSha256,
    "Original preserved",
  );
}
manifest.optimisation = {
  command: "node scripts/optimise-marketing-assets.mjs",
  format: "webp",
  widths: [640, 1280],
  quality: 80,
  semanticChanges: false,
  originalsPreserved: true,
};
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
const originals = manifest.assets.reduce((sum, asset) => sum + asset.bytes, 0);
const totals = [640, 1280].map((width) => ({
  width,
  files: manifest.assets.length,
  bytes: manifest.assets.reduce(
    (sum, asset) =>
      sum + asset.derivatives.find((d) => d.width === width).bytes,
    0,
  ),
}));
console.log(
  JSON.stringify(
    { originals, derivatives: totals, totalFiles: manifest.assets.length * 2 },
    null,
    2,
  ),
);
