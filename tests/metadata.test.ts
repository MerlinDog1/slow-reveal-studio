import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";
import robots from "../app/robots";
import sitemap from "../app/sitemap";
import { RENDERER_VERSION } from "../lib/renderers";

test("search metadata stays private by default and includes only approved public routes", () => {
  const savedOrigin = process.env.NEXT_PUBLIC_SITE_URL;
  const savedIndexing = process.env.PUBLIC_SITE_INDEXABLE;
  try {
    process.env.NEXT_PUBLIC_SITE_URL = "https://studio.example";
    delete process.env.PUBLIC_SITE_INDEXABLE;
    assert.deepEqual(robots().rules, { userAgent: "*", disallow: "/" });
    assert.deepEqual(sitemap(), []);
    process.env.PUBLIC_SITE_INDEXABLE = "true";
    assert.deepEqual(
      sitemap().map((entry) => entry.url),
      [
        "https://studio.example/",
        "https://studio.example/journal",
        "https://studio.example/photo-guide",
        "https://studio.example/canvas-guide",
        "https://studio.example/create",
      ],
    );
    const rules = robots().rules;
    assert.ok(!Array.isArray(rules));
    for (const privatePath of [
      "/admin",
      "/api",
      "/basket",
      "/design",
      "/order",
      "/lab",
    ])
      assert.ok(rules.disallow?.includes(privatePath));
    for (const address of [
      "https://user:secret@studio.example",
      "https://studio.example/#token=secret",
      "https://studio.example/?token=secret",
      "https://studio.example/private",
      "http://studio.example",
      "https://localhost",
      "https://127.0.0.1",
      "https://[::1]",
      "not-a-url",
    ]) {
      process.env.NEXT_PUBLIC_SITE_URL = address;
      assert.deepEqual(sitemap(), [], address);
      assert.deepEqual(
        robots().rules,
        { userAgent: "*", disallow: "/" },
        address,
      );
    }
  } finally {
    if (savedOrigin === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = savedOrigin;
    if (savedIndexing === undefined) delete process.env.PUBLIC_SITE_INDEXABLE;
    else process.env.PUBLIC_SITE_INDEXABLE = savedIndexing;
  }
});

test("public social asset matches its licensed source and current renderer provenance", async () => {
  const image = await readFile("public/social/studio-og.png");
  const geometry = await readFile(
    "public/social/studio-og-geometry.json",
    "utf8",
  );
  const manifest = JSON.parse(
    await readFile("public/social/manifest.json", "utf8"),
  );
  const source = await readFile(`public${manifest.source.file}`);
  const hash = (bytes: Buffer | string) =>
    createHash("sha256").update(bytes).digest("hex");
  const imageMetadata = await sharp(image).metadata();
  assert.equal(imageMetadata.width, 1200);
  assert.equal(imageMetadata.height, 630);
  assert.equal(imageMetadata.format, "png");
  assert.equal(manifest.rendererVersion, RENDERER_VERSION);
  assert.equal(JSON.parse(geometry).version, RENDERER_VERSION);
  assert.equal(manifest.sha256, hash(image));
  assert.equal(manifest.geometrySha256, hash(geometry));
  assert.equal(manifest.source.sha256, hash(source));
  assert.equal(manifest.isPhysicalProductEvidence, false);
  assert.match(manifest.alt, /Mac Gaither \/ Unsplash/);
  assert.equal(
    manifest.reproduction,
    "node --import tsx scripts/build-social.mjs",
  );
  await access("scripts/build-social.mjs");
  await assert.rejects(access("public/social/render-social.mjs"));
});
