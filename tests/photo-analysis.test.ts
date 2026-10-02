import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  analysePhoto,
  detectLocalFaces,
  mapFaceToCrop,
  photoCropTransform,
  type AnalysisPixels,
  type PhotoAnalysisOptions,
} from "../lib/photo-analysis";

function pixels(
  width = 256,
  height = 256,
  sample: (x: number, y: number) => number | number[] = () => 200,
): AnalysisPixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const value = sample(x, y);
      data.set(
        typeof value === "number" ? [value, value, value, 255] : value,
        (y * width + x) * 4,
      );
    }
  return { width, height, data };
}
const options: PhotoAnalysisOptions = {
  sourceWidth: 3000,
  sourceHeight: 3000,
  widthMm: 300,
  heightMm: 300,
  safeMarginMm: 10,
};

test("flat images do not produce invented subjects or unavailable face counts", () => {
  const report = analysePhoto(pixels(), options);
  assert.equal(report.contrastRegion, null);
  assert.equal(report.faces.status, "unavailable");
  assert.equal(report.faces.detectedCount, null);
  assert.equal(report.faces.visibleCount, null);
  assert.ok(report.advice.some((item) => item.id === "low-contrast"));
});

test("small contrasting regions produce conditional subject-size advice", () => {
  const report = analysePhoto(
    pixels(256, 256, (x, y) =>
      x >= 96 && x < 128 && y >= 96 && y < 128 ? 20 : 235,
    ),
    options,
  );
  assert.ok(report.contrastRegion);
  assert.ok(report.contrastRegion.areaFraction < 0.14);
  assert.ok(report.contrastRegion.confidence > 0.9);
  const advice = report.advice.find(
    (item) => item.id === "small-contrast-region",
  );
  assert.match(advice!.message, /If that is your subject/);
  assert.match(advice!.message, /does not identify/);
});

test("busy surroundings are distinguished from a small isolated contrast region", () => {
  const busy = analysePhoto(
    pixels(256, 256, (x, y) =>
      (Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? 20 : 230,
    ),
    options,
  );
  const quiet = analysePhoto(
    pixels(256, 256, (x, y) =>
      x >= 64 && x < 192 && y >= 64 && y < 192 ? 20 : 230,
    ),
    options,
  );
  assert.ok(busy.metrics.outerEdgeDensity > quiet.metrics.outerEdgeDensity * 5);
  assert.ok(busy.advice.some((item) => item.id === "busy-surroundings"));
  assert.equal(busy.contrastRegion, null);
});

test("salient edge contact warns about the safe area without naming a subject", () => {
  const report = analysePhoto(
    pixels(256, 256, (x, y) => (x < 48 && y > 80 && y < 160 ? 10 : 220)),
    options,
  );
  assert.ok(report.advice.some((item) => item.id === "detail-at-edge"));
  assert.equal(report.faces.detectedCount, null);
});

test("zoom reports retained source pixels and never mistakes the upscaled preview for resolution", () => {
  const a = analysePhoto(pixels(), {
    ...options,
    sourceWidth: 2400,
    sourceHeight: 3000,
    widthMm: 400,
    heightMm: 500,
  });
  const b = analysePhoto(pixels(), {
    ...options,
    sourceWidth: 2400,
    sourceHeight: 3000,
    widthMm: 400,
    heightMm: 500,
    crop: { zoom: 3, x: 0.5, y: -0.5, rotation: 0 },
  });
  assert.equal(a.metrics.retainedWidthPixels, 2400);
  assert.equal(b.metrics.retainedWidthPixels, 800);
  assert.equal(b.metrics.retainedHeightPixels, 1000);
  assert.ok(Math.abs(b.metrics.retainedSourceFraction - 1 / 9) < 0.0001);
  assert.ok(b.advice.some((item) => item.id === "crop-resolution"));
});

test("face boxes follow quarter turns and cropping, while counts remain advisory", () => {
  const rotated = mapFaceToCrop(
    { x: 0.1, y: 0.2, width: 0.2, height: 0.3 },
    { ...options, crop: { zoom: 1, x: 0, y: 0, rotation: 90 } },
  );
  assert.ok(Math.abs(rotated.box.x - 0.5) < 1e-8);
  assert.ok(Math.abs(rotated.box.y - 0.1) < 1e-8);
  assert.ok(Math.abs(rotated.box.width - 0.3) < 1e-8);
  assert.ok(Math.abs(rotated.box.height - 0.2) < 1e-8);
  const report = analysePhoto(pixels(), {
    ...options,
    crop: { zoom: 2, x: 0, y: 0, rotation: 0 },
    faces: {
      status: "available",
      boxes: [
        { x: 0.4, y: 0.4, width: 0.08, height: 0.08 },
        { x: 0.02, y: 0.2, width: 0.1, height: 0.1 },
      ],
    },
  });
  assert.equal(report.faces.detectedCount, 2);
  assert.equal(report.faces.visibleCount, 1);
  assert.equal(report.faces.trimmedCount, 1);
  assert.match(
    report.advice.find((item) => item.id === "face-crop")!.message,
    /If that is intentional, continue/,
  );
});

test("pixel analysis is capped and transparent colour does not turn into dark content", () => {
  const report = analysePhoto(
    pixels(1000, 800, () => [0, 0, 0, 0]),
    options,
  );
  assert.equal(report.metrics.analysisWidth, 256);
  assert.equal(report.metrics.analysisHeight, 205);
  assert.equal(report.metrics.meanLuminance, 1);
  assert.equal(report.contrastRegion, null);
});

test("crop transform rejects malformed restored values before touching canvas", () => {
  assert.throws(
    () =>
      photoCropTransform(
        300,
        400,
        { zoom: 0, x: 0, y: 0, rotation: 0 },
        300,
        400,
      ),
    /Invalid/,
  );
  assert.throws(
    () =>
      photoCropTransform(
        300,
        400,
        { zoom: 1, x: NaN, y: 0, rotation: 0 },
        300,
        400,
      ),
    /Invalid/,
  );
  assert.throws(
    () =>
      photoCropTransform(
        300,
        400,
        { zoom: 1, x: 0, y: 0, rotation: 45 },
        300,
        400,
      ),
    /Invalid/,
  );
});

test("native detector availability, failure and timeout are reported without fallback claims", async () => {
  const source = {} as CanvasImageSource;
  assert.equal(
    (await detectLocalFaces(source, 100, 100, {})).status,
    "unavailable",
  );
  class Unsupported {
    async detect(): Promise<never> {
      throw Object.assign(new Error(), { name: "NotSupportedError" });
    }
  }
  assert.equal(
    (await detectLocalFaces(source, 100, 100, { FaceDetector: Unsupported }))
      .status,
    "unavailable",
  );
  class Slow {
    detect(): Promise<never> {
      return new Promise(() => {});
    }
  }
  assert.equal(
    (await detectLocalFaces(source, 100, 100, { FaceDetector: Slow }, 5))
      .status,
    "timeout",
  );
  class Detected {
    async detect() {
      return [
        { boundingBox: { x: 10, y: 20, width: 30, height: 40 } },
        { boundingBox: { x: NaN, y: 0, width: 20, height: 20 } },
      ];
    }
  }
  const result = await detectLocalFaces(source, 100, 100, {
    FaceDetector: Detected,
  });
  assert.equal(result.status, "available");
  assert.equal(result.boxes.length, 1);
  assert.ok(Math.abs(result.boxes[0].width - 0.3) < 1e-8);
});

test(
  "actual browser crop respects all eight EXIF orientations without double rotation",
  { skip: process.env.PHOTO_BROWSER_QA !== "1" },
  async () => {
    const { chromium } = await import("@playwright/test");
    const sharp = (await import("sharp")).default;
    const ts = await import("typescript");
    const compile = (source: string) =>
      ts.transpileModule(source, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
        },
      }).outputText;
    const analysisUri = `data:text/javascript;base64,${Buffer.from(compile(await readFile("lib/photo-analysis.ts", "utf8"))).toString("base64")}`;
    const imageCode = compile(
      await readFile("lib/image-processing.ts", "utf8"),
    ).replace('"./photo-analysis"', JSON.stringify(analysisUri));
    const moduleUri = `data:text/javascript;base64,${Buffer.from(imageCode).toString("base64")}`;
    const base = pixels(80, 48, (x, y) =>
      x < 40
        ? y < 24
          ? [230, 20, 20, 255]
          : [20, 20, 230, 255]
        : y < 24
          ? [20, 230, 20, 255]
          : [230, 230, 20, 255],
    );
    const browser = await chromium.launch({
      channel: "msedge",
      headless: true,
    });
    try {
      const page = await browser.newPage();
      for (let orientation = 1; orientation <= 8; orientation++) {
        const jpeg = await sharp(base.data, {
          raw: { width: base.width, height: base.height, channels: 4 },
        })
          .jpeg({ quality: 95 })
          .withMetadata({ orientation })
          .toBuffer();
        const expected = await sharp(jpeg)
          .autoOrient()
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const actual = await page.evaluate(
          async ({ uri, photo }) => {
            const lib = await import(uri);
            const image = await lib.loadImage(photo);
            const { pixels } = lib.cropImage(
              image,
              { zoom: 1, x: 0, y: 0, rotation: 0 },
              image.naturalWidth / image.naturalHeight,
              Math.max(image.naturalWidth, image.naturalHeight),
            );
            return {
              width: pixels.width,
              height: pixels.height,
              data: Array.from(pixels.data) as number[],
            };
          },
          {
            uri: moduleUri,
            photo: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
          },
        );
        assert.equal(
          actual.width,
          expected.info.width,
          `Orientation ${orientation}: oriented width`,
        );
        assert.equal(
          actual.height,
          expected.info.height,
          `Orientation ${orientation}: oriented height`,
        );
        for (const u of [0.25, 0.75])
          for (const v of [0.25, 0.75]) {
            const at =
              (Math.floor(v * actual.height) * actual.width +
                Math.floor(u * actual.width)) *
              4;
            for (let channel = 0; channel < 3; channel++)
              assert.ok(
                Math.abs(
                  actual.data[at + channel] - expected.data[at + channel],
                ) < 6,
                `Orientation ${orientation}: quadrant colour`,
              );
          }
      }
    } finally {
      await browser.close();
    }
  },
);
