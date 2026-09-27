/** Build-only WOFF parser. Runtime renderers use only the generated, licensed vectors. */
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import opentype from "opentype.js";
import { create as createFont } from "fontkit";

const root = resolve(import.meta.dirname, "..");
const definitions = [
  {
    key: "serif",
    package: "playfair-display",
    source: "Playfair Display",
    name: "SRS Serif Outline",
  },
  {
    key: "sans-serif",
    package: "dm-sans",
    source: "DM Sans",
    name: "SRS Sans Outline",
  },
];
const requested = new Set();
for (const [first, last] of [
  [0x20, 0x7e],
  [0xa0, 0x24f],
  [0x1e00, 0x1eff],
  [0x2000, 0x200a],
  [0x2010, 0x2027],
  [0x2030, 0x203a],
  [0x20a0, 0x20c0],
]) {
  for (let n = first; n <= last; n++) requested.add(String.fromCodePoint(n));
}
for (const n of [0x2113, 0x2116, 0x2122, 0x2191, 0x2193, 0x2212, 0x2215])
  requested.add(String.fromCodePoint(n));
const round = (n) => Math.round(n * 1000) / 1000;
const sources = [];
for (const definition of definitions) {
  const fonts = [];
  for (const subset of ["latin", "latin-ext"]) {
    const path = `node_modules/@fontsource/${definition.package}/files/${definition.package}-${subset}-400-normal.woff`;
    const bytes = await readFile(resolve(root, path));
    const font = opentype.parse(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    fonts.push({
      font,
      layoutFont: createFont(bytes),
      sha256: createHash("sha256").update(bytes).digest("hex"),
      path,
    });
  }
  const glyphs = new Map();
  for (const character of [...requested].sort(
    (a, b) => a.codePointAt(0) - b.codePointAt(0),
  )) {
    const candidate = fonts.find(
      ({ font }) => font.charToGlyphIndex(character) !== 0,
    );
    if (!candidate) continue;
    const glyph = candidate.font.charToGlyph(character);
    const path = glyph.getPath(0, 0, 1000, { hinting: false });
    const box = path.getBoundingBox();
    glyphs.set(character, {
      a: round((glyph.advanceWidth / candidate.font.unitsPerEm) * 1000),
      d: path.toPathData({ decimalPlaces: 3, optimize: true, flipY: false }),
      b: [box.x1, box.y1, box.x2, box.y2].map(round),
    });
  }
  sources.push({ ...definition, fonts, glyphs });
}
// A font switch must not silently change the character repertoire.
const characters = [...requested]
  .filter((character) =>
    sources.every((source) => source.glyphs.has(character)),
  )
  .sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
const fonts = {};
for (const source of sources) {
  const glyphs = Object.fromEntries(
    characters.map((character) => [character, source.glyphs.get(character)]),
  );
  const kerning = {};
  for (const left of characters)
    for (const right of characters) {
      const candidate = source.fonts.find(
        ({ font }) =>
          font.charToGlyphIndex(left) && font.charToGlyphIndex(right),
      );
      if (!candidate) continue;
      // Fontkit handles Playfair's extension-positioning GPOS table, which
      // opentype.js reports as unsupported. No shaping engine ships at runtime.
      const layout = candidate.layoutFont.layout(left + right, {
        liga: false,
        clig: false,
      });
      const advance = layout.positions.reduce(
        (sum, position) => sum + position.xAdvance,
        0,
      );
      const natural =
        candidate.layoutFont.glyphForCodePoint(left.codePointAt(0))
          .advanceWidth +
        candidate.layoutFont.glyphForCodePoint(right.codePointAt(0))
          .advanceWidth;
      const value = round(
        ((advance - natural) / candidate.layoutFont.unitsPerEm) * 1000,
      );
      if (value) kerning[left + right] = value;
    }
  fonts[source.key] = {
    name: source.name,
    sourceFamily: source.source,
    sourcePackage: `@fontsource/${source.package}@5.3.0`,
    sources: source.fonts.map(({ path, sha256 }) => ({ path, sha256 })),
    units: 1000,
    glyphs,
    kerning,
  };
}
const output = {
  format: "srs-outlines/1.0.0",
  revision: createHash("sha256")
    .update(JSON.stringify(fonts))
    .digest("hex")
    .slice(0, 16),
  license: "SIL Open Font License 1.1; see public/fonts/*-OFL.txt",
  characters: characters.join(""),
  fonts,
};
const json = JSON.stringify(output) + "\n";
await writeFile(resolve(root, "lib/renderers/font-data.json"), json);
const licenses = resolve(root, "public/fonts");
await mkdir(licenses, { recursive: true });
for (const source of sources)
  await copyFile(
    resolve(root, `node_modules/@fontsource/${source.package}/LICENSE`),
    resolve(licenses, `${source.package}-OFL.txt`),
  );
await writeFile(
  resolve(licenses, "README.md"),
  `# Lettering source licences\n\nSRS Serif Outline and SRS Sans Outline are vector subsets derived from the regular 400-weight WOFF files in @fontsource/playfair-display@5.3.0 and @fontsource/dm-sans@5.3.0. The original authors and complete SIL Open Font License 1.1 notices are retained beside this file. The derivative vector data remains under the OFL; documents created with it are not required to adopt that licence.\n\nThe derivative data uses SRS names, respecting Playfair Display's Reserved Font Name. Source attribution does not imply endorsement. The application maps its generic Serif/Sans choices to these internal outline sets. Rebuild with \`node scripts/build-font-data.mjs\`. Source font hashes are recorded in \`lib/renderers/font-data.json\`; the runtime does not download fonts or call a font parser.\n\nThe build-only tools opentype.js@2.0.0 (glyph outlines) and fontkit@2.0.4 (kerning including GPOS extension positioning) are MIT licensed.\n`,
);
console.log(
  JSON.stringify(
    {
      characters: characters.length,
      bytes: Buffer.byteLength(json),
      sha256: createHash("sha256").update(json).digest("hex"),
      fonts: Object.fromEntries(
        Object.entries(fonts).map(([key, font]) => [
          key,
          {
            glyphs: Object.keys(font.glyphs).length,
            kerningPairs: Object.keys(font.kerning).length,
          },
        ]),
      ),
    },
    null,
    2,
  ),
);
