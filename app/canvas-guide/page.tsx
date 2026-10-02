import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import {
  CanvasSizeDiagram,
  PLANNED_FINISHES,
  PersonalisationSection,
} from "@/components/making-guides";
import { PRODUCTS } from "@/lib/catalog";
import { trustedPublicOrigin } from "@/lib/public-origin";

export const metadata: Metadata = {
  title: "Canvas sizes, finishes and personalisation",
  description:
    "Compare five planned canvas sizes at a common relative scale. Understand crop ratios, proposed finishes and how to leave room for personal lettering.",
  alternates: trustedPublicOrigin()
    ? { canonical: "/canvas-guide" }
    : undefined,
};
const ratios: Record<string, string> = {
  "30x40": "3:4",
  "40x50": "4:5",
  "40x60": "2:3",
  "50x70": "5:7",
  "60x80": "3:4",
};

export default function CanvasGuide() {
  return (
    <>
      <SiteHeader />
      <main className="srs-guide-page">
        <header className="srs-guide-page-header">
          <Link className="srs-guide-back" href="/">
            Slow Reveal Studio / Making guides
          </Link>
          <span className="eyebrow">The canvas guide</span>
          <h1>
            A place to make.
            <br />
            <em>A place to keep it.</em>
          </h1>
          <p>
            Choose a canvas with both moments in mind: the time you spend at the
            table and the space it may eventually call home. Here is how our
            five planned sizes compare, and what is still being decided about
            the finishes.
          </p>
          <nav className="srs-guide-jump-links" aria-label="On this page">
            <a href="#sizes">Compare sizes</a>
            <a href="#finishes">Explore finishes</a>
            <a href="#lettering">Add personal words</a>
          </nav>
        </header>
        <section
          className="srs-guide-block"
          id="sizes"
          aria-labelledby="sizes-heading"
        >
          <span className="eyebrow">One common scale</span>
          <h2 id="sizes-heading">Five sizes, side by side.</h2>
          <p className="srs-guide-lead">
            The rectangles use the stated width and height in the same
            proportion. The 60 × 80 cm option has twice the width and height of
            30 × 40 cm, and four times its area. Your screen scales the whole
            diagram to fit.
          </p>
          <CanvasSizeDiagram />
          <div className="srs-guide-table-wrap">
            <table className="srs-guide-table">
              <caption>Initial planned sizes — portrait orientation</caption>
              <thead>
                <tr>
                  <th scope="col">Canvas</th>
                  <th scope="col">Width × height</th>
                  <th scope="col">Shape ratio</th>
                  <th scope="col">Area</th>
                </tr>
              </thead>
              <tbody>
                {PRODUCTS.map((product) => (
                  <tr key={product.id}>
                    <th scope="row">{product.label}</th>
                    <td>
                      {product.widthMm} × {product.heightMm} mm
                    </td>
                    <td>{ratios[product.id]}</td>
                    <td>
                      {(
                        (product.widthMm * product.heightMm) /
                        100
                      ).toLocaleString("en-GB")}{" "}
                      cm²
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="srs-guide-caption">
            These are the initial planned artwork dimensions, not final stock or
            frame specifications. Rotate for landscape. The{" "}
            <Link href="/create">studio’s current size choices</Link> determine
            what you can select; do not buy a frame until final dimensions and
            finish are confirmed.
          </p>
        </section>
        <section
          className="srs-guide-block srs-guide-two-column"
          aria-labelledby="shape-heading"
        >
          <div>
            <span className="eyebrow">
              Size and shape are different choices
            </span>
            <h2 id="shape-heading">
              Check the crop
              <br />
              <em>when the shape changes.</em>
            </h2>
            <p>
              30 × 40 and 60 × 80 share a 3:4 shape. The other options have
              different proportions, so moving between them can remove a
              different part of your photograph. Revisit the crop after changing
              size or orientation.
            </p>
            <p>
              A larger area can fit more dots at the same physical spacing. It
              can also mean more work. Use the actual mark count as a
              comparison; time estimates still need calibration against
              completed physical samples.
            </p>
          </div>
          <aside className="srs-guide-note">
            <h3>Try this before choosing</h3>
            <ol>
              <li>Measure the clear space on your table.</li>
              <li>
                Mark out the proposed width and height on paper, or use a tape
                measure.
              </li>
              <li>Allow space for your hands, pens and reference preview.</li>
              <li>
                Check the wall or display space separately, allowing for any
                future frame.
              </li>
            </ol>
            <p>
              Use the dimensions above for this exercise. The on-screen diagram
              is not a ruler.
            </p>
          </aside>
        </section>
        <section
          className="srs-guide-block"
          id="finishes"
          aria-labelledby="finishes-heading"
        >
          <span className="eyebrow">Three proposed ways to finish</span>
          <h2 id="finishes-heading">
            Same memory.
            <br />
            <em>A different form.</em>
          </h2>
          <p className="srs-guide-lead">
            These describe the forms we are evaluating. Canvas weight, coating,
            board thickness, frame depth, supplied fittings and packaging have
            not been finalised. No finish has passed the full physical making
            and shipping trials yet.
          </p>
          <div className="srs-guide-finish-cards">
            {PLANNED_FINISHES.map((finish, i) => (
              <article key={finish.title}>
                <span className="srs-guide-index">0{i + 1}</span>
                <h3>{finish.title}</h3>
                <p>{finish.summary}</p>
                <dl>
                  <dt>While making</dt>
                  <dd>{finish.making}</dd>
                  <dt>When displaying</dt>
                  <dd>{finish.display}</dd>
                </dl>
              </article>
            ))}
          </div>
        </section>
        <div id="lettering" className="srs-guide-lettering">
          <PersonalisationSection />
        </div>
        <section
          className="srs-guide-block srs-guide-two-column"
          aria-labelledby="words-heading"
        >
          <div>
            <span className="eyebrow">A final check for the words</span>
            <h2 id="words-heading">
              Keep them short.
              <br />
              <em>Make them yours.</em>
            </h2>
            <p>
              The studio supports one line of up to 80 characters and four
              placement choices. Longer text is fitted to the available width,
              so it can become smaller. A short name, date or phrase often needs
              less compromise.
            </p>
            <p>
              Check accents and punctuation as carefully as spelling. The
              current fonts support a defined Latin character set; unsupported
              characters give an error rather than quietly changing to another
              typeface.
            </p>
          </div>
          <aside className="srs-guide-note">
            <h3>Before you approve a proof</h3>
            <ul>
              <li>Read the exact spelling and date.</li>
              <li>Check every letter is visible in both saved views.</li>
              <li>Confirm that the placement leaves the picture room.</li>
              <li>
                Look for any warning that the wording has become too small.
              </li>
            </ul>
            <p>
              Digital fit does not establish legibility on real canvas. The
              print and marker combination still needs a physical lettering
              test.
            </p>
          </aside>
        </section>
        <div className="srs-guide-end">
          <div>
            <span className="eyebrow">Find the right fit</span>
            <h2>
              Try the photograph
              <br />
              on a canvas.
            </h2>
          </div>
          <div className="srs-guide-actions">
            <Link className="button" href="/create">
              Explore current choices <ArrowRight size={17} />
            </Link>
            <Link className="text-link" href="/photo-guide">
              Read the photo guide <ArrowRight size={17} />
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
