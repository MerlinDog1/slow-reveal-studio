// Rebuild: node --import tsx scripts/build-social.mjs
// Only the explicitly licensed public lab fixture is read. Never use customer files here.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import opentype from "opentype.js";
import rendererModule from "../lib/renderers/index.ts";

const { DEFAULT_SETTINGS, RENDERER_VERSION, renderImage, toSvg } =
  rendererModule;
const output = path.resolve("public/social");
const fixtures = JSON.parse(
  await readFile("public/references/manifest.json", "utf8"),
);
const fixture = fixtures.find((item) => item.id === "black-dog");
assert.ok(fixture, "The licensed black-dog lab fixture is documented");
const source = await readFile("public/references/black-dog.jpg");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
assert.equal(
  sha256(source),
  fixture.sha256,
  "Reference photograph provenance is unchanged",
);
const { data, info } = await sharp(source)
  .autoOrient()
  .resize(800, 1000, { fit: "cover", position: "centre" })
  .flatten({ background: "#ffffff" })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const geometry = renderImage(
  { data: new Uint8ClampedArray(data), width: info.width, height: info.height },
  { ...DEFAULT_SETTINGS, mode: "dots", widthMm: 400, heightMm: 500 },
);
const finishedSvg = toSvg(geometry, "finished");
const artwork = await sharp(Buffer.from(finishedSvg))
  .resize(400, 500)
  .png()
  .toBuffer();

// Outlined typography makes this reproducible without workstation font fallbacks.
const sans = opentype.parse(
  await readFile(
    "node_modules/@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff",
  ),
);
const serif = opentype.parse(
  await readFile(
    "node_modules/@fontsource/playfair-display/files/playfair-display-latin-400-normal.woff",
  ),
);
const text = (font, value, x, y, size, fill = "#1e1e1c") => {
  let cursor = x;
  let previous;
  return [...value]
    .map((character) => {
      const glyph = font.charToGlyph(character);
      if (previous)
        cursor +=
          (font.getKerningValue(previous, glyph) * size) / font.unitsPerEm;
      const outline = glyph.getPath(cursor, y, size);
      outline.fill = fill;
      cursor += (glyph.advanceWidth * size) / font.unitsPerEm;
      previous = glyph;
      return outline.toSVG(3);
    })
    .join("");
};
const frame = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#f4efe6"/>
  <rect x="0" y="0" width="12" height="630" fill="#c6a25a"/>
  <rect x="712" y="32" width="440" height="550" fill="#dcceb6"/>
  ${text(sans, "SLOW REVEAL STUDIO", 58, 78, 20)}
  ${text(sans, "SIGNATURE DOTS / DIGITAL STUDY", 58, 169, 15, "#6b604f")}
  ${text(serif, "Made from your", 55, 256, 54)}
  ${text(serif, "photo. Finished", 55, 323, 54)}
  ${text(serif, "by you.", 55, 390, 54)}
  ${text(sans, "Explore a favourite image, one dot at a time.", 58, 453, 20)}
  ${text(sans, "Renderer preview · physical prototype pending", 58, 537, 16, "#6b604f")}
  ${text(sans, `Photo: ${fixture.author} / Unsplash`, 738, 614, 14, "#6b604f")}
</svg>`;
await mkdir(output, { recursive: true });
const image = await sharp(Buffer.from(frame))
  .composite([{ input: artwork, left: 732, top: 57 }])
  .png()
  .toBuffer();
await writeFile(path.join(output, "studio-og.png"), image);
await writeFile(path.join(output, "studio-og-artwork.svg"), finishedSvg);
await writeFile(
  path.join(output, "studio-og-geometry.json"),
  JSON.stringify(geometry),
);
await writeFile(
  path.join(output, "manifest.json"),
  JSON.stringify(
    {
      file: "/social/studio-og.png",
      width: 1200,
      height: 630,
      sha256: sha256(image),
      rendererVersion: RENDERER_VERSION,
      geometrySha256: sha256(JSON.stringify(geometry)),
      status: "digital-renderer-study",
      isPhysicalProductEvidence: false,
      source: {
        file: "/references/black-dog.jpg",
        sha256: fixture.sha256,
        author: fixture.author,
        page: fixture.source,
        license: fixture.license,
        licenseUrl: fixture.licenseUrl,
      },
      alt: `Digital dot portrait of a black Labrador rendered by Slow Reveal Studio; source photo by ${fixture.author} / Unsplash. Physical prototype pending.`,
      reproduction: "node --import tsx scripts/build-social.mjs",
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    file: "/social/studio-og.png",
    width: 1200,
    height: 630,
    marks: geometry.stats.markCount,
    sha256: sha256(image),
  }),
);
