import assert from "node:assert/strict";
import test from "node:test";
import {
  hashBlob,
  paintMaskStroke,
  snapshotSubjectMaskDraft,
} from "../lib/browser-subject-mask";
import {
  decodeSubjectMaskData,
  maskRasterDimensions,
  type SubjectMaskBinding,
} from "../lib/subject-mask";

test("fast horizontal and diagonal brush segments remain continuous between sparse pointer events", () => {
  const width = 64,
    height = 64;
  const horizontal = new Uint8Array(width * height);
  paintMaskStroke(
    horizontal,
    width,
    height,
    { x: 3, y: 25 },
    { x: 60, y: 25 },
    1.25,
    "keep",
  );
  for (let x = 3; x <= 60; x++) assert.equal(horizontal[25 * width + x], 255);
  for (let x = 0; x < width; x++) assert.equal(horizontal[28 * width + x], 0);
  const diagonal = new Uint8Array(width * height);
  paintMaskStroke(
    diagonal,
    width,
    height,
    { x: 2, y: 2 },
    { x: 61, y: 61 },
    1.25,
    "keep",
  );
  for (let n = 2; n <= 61; n++) assert.equal(diagonal[n * width + n], 255);
  assert.equal(diagonal[2 * width + 61], 0);
  const reversed = new Uint8Array(width * height);
  paintMaskStroke(
    reversed,
    width,
    height,
    { x: 61, y: 61 },
    { x: 2, y: 2 },
    1.25,
    "keep",
  );
  assert.deepEqual(
    reversed,
    diagonal,
    "Stroke direction does not change coverage.",
  );
  const split = new Uint8Array(width * height);
  paintMaskStroke(
    split,
    width,
    height,
    { x: 2, y: 2 },
    { x: 30, y: 30 },
    1.25,
    "keep",
  );
  paintMaskStroke(
    split,
    width,
    height,
    { x: 30, y: 30 },
    { x: 61, y: 61 },
    1.25,
    "keep",
  );
  assert.deepEqual(
    split,
    diagonal,
    "Extra collinear pointer events do not change the selection.",
  );
});

test("remove erases only the brush footprint and leaves partial alpha elsewhere intact", () => {
  const width = 32,
    height = 32;
  const alpha = new Uint8Array(width * height).fill(127);
  paintMaskStroke(
    alpha,
    width,
    height,
    { x: 4, y: 16 },
    { x: 27, y: 16 },
    3,
    "remove",
  );
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const nearestX = Math.max(4, Math.min(27, x));
      const erased = (x - nearestX) ** 2 + (y - 16) ** 2 <= 9;
      assert.equal(alpha[y * width + x], erased ? 0 : 127, `Pixel ${x},${y}`);
    }
  paintMaskStroke(
    alpha,
    width,
    height,
    { x: 16, y: 16 },
    { x: 16, y: 16 },
    1,
    "keep",
  );
  assert.equal(alpha[16 * width + 16], 255);
  assert.equal(alpha[16 * width + 18], 0);
});

test("corner brush clips to the raster without overwriting adjacent backing bytes", () => {
  const backing = new Uint8Array(16 * 16 + 2).fill(73);
  const alpha = backing.subarray(1, backing.length - 1);
  alpha.fill(0);
  paintMaskStroke(alpha, 16, 16, { x: 0, y: 0 }, { x: 0, y: 0 }, 5, "keep");
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++)
      assert.equal(alpha[y * 16 + x], x * x + y * y <= 25 ? 255 : 0);
  assert.equal(backing[0], 73);
  assert.equal(backing.at(-1), 73);
  const maximum = new Uint8Array(512 * 512);
  paintMaskStroke(
    maximum,
    512,
    512,
    { x: 0, y: 0 },
    { x: 511, y: 511 },
    512,
    "keep",
  );
  assert.ok(maximum.every((value) => value === 255));
});

test("invalid dimensions, payload types, coordinates and actions fail before modifying the draft", () => {
  const alpha = new Uint8Array(16).fill(12);
  const initial = alpha.slice();
  type BrushArgs = Parameters<typeof paintMaskStroke>;
  const valid: BrushArgs = [
    alpha,
    4,
    4,
    { x: 1, y: 1 },
    { x: 2, y: 2 },
    1,
    "keep",
  ];
  const cases: [number, unknown][] = [
    [0, []],
    [0, new Uint8Array(15)],
    [0, new Float32Array(16)],
    [1, 0],
    [1, 4.5],
    [1, 513],
    [2, Infinity],
    [2, 513],
    [3, null],
    [3, { x: -1, y: 1 }],
    [3, { x: 1e300, y: 1 }],
    [4, { x: 2, y: NaN }],
    [4, { x: 4, y: 2 }],
    [5, 0],
    [5, -1],
    [5, 513],
    [5, Infinity],
    [6, "paint"],
  ];
  for (const [index, value] of cases) {
    const args = [...valid];
    args[index] = value as never;
    assert.throws(
      () => paintMaskStroke(...(args as BrushArgs)),
      /Invalid mask brush dimensions/,
    );
    assert.deepEqual(alpha, initial);
  }
});

test("Apply snapshot is independent of the working pixels, undo copy and mutable caller binding", () => {
  const binding: SubjectMaskBinding = {
    sourceSha256: "a".repeat(64),
    crop: { zoom: 1, x: 0, y: 0, rotation: 0 },
    widthMm: 400,
    heightMm: 500,
  };
  const { width, height } = maskRasterDimensions(
    binding.widthMm,
    binding.heightMm,
  );
  const draft = new Uint8Array(width * height);
  paintMaskStroke(
    draft,
    width,
    height,
    { x: 100, y: 100 },
    { x: 200, y: 150 },
    10,
    "keep",
  );
  const undo = draft.slice();
  const applied = snapshotSubjectMaskDraft(draft, binding, 0.01);
  const encoded = applied.data;
  draft.fill(0);
  binding.crop.zoom = 2;
  binding.widthMm = 500;
  assert.equal(applied.data, encoded);
  assert.deepEqual(decodeSubjectMaskData(applied), undo);
  assert.equal(applied.crop.zoom, 1);
  assert.equal(applied.widthMm, 400);
  assert.notEqual(applied.crop, binding.crop);
  const restored = decodeSubjectMaskData(applied);
  restored.fill(0);
  assert.deepEqual(
    decodeSubjectMaskData(applied),
    undo,
    "Reopening then cancelling leaves the supplied mask intact.",
  );
  assert.throws(
    () => snapshotSubjectMaskDraft(new Uint8Array(1), binding, 0),
    /mask data/i,
  );
});

test("source binding hashes exact blob bytes locally, independent of the declared MIME type", async () => {
  const expected =
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
  assert.equal(
    await hashBlob(new Blob(["abc"], { type: "image/jpeg" })),
    expected,
  );
  assert.equal(
    await hashBlob(new Blob(["abc"], { type: "image/png" })),
    expected,
  );
  assert.notEqual(await hashBlob(new Blob(["abd"])), expected);
});
