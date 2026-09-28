import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { DEFAULT_SETTINGS, renderImage } from "../lib/renderers";
import { prototypeKitFiles, type KitRasterizer } from "../lib/prototype-kit";

const hash = (data: Uint8Array | string) =>
  createHash("sha256").update(data).digest("hex");
const rasterize: KitRasterizer = async (svg, width, height, dpi) => {
  const sized = svg.replace(
    /width="210mm" height="297mm"/,
    `width="${width}px" height="${height}px"`,
  );
  const png = await sharp(Buffer.from(sized), { density: 72 })
    .withMetadata({ density: dpi })
    .png()
    .toBuffer();
  return new Blob([new Uint8Array(png)], { type: "image/png" });
};

test("local kit files bind exact geometry, record actual hashes and keep material assignments unresolved", async () => {
  const data = new Uint8ClampedArray(64 * 80 * 4);
  for (let i = 0; i < 64 * 80; i++)
    data.set(i % 2 ? [30, 80, 120, 255] : [170, 100, 60, 255], i * 4);
  const geometry = renderImage(
    { data, width: 64, height: 80 },
    {
      ...DEFAULT_SETTINGS,
      mode: "mosaic",
      widthMm: 120,
      heightMm: 160,
      spacingMm: 7,
      maxDiameterMm: 6.4,
      palette: ["#1e1e1c", "#445e7c", "#b97a68"],
      text: { value: "PRIVATE-PERSONAL-TEXT" },
    },
  );
  const before = JSON.stringify(geometry);
  const output = await prototypeKitFiles(geometry, rasterize);
  assert.equal(JSON.stringify(geometry), before);
  assert.equal(output.manifest.status, "draft-for-physical-trial");
  assert.equal(output.manifest.geometrySha256, hash(before));
  assert.equal(output.manifest.pages, 2);
  assert.equal(output.manifest.dpi, 300);
  for (const file of output.files) {
    const bytes = new Uint8Array(await file.blob.arrayBuffer());
    assert.equal(output.manifest.files[file.key].bytes, bytes.length);
    assert.equal(output.manifest.files[file.key].sha256, hash(bytes));
    assert.equal(output.manifest.files[file.key].mime, file.blob.type);
    assert.equal(
      Buffer.from(bytes).includes(Buffer.from("PRIVATE-PERSONAL-TEXT")),
      false,
      file.path,
    );
  }
  const read = async (key: string) =>
    output.files.find((file) => file.key === key)!.blob.text();
  const model = JSON.parse(await read("guideModel"));
  assert.equal(model.geometrySha256, hash(before));
  assert.deepEqual(
    model.guide.legend.map((entry: { id: string; color: string }) => [
      entry.id,
      entry.color,
    ]),
    geometry.settings.palette!.map((color, i) => [String(i + 1), color]),
  );
  const packing = JSON.parse(await read("packingListJson"));
  assert.equal(packing.source, "unpaid-local-prototype");
  assert.equal(packing.orderId, undefined);
  assert.ok(
    packing.materials.every(
      (item: Record<string, unknown>) =>
        item.assignmentStatus === "unresolved" &&
        item.sku === null &&
        item.lot === null &&
        item.quantity === null &&
        item.packed === false,
    ),
  );
  const pdf = await read("makingGuidePdf");
  assert.match(pdf, /^%PDF-/);
  assert.match(pdf, /\/Count 2\b/);
  for (const key of ["guidePage1", "guidePage2"])
    assert.match(await read(key), /width="210mm" height="297mm"/);
  const repeat = await prototypeKitFiles(geometry, rasterize);
  assert.deepEqual(repeat.manifest, output.manifest);
});

test("invalid colour assignments fail before any local kit raster work", async () => {
  const data = new Uint8ClampedArray(32 * 32 * 4).fill(255);
  const geometry = renderImage(
    { data, width: 32, height: 32 },
    { ...DEFAULT_SETTINGS, mode: "mosaic", palette: ["#000000", "#ffffff"] },
  );
  geometry.cells.push({
    x: 10,
    y: 10,
    width: 5,
    height: 5,
    label: "9",
    color: "#000000",
  });
  let calls = 0;
  await assert.rejects(
    prototypeKitFiles(geometry, async () => {
      calls++;
      throw new Error("Rasterizer must not run");
    }),
    /palette|colour|label/,
  );
  assert.equal(calls, 0);
});
