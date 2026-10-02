import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  buildKitGuide,
  kitGuidePages,
  KIT_GUIDE_VERSION,
} from "../lib/kit-guide";
import { RENDERER_VERSION } from "../lib/renderers";
import { ARTWORK_PDF_VERSION } from "../lib/artwork-pdf";

const hash = (data: Uint8Array) =>
  createHash("sha256").update(data).digest("hex");

test("the eight-page guide artifact preserves all four modes, current source hashes and exact A4 pages", async () => {
  const manifest = JSON.parse(
    await readFile("output/pdf/srs-kit-guide-drafts-manifest.json", "utf8"),
  );
  assert.equal(manifest.kitGuideVersion, KIT_GUIDE_VERSION);
  assert.equal(manifest.rendererVersion, RENDERER_VERSION);
  assert.equal(manifest.pdfVersion, ARTWORK_PDF_VERSION);
  assert.equal(manifest.physicalValidation, "NOT PERFORMED");
  assert.equal(manifest.status, "draft-for-physical-trial");
  assert.equal(manifest.page.count, 8);
  assert.equal(manifest.page.widthMm, 210);
  assert.equal(manifest.page.heightMm, 297);
  assert.equal(manifest.page.dpi, 300);
  assert.deepEqual(
    manifest.modes.map((mode: { mode: string }) => mode.mode),
    ["dots", "mosaic", "contour", "line-amplification"],
  );
  for (const source of manifest.sources)
    assert.equal(hash(await readFile(source.file)), source.sha256, source.file);
  assert.equal(
    hash(await readFile(`public${manifest.source.file}`)),
    manifest.source.sha256,
  );
  for (const entry of manifest.artifacts) {
    const bytes = await readFile(entry.file);
    assert.equal(bytes.length, entry.bytes, entry.file);
    assert.equal(hash(bytes), entry.sha256, entry.file);
  }
  for (const [i, mode] of manifest.modes.entries()) {
    assert.equal(mode.firstPage, i * 2 + 1);
    assert.equal(mode.lastPage, i * 2 + 2);
    const geometry = JSON.parse(await readFile(mode.geometry.file, "utf8"));
    const model = JSON.parse(await readFile(mode.model.file, "utf8"));
    assert.deepEqual(model, buildKitGuide(geometry));
    const pages = kitGuidePages(geometry);
    for (const [index, svg] of pages.entries()) {
      assert.equal(
        await readFile(
          `output/pdf/srs-kit-guide-drafts/${mode.mode}-page-${index + 1}.svg`,
          "utf8",
        ),
        svg,
      );
      assert.doesNotMatch(svg, /<text\b/);
      assert.match(svg, /DRAFT FOR PHYSICAL TRIAL - NOT APPROVED/);
    }
  }
  const pdf = (await readFile(manifest.pdf.file)).toString("latin1");
  assert.equal((pdf.match(/\/Type \/Page\b/g) ?? []).length, 8);
  const boxes = [
    ...pdf.matchAll(/\/MediaBox \[([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)\]/g),
  ];
  assert.equal(boxes.length, 8);
  for (const box of boxes) {
    assert.equal(Number(box[1]), 0);
    assert.equal(Number(box[2]), 0);
    assert.ok(Math.abs(Number(box[3]) - (210 / 25.4) * 72) < 0.00001);
    assert.ok(Math.abs(Number(box[4]) - (297 / 25.4) * 72) < 0.00001);
  }
});
