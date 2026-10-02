import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import sharp from "sharp";
import {
  DEFAULT_SETTINGS,
  renderImage,
  toSvg,
  RENDERER_VERSION,
  type RenderSettings,
} from "../lib/renderers";
import { sampleSheetSvg } from "../lib/sample-sheet";
import { makingPlan } from "../lib/making-plan";

async function main() {
  const data = new Uint8ClampedArray(120 * 160 * 4);
  for (let y = 0; y < 160; y++)
    for (let x = 0; x < 120; x++) {
      const at = (y * 120 + x) * 4,
        spot = Math.hypot(x - 60, y - 75) < 28;
      data.set(
        [
          spot ? 35 : Math.round((x / 120) * 255),
          spot ? 65 : Math.round((y / 160) * 255),
          (x + y) % 30 < 15 ? 90 : 190,
          255,
        ],
        at,
      );
    }
  const palette = [
    "#18334e",
    "#cf6438",
    "#dcb948",
    "#779476",
    "#a187ac",
    "#716158",
    "#cfafb1",
    "#2a8a9b",
  ];
  const studies: { name: string; settings: Partial<RenderSettings> }[] = [
    ...(
      [
        "dots",
        "mosaic",
        "fibonacci",
        "colour-blend",
        "tv-weave",
        "line-amplification",
      ] as const
    ).map((mode) => ({
      name: mode,
      settings: {
        mode,
        ...(mode === "dots" || mode === "line-amplification"
          ? {}
          : { palette }),
      },
    })),
    ...(["spiral", "flow", "crosshatch"] as const).map((linePattern) => ({
      name: `lines-${linePattern}`,
      settings: { mode: "line-amplification" as const, linePattern },
    })),
  ];
  const zip = new JSZip();
  const manifest = [];
  for (const study of studies) {
    const g = renderImage(
      { width: 120, height: 160, data },
      { ...DEFAULT_SETTINGS, widthMm: 100, heightMm: 140, ...study.settings },
    );
    const template = toSvg(g, "template", { background: false }),
      finished = toSvg(g, "finished");
    zip.file(`${study.name}/template-100x140mm.svg`, template);
    zip.file(`${study.name}/finished.svg`, finished);
    zip.file(
      `${study.name}/reference.png`,
      await sharp(Buffer.from(finished)).resize(500, 700).png().toBuffer(),
    );
    zip.file(`${study.name}/actual-size-sample-A4.svg`, sampleSheetSvg(g));
    manifest.push({
      name: study.name,
      widthMm: 100,
      heightMm: 140,
      marks: g.stats.markCount,
      templateSha256: createHash("sha256").update(template).digest("hex"),
      preflight: makingPlan(g),
      importedInCorel: false,
    });
  }
  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        renderer: RENDERER_VERSION,
        source: "Original synthetic chart; no customer photos",
        status: "Import trials pending",
        cases: manifest,
      },
      null,
      2,
    ),
  );
  zip.file(
    "READ-ME.txt",
    "Synthetic compatibility collection. Each template is exactly 100 x 140 mm. Import at automatic 1:1 scaling. Compare the matching PNG and count/colour/layout, then inspect at 800%. Print the A4 sample at actual size and measure its 100 mm ruler. Record CorelDRAW version, import settings, page dimensions, line appearance, labels, colours and any changed geometry. This collection has not been verified in CorelDRAW or a production RIP. Experimental ribbons can contain interrupted guides and intentional crosshatch overlaps.",
  );
  await mkdir("public/compatibility", { recursive: true });
  await writeFile(
    "public/compatibility/coreldraw-import-studies.zip",
    await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
  );
  await writeFile(
    "public/compatibility/manifest.json",
    JSON.stringify(
      {
        renderer: RENDERER_VERSION,
        cases: manifest.map(({ preflight, ...entry }) => entry),
      },
      null,
      2,
    ),
  );
  console.log(
    `Built ${studies.length} synthetic compatibility cases; physical/import checks remain pending.`,
  );
}
void main();
