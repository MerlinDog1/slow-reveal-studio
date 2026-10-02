import test from "node:test";
import assert from "node:assert/strict";
import { crc32 } from "node:zlib";
import sharp from "sharp";
import { withPngResolution } from "../lib/png-resolution";
import { svgToPng } from "../lib/export-artwork";

function chunks(bytes: Uint8Array) {
  const png = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const result: { type: string; data: Buffer; bytes: Buffer }[] = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    result.push({
      type: png.toString("ascii", offset + 4, offset + 8),
      data: png.subarray(offset + 8, offset + 8 + length),
      bytes: png.subarray(offset, offset + length + 12),
    });
    offset += length + 12;
  }
  return result;
}

async function samplePng(palette = false) {
  const pixels = Buffer.from([
    255, 0, 0, 0, 0, 128, 255, 96, 64, 255, 32, 255, 200, 80, 15, 150, 1, 2, 3,
    255, 255, 255, 255, 0,
  ]);
  const png = await sharp(pixels, { raw: { width: 3, height: 2, channels: 4 } })
    .png({ palette })
    .toBuffer();
  return Buffer.concat([
    png.subarray(0, 8),
    ...chunks(png)
      .filter((chunk) => chunk.type !== "pHYs")
      .map((chunk) => chunk.bytes),
  ]);
}

test("PNG resolution insertion preserves truecolour and indexed pixels, alpha and all other chunks", async () => {
  for (const palette of [false, true]) {
    const original = await samplePng(palette);
    assert.equal(
      chunks(original).filter((chunk) => chunk.type === "pHYs").length,
      0,
    );
    const corrected = withPngResolution(original, 150);
    const correctedChunks = chunks(corrected);
    const physical = correctedChunks.filter((chunk) => chunk.type === "pHYs");
    assert.equal(physical.length, 1);
    assert.ok(
      correctedChunks.findIndex((chunk) => chunk.type === "pHYs") <
        correctedChunks.findIndex((chunk) => chunk.type === "IDAT"),
    );
    assert.equal(physical[0].data.readUInt32BE(0), 5906);
    assert.equal(physical[0].data.readUInt32BE(4), 5906);
    assert.equal(physical[0].data[8], 1);
    assert.equal(
      physical[0].bytes.readUInt32BE(17),
      crc32(physical[0].bytes.subarray(4, 17)),
    );
    assert.deepEqual(
      correctedChunks
        .filter((chunk) => chunk.type !== "pHYs")
        .map((chunk) => chunk.bytes),
      chunks(original).map((chunk) => chunk.bytes),
    );
    const metadata = await sharp(corrected).metadata();
    assert.equal(metadata.density, 150);
    assert.equal(metadata.hasAlpha, true);
    assert.deepEqual(
      await sharp(corrected).ensureAlpha().raw().toBuffer(),
      await sharp(original).ensureAlpha().raw().toBuffer(),
    );
  }
});

test("replaces existing or duplicate pHYs once, without mutating the input", async () => {
  const original = await samplePng();
  const at96 = withPngResolution(original, 96);
  const existingPhysical = chunks(at96).find(
    (chunk) => chunk.type === "pHYs",
  )!.bytes;
  const duplicate = Buffer.concat([
    at96.subarray(0, 33),
    existingPhysical,
    at96.subarray(33),
  ]);
  const snapshot = Buffer.from(duplicate);
  const corrected = withPngResolution(duplicate, 150);
  assert.deepEqual(duplicate, snapshot);
  assert.equal(
    chunks(corrected).filter((chunk) => chunk.type === "pHYs").length,
    1,
  );
  assert.deepEqual(corrected, withPngResolution(original, 150));
  assert.deepEqual(withPngResolution(corrected, 150), corrected);
  assert.equal((await sharp(corrected).metadata()).density, 150);
});

test("template and smaller preview PNGs retain intended millimetres within pixel and pHYs rounding", async () => {
  for (const dpi of [150, 50]) {
    for (const [widthMm, heightMm] of [
      [300, 400],
      [400, 500],
      [700, 500],
    ]) {
      const width = Math.round((widthMm / 25.4) * dpi);
      const height = Math.round((heightMm / 25.4) * dpi);
      const original = await sharp({
        create: { width, height, channels: 4, background: "#ffffff00" },
      })
        .png()
        .toBuffer();
      const corrected = withPngResolution(original, dpi);
      const metadata = await sharp(corrected).metadata();
      assert.equal(metadata.density, dpi);
      assert.equal(metadata.width, width);
      assert.equal(metadata.height, height);
      const physical = chunks(corrected).find(
        (chunk) => chunk.type === "pHYs",
      )!.data;
      for (const [index, targetMm, pixels] of [
        [0, widthMm, metadata.width],
        [4, heightMm, metadata.height],
      ]) {
        const actualMm = (pixels! / physical.readUInt32BE(index!)) * 1000;
        const toleranceMm =
          (0.5 * 25.4) / dpi + (targetMm! * 0.5) / (dpi / 0.0254 - 0.5);
        assert.ok(
          Math.abs(actualMm - targetMm!) <= toleranceMm,
          `${dpi} dpi: ${targetMm} mm became ${actualMm} mm`,
        );
      }
    }
  }
});

test("rejects invalid resolution and truncated PNGs without emitting damaged artwork", async () => {
  const png = await samplePng();
  for (const dpi of [0, -150, NaN, Infinity, 0.001, 1e20])
    assert.throws(() => withPngResolution(png, dpi), /resolution/);
  assert.throws(() => withPngResolution(new Uint8Array(20), 150), /signature/);
  for (const length of [8, 20, png.length - 1, png.length - 12])
    assert.throws(() => withPngResolution(png.subarray(0, length), 150), /PNG/);
  const invalidLength = Buffer.from(png);
  invalidLength.writeUInt32BE(0xffffffff, 8);
  assert.throws(() => withPngResolution(invalidLength, 150), /length/);
});

test("SVG export applies requested resolution to the actual canvas PNG blob", async () => {
  const original = withPngResolution(await samplePng(), 96);
  const previousImage = Object.getOwnPropertyDescriptor(globalThis, "Image");
  const previousDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    "document",
  );
  class LoadedImage {
    onload?: () => void;
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  Object.defineProperty(globalThis, "Image", {
    configurable: true,
    value: LoadedImage,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement(tag: string) {
        assert.equal(tag, "canvas");
        return {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage() {} }),
          toBlob: (callback: (blob: Blob) => void) =>
            callback(new Blob([original], { type: "image/png" })),
        };
      },
    },
  });
  try {
    for (const dpi of [undefined, 50]) {
      const exported = await svgToPng(
        "<svg xmlns='http://www.w3.org/2000/svg'/>",
        3,
        2,
        dpi,
      );
      assert.equal(exported.type, "image/png");
      const bytes = new Uint8Array(await exported.arrayBuffer());
      assert.equal((await sharp(bytes).metadata()).density, dpi ?? 150);
      assert.deepEqual(
        await sharp(bytes).raw().toBuffer(),
        await sharp(original).raw().toBuffer(),
      );
    }
  } finally {
    if (previousImage)
      Object.defineProperty(globalThis, "Image", previousImage);
    else Reflect.deleteProperty(globalThis, "Image");
    if (previousDocument)
      Object.defineProperty(globalThis, "document", previousDocument);
    else Reflect.deleteProperty(globalThis, "document");
  }
});
