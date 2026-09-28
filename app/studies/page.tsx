import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import marketing from "@/public/marketing/manifest.json";
import { getPreviewModes } from "@/lib/mode-availability";

export const metadata = {
  title: "Studies in making",
  description:
    "Explore digital renderer studies and clearly labelled concept imagery while Slow Reveal Studio’s physical kits are developed.",
};
const studies = [
  [
    "dots-progression-digital.png",
    "A photograph, slowly revealed",
    "Digital rendering · Same marks from template through finished artwork",
  ],
  [
    "home-hero-prototype.png",
    "A little time at the table",
    "Illustrative prototype · AI-generated",
  ],
  [
    "dots-hand-detail-prototype.png",
    "One circle at a time",
    "Illustrative prototype · AI-generated",
  ],
  [
    "dots-guide-macro-prototype.png",
    "A guide that becomes part of the picture",
    "Illustrative prototype · AI-generated",
  ],
  [
    "kit-flatlay-prototype.png",
    "The planned making kit",
    "Illustrative prototype · AI-generated",
  ],
  [
    "finished-in-home-prototype.png",
    "Something to find a place for",
    "Illustrative prototype · AI-generated",
  ],
  [
    "example-pet-prototype.png",
    "The face you know by heart",
    "Illustrative prototype · AI-generated",
  ],
  [
    "example-couple-prototype.png",
    "A moment for two",
    "Illustrative prototype · AI-generated",
  ],
  [
    "example-place-prototype.png",
    "A place that means something",
    "Illustrative prototype · AI-generated",
  ],
  [
    "mosaic-progression-digital.png",
    "A study in small shapes",
    "Digital rendering · Experimental Mosaic Fill",
  ],
  [
    "contour-progression-digital.png",
    "Following the important lines",
    "Digital rendering · Experimental Contour Trace",
  ],
  [
    "lines-progression-prototype.png",
    "Finding a rhythm",
    "Illustrative prototype · AI-generated · Line kits require a ruler",
  ],
  [
    "size-comparison-prototype.png",
    "Room for a memory",
    "Illustrative prototype · AI-generated · Not a scale diagram",
  ],
  [
    "colour-options-digital.png",
    "A colour that feels familiar",
    "Digital rendering · Marker colours require physical matching",
  ],
];
export default function Studies() {
  const availableModes = getPreviewModes();
  const visibleStudies = studies.filter(([file]) => {
    if (file.startsWith("mosaic-")) return availableModes.includes("mosaic");
    if (file.startsWith("contour-")) return availableModes.includes("contour");
    if (file.startsWith("lines-"))
      return availableModes.includes("line-amplification");
    return true;
  });
  return (
    <>
      <SiteHeader />
      <main className="content-page studies-page">
        <span className="eyebrow">From the studio workbench</span>
        <h1>Studies in making.</h1>
        <p>
          These are visual studies of the experience we’re developing. Digital
          studies come from our rendering engine. Generated concepts explore
          materials and setting; they are not photographs of manufactured kits
          or customer results.
        </p>
        <div className="studies-grid">
          {visibleStudies.map(([file, title, caption]) => {
            const asset = marketing.assets.find(
              (item) => item.file === `/marketing/${file}`,
            );
            const versions = asset?.derivatives ?? [];
            return (
              <figure key={file}>
                <a
                  href={`/marketing/${file}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Enlarge ${title}`}
                >
                  <img
                    src={
                      versions.find((item) => item.width === 1280)?.file ??
                      `/marketing/${file}`
                    }
                    srcSet={versions
                      .map((item) => `${item.file} ${item.width}w`)
                      .join(", ")}
                    sizes="(max-width: 760px) 100vw, 50vw"
                    alt={title}
                    loading="lazy"
                  />
                </a>
                <figcaption>
                  <h2>{title}</h2>
                  <p>{caption}</p>
                </figcaption>
              </figure>
            );
          })}
        </div>
        <Link className="button" href="/lab/dots">
          Make a study from your photograph
          <ArrowUpRight size={16} />
        </Link>
      </main>
      <SiteFooter />
    </>
  );
}
