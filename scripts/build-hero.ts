import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { DEFAULT_SETTINGS, renderImage, toSvg } from "../lib/renderers";
import type { HeroRevealData } from "../lib/hero-reveal";

// Source-matched study palette. Kept local to this artwork: the studio's fixed
// marker palettes are unchanged, and physical ink matching is not asserted.
const MACAW_PALETTE = [
  "#182127",
  "#722f22",
  "#e52c18",
  "#b92117",
  "#ec6a28",
  "#d4a725",
  "#efd053",
  "#b6a984",
  "#124867",
  "#17779b",
  "#289bbe",
  "#397471",
  "#eee2cf",
  "#8d8076",
  "#f59a42",
  "#a9c1bb",
];

async function main() {
  const root = "public/hero";
  const source = await readFile(`${root}/macaw-source.png`);
  const { data, info } = await sharp(source)
    .resize(800, 1000, { fit: "cover" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const geometry = renderImage(
    {
      data: new Uint8ClampedArray(data),
      width: info.width,
      height: info.height,
    },
    {
      ...DEFAULT_SETTINGS,
      mode: "colour-blend",
      widthMm: 1000,
      heightMm: 1250,
      spacingMm: 4.8,
      minDiameterMm: 0.7,
      maxDiameterMm: 4.8,
      contrast: 1.04,
      brightness: 0,
      gamma: 1,
      edgeEmphasis: 0.1,
      threshold: 0.035,
      autoExposure: false,
      palette: MACAW_PALETTE,
    },
  );
  // Dark details first, then red, gold and blue. Each pen fills local areas in
  // a top-to-bottom serpentine pass, using each actual geometry cell once.
  const colourOrder = [0, 1, 3, 2, 4, 14, 5, 6, 8, 9, 10, 11, 13, 7, 15, 12];
  const rank = new Map(colourOrder.map((colour, i) => [colour, i]));
  const cells = [...geometry.cells].sort((a, b) => {
    const colour =
      rank.get(Number(a.label) - 1)! - rank.get(Number(b.label) - 1)!;
    if (colour) return colour;
    const bandA = Math.floor(a.y / 40),
      bandB = Math.floor(b.y / 40);
    return bandA - bandB || (bandA % 2 ? b.x - a.x : a.x - b.x) || a.y - b.y;
  });
  const animation: HeroRevealData = {
    width: geometry.widthMm,
    height: geometry.heightMm,
    palette: geometry.settings.palette!,
    dots: cells.map((cell) => [
      cell.x + cell.width / 2,
      cell.y + cell.height / 2,
      cell.width / 2,
      Number(cell.label) - 1,
    ]),
  };
  const files: Record<string, Buffer | string> = {
    "macaw-geometry.json": JSON.stringify(geometry),
    "macaw-dots.json": JSON.stringify(animation),
    "macaw-finished.svg": toSvg(geometry, "finished"),
    "macaw-template.svg": toSvg(geometry, "template"),
    "macaw-source.webp": await sharp(source)
      .resize(960, 1200)
      .webp({ quality: 88 })
      .toBuffer(),
  };
  for (const variant of ["finished", "template"] as const)
    files[`macaw-${variant}.webp`] = await sharp(
      Buffer.from(
        toSvg(geometry, variant).replace(
          /width="[\d.]+mm" height="[\d.]+mm"/,
          'width="1600px" height="2000px"',
        ),
      ),
    )
      .webp({ quality: 92 })
      .toBuffer();
  const hash = (bytes: Buffer | string) =>
    createHash("sha256").update(bytes).digest("hex");
  for (const [name, bytes] of Object.entries(files))
    await writeFile(`${root}/${name}`, bytes);
  await writeFile(
    `${root}/manifest.json`,
    JSON.stringify(
      {
        title: "A little wild colour",
        rendererVersion: geometry.version,
        mode: geometry.mode,
        markCount: cells.length,
        paletteDescription:
          "Sixteen colours matched to this source image; physical marker matching unvalidated.",
        palette: animation.palette,
        source: {
          file: "/hero/macaw-source.png",
          sha256: hash(source),
          generated: true,
          tool: "built-in image_gen",
          prompt: "/hero/PROMPT.md",
        },
        isPhysicalProductEvidence: false,
        reproduction: "node --import tsx scripts/build-hero.ts",
        files: Object.fromEntries(
          Object.entries(files).map(([name, bytes]) => [
            name,
            { sha256: hash(bytes), bytes: Buffer.byteLength(bytes) },
          ]),
        ),
      },
      null,
      2,
    ) + "\n",
  );
  process.stdout.write(
    `Created ${cells.length} Colour Blend dots and hero assets.\n`,
  );
}
main();
