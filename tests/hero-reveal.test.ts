import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";
import {
  REVEAL_DURATION_MS,
  revealedCount,
  type HeroRevealData,
} from "../lib/hero-reveal";
import {
  renderImage,
  toSvg,
  RENDERER_VERSION,
  type RenderGeometry,
} from "../lib/renderers";

test("hero sequence contains every real Colour Blend mark exactly once and exports the same image", async () => {
  const root = "public/hero";
  const manifest = JSON.parse(await readFile(`${root}/manifest.json`, "utf8"));
  const geometry: RenderGeometry = JSON.parse(
    await readFile(`${root}/macaw-geometry.json`, "utf8"),
  );
  const animation: HeroRevealData = JSON.parse(
    await readFile(`${root}/macaw-dots.json`, "utf8"),
  );
  const source = await readFile(`public${manifest.source.file}`);
  const hash = (bytes: Buffer) =>
    createHash("sha256").update(bytes).digest("hex");
  assert.equal(hash(source), manifest.source.sha256);
  assert.equal(manifest.rendererVersion, RENDERER_VERSION);
  assert.equal(manifest.isPhysicalProductEvidence, false);
  assert.equal(manifest.source.generated, true);
  assert.equal(geometry.mode, "colour-blend");
  assert.equal(animation.palette.length, 16);
  assert.deepEqual(animation.palette, geometry.settings.palette);
  assert.equal(animation.width, geometry.widthMm);
  assert.equal(animation.height, geometry.heightMm);
  const fromGeometry = geometry.cells
    .map((cell) =>
      JSON.stringify([
        cell.x + cell.width / 2,
        cell.y + cell.height / 2,
        cell.width / 2,
        Number(cell.label) - 1,
      ]),
    )
    .sort();
  const sequence = animation.dots.map((dot) => JSON.stringify(dot)).sort();
  assert.deepEqual(sequence, fromGeometry);
  assert.equal(new Set(sequence).size, sequence.length);
  assert.equal(sequence.length, manifest.markCount);
  assert.ok(
    sequence.length >= 50_000 && sequence.length <= 60_000,
    "retain the fine-detail study within the renderer's mark limit",
  );
  const { data, info } = await sharp(source)
    .resize(800, 1000, { fit: "cover" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.deepEqual(
    renderImage(
      {
        data: new Uint8ClampedArray(data),
        width: info.width,
        height: info.height,
      },
      geometry.settings,
    ),
    geometry,
  );
  for (const variant of ["finished", "template"] as const)
    assert.equal(
      await readFile(`${root}/macaw-${variant}.svg`, "utf8"),
      toSvg(geometry, variant),
    );
  for (const [name, descriptor] of Object.entries(manifest.files) as [
    string,
    { sha256: string; bytes: number },
  ][]) {
    const bytes = await readFile(`${root}/${name}`);
    assert.equal(hash(bytes), descriptor.sha256, name);
    assert.equal(bytes.length, descriptor.bytes, name);
  }
});

test("the reveal timeline is bounded, monotonic, starts slowly and reaches every mark", () => {
  const total = 52312;
  assert.equal(revealedCount(-100, total), 0);
  assert.equal(revealedCount(0, total), 0);
  let previous = 0;
  for (let ms = 0; ms <= REVEAL_DURATION_MS; ms += 16) {
    const count = revealedCount(ms, total);
    assert.ok(Number.isInteger(count) && count >= previous && count <= total);
    previous = count;
  }
  assert.ok(revealedCount(1000, total) < total * 0.01);
  assert.equal(revealedCount(REVEAL_DURATION_MS, total), total);
  assert.equal(revealedCount(REVEAL_DURATION_MS * 2, total), total);
});
