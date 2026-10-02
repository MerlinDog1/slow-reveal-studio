import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PRODUCTS } from "@/lib/catalog";
import { REFERENCE_IMAGES } from "@/lib/reference-images";

type GuideImageId =
  | "photo-wide"
  | "photo-closer"
  | "dots-wide"
  | "dots-closer"
  | "personalisation-finished"
  | "personalisation-template";

export function GuideImage({ id, alt }: { id: GuideImageId; alt: string }) {
  return (
    <img
      src={`/guides/${id}-640.webp`}
      srcSet={`/guides/${id}-640.webp 640w, /guides/${id}-1280.webp 1280w`}
      sizes="(max-width: 700px) 46vw, 480px"
      width={640}
      height={800}
      loading="lazy"
      alt={alt}
    />
  );
}

function PhotoCredit({ id }: { id: "light-pet" | "black-dog" }) {
  const photo = REFERENCE_IMAGES.find((entry) => entry.id === id)!;
  return (
    <p className="srs-guide-credit">
      Licensed example photo:{" "}
      <a href={photo.source} target="_blank" rel="noreferrer">
        {photo.credit}
      </a>
      . Not a customer result.
    </p>
  );
}

export function PersonalisationSection() {
  return (
    <section
      className="section srs-guide-section srs-guide-feature"
      aria-labelledby="personalisation-heading"
    >
      <div>
        <span className="eyebrow">The words that belong with it</span>
        <h2 id="personalisation-heading">
          A name. A date.
          <br />
          <em>A little more meaning.</em>
        </h2>
        <p>
          Add a short line beneath your picture, or tuck it into a corner.
          Choose a classic serif or a simple sans serif, then check the spelling
          and placement in both views.
        </p>
        <p>
          Here, “Always by my side” is sample wording on a real dot-renderer
          example. The artwork and lettering come from the same saved design in
          both views.
        </p>
        <Link className="text-link" href="/canvas-guide#lettering">
          Find room for your words <ArrowRight size={17} />
        </Link>
      </div>
      <div>
        <div className="srs-guide-art-pair">
          <figure>
            <GuideImage
              id="personalisation-finished"
              alt="Digital dotted black-dog portrait with the sample words Always by my side below"
            />
            <figcaption>Finished artwork</figcaption>
          </figure>
          <figure>
            <GuideImage
              id="personalisation-template"
              alt="The same portrait and lettering shown as a faint dot guide"
            />
            <figcaption>Printed-guide preview</figcaption>
          </figure>
        </div>
        <p className="srs-guide-caption">
          Digital rendering · physical print and lettering still require
          testing.
        </p>
        <PhotoCredit id="black-dog" />
      </div>
    </section>
  );
}

export function PhotoCropExamples({
  showArtwork = false,
}: {
  showArtwork?: boolean;
}) {
  return (
    <div>
      <div className="srs-guide-comparison">
        {(["wide", "closer"] as const).map((crop, index) => (
          <article key={crop}>
            <div className="srs-guide-example-label">
              <span>0{index + 1}</span>
              <h3>
                {crop === "wide"
                  ? "More of the setting"
                  : "More of the expression"}
              </h3>
            </div>
            <div className={showArtwork ? "srs-guide-art-pair" : undefined}>
              <figure>
                <GuideImage
                  id={`photo-${crop}`}
                  alt={
                    crop === "wide"
                      ? "Wide crop of a golden retriever with a tall gate, plants and building around it"
                      : "Closer crop of the same golden retriever, retaining its ears and chest"
                  }
                />
                <figcaption>
                  {showArtwork
                    ? "Source crop"
                    : crop === "wide"
                      ? "The garden gets much of the space."
                      : "The dog occupies more of the canvas."}
                </figcaption>
              </figure>
              {showArtwork && (
                <figure>
                  <GuideImage
                    id={`dots-${crop}`}
                    alt={`Actual digital dot rendering of the ${crop} golden-retriever crop`}
                  />
                  <figcaption>Digital dot preview</figcaption>
                </figure>
              )}
            </div>
          </article>
        ))}
      </div>
      <p className="srs-guide-caption">
        One licensed photograph, two crops.{" "}
        {showArtwork
          ? "Both digital examples use the same 40 × 50 cm canvas and Standard dot settings; only the crop changes. "
          : "A closer crop gives the expression more room; it also removes part of the scene. "}
        Neither is a photograph of a completed kit.
      </p>
      <PhotoCredit id="light-pet" />
    </div>
  );
}

export function PhotoSuitabilitySection() {
  return (
    <section
      className="section srs-guide-section"
      aria-labelledby="photo-suitability-heading"
    >
      <div className="srs-guide-section-intro">
        <div>
          <span className="eyebrow">Start with the part you love</span>
          <h2 id="photo-suitability-heading">
            A small crop.
            <br />
            <em>A different story.</em>
          </h2>
        </div>
        <div>
          <p>
            Choose an image where you can see the details that matter. Bring a
            face or a favourite feature closer, keep its edges in the frame and
            compare the finished dots before deciding.
          </p>
          <Link className="text-link" href="/photo-guide">
            Choose a photograph with confidence <ArrowRight size={17} />
          </Link>
        </div>
      </div>
      <PhotoCropExamples />
    </section>
  );
}

/** One SVG unit = one nominal millimetre; every canvas uses the same scale. */
export function CanvasSizeDiagram() {
  let left = 80;
  const sizes = PRODUCTS.map((product) => {
    const position = left;
    left += product.widthMm + 80;
    return { ...product, x: position };
  });
  return (
    <figure className="srs-guide-scale">
      <div
        className="srs-guide-scale-drawing"
        role="region"
        tabIndex={0}
        aria-label="Canvas size diagram; scroll horizontally on smaller screens"
      >
        <svg
          viewBox={`0 0 ${left} 1040`}
          role="img"
          aria-label="Five planned canvas sizes at a shared proportional scale: 30 by 40, 40 by 50, 40 by 60, 50 by 70 and 60 by 80 centimetres"
        >
          <line
            x1="50"
            y1="862"
            x2={left - 45}
            y2="862"
            stroke="#a7ab9d"
            strokeWidth="2"
          />
          {sizes.map((size, index) => (
            <g key={size.id}>
              <rect
                x={size.x}
                y={860 - size.heightMm}
                width={size.widthMm}
                height={size.heightMm}
                fill={
                  ["#ece2d3", "#e3d6c0", "#d2d3bd", "#bcc4af", "#8c9f89"][index]
                }
                stroke="#4b5d47"
                strokeWidth="2"
              />
              <text
                x={size.x + size.widthMm / 2}
                y={860 - size.heightMm + 72}
                fill="#33452f"
                fontSize="35"
                fontFamily="Arial, sans-serif"
                textAnchor="middle"
              >
                0{index + 1}
              </text>
              <text
                x={size.x + size.widthMm / 2}
                y="930"
                fill="#252a25"
                fontSize="42"
                fontFamily="Arial, sans-serif"
                textAnchor="middle"
              >
                {size.label.replace(" cm", "")}
              </text>
              <text
                x={size.x + size.widthMm / 2}
                y="980"
                fill="#52604b"
                fontSize="30"
                fontFamily="Arial, sans-serif"
                textAnchor="middle"
              >
                cm
              </text>
            </g>
          ))}
        </svg>
      </div>
      <figcaption>
        Five planned sizes, drawn to the same relative scale from their stated
        dimensions. This diagram is not life-size on your screen and does not
        show frame depth or measured manufactured samples. Check the studio for
        the currently available choices. On small screens, scroll the diagram
        sideways.
      </figcaption>
    </figure>
  );
}

export const PLANNED_FINISHES = [
  {
    title: "Rolled canvas",
    summary: "A flexible canvas, without a rigid support.",
    making: "Plan a flat, protected surface for making.",
    display:
      "Consider how you would mount or frame it afterwards; a frame is not part of the proposed kit.",
  },
  {
    title: "Stretched canvas",
    summary: "Canvas tensioned over a supporting frame.",
    making:
      "Allow space for its depth and test how you prefer to support it while making.",
    display:
      "The final frame depth, edges and hanging fittings still need approval.",
  },
  {
    title: "Canvas board",
    summary: "Canvas mounted to a rigid, flat board.",
    making: "A flatter form to place on a table or supported easel.",
    display:
      "Board thickness and frame compatibility still need confirmation; do not order a frame from this concept description.",
  },
] as const;

export function CanvasChoiceSection() {
  return (
    <section
      className="section srs-guide-section srs-guide-size-section"
      aria-labelledby="canvas-choice-heading"
    >
      <div className="srs-guide-section-intro">
        <div>
          <span className="eyebrow">Make room for it</span>
          <h2 id="canvas-choice-heading">
            Choose the space.
            <br />
            <em>Then the canvas.</em>
          </h2>
        </div>
        <div>
          <p>
            Measure your making space as well as your wall. A larger canvas can
            carry more marks at the same settings; it does not restore detail
            missing from the photograph.
          </p>
          <Link className="text-link" href="/canvas-guide">
            Compare sizes, shapes and finishes <ArrowRight size={17} />
          </Link>
        </div>
      </div>
      <CanvasSizeDiagram />
      <div className="srs-guide-finish-strip">
        {PLANNED_FINISHES.map((finish) => (
          <div key={finish.title}>
            <h3>{finish.title}</h3>
            <p>{finish.summary}</p>
          </div>
        ))}
      </div>
      <p className="srs-guide-caption">
        Planned finish concepts. Materials, dimensions, fittings and packaging
        remain subject to physical approval.
      </p>
    </section>
  );
}
