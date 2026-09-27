import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/components/site-header";
export const metadata = { title: "Field notes" };
export default function Journal() {
  return (
    <>
      <SiteHeader />
      <main className="content-page">
        <span className="eyebrow">Notes from the workbench</span>
        <h1>Learning to make something worth keeping.</h1>
        <p>
          Slow Reveal Studio is taking shape through image studies and physical
          prototypes. These are the questions guiding the work.
        </p>
        <article className="prose-card">
          <span className="eyebrow">01 / The image</span>
          <h2>A good picture is only half the story.</h2>
          <p>
            A dot portrait can look beautiful on screen and still be tiring to
            complete. We’re testing the relationship between detail, dot size
            and the amount of making. Easy, Standard and Detailed change the
            actual marks on your canvas.
          </p>
          <Link href="/lab/dots">Explore the dot studies</Link>
        </article>
        <article className="prose-card">
          <span className="eyebrow">02 / The materials</span>
          <h2>Canvas, guide, pen. Together.</h2>
          <p>
            The guide must be visible enough to follow and subtle enough to
            disappear. Marker coverage, canvas texture and UV ink need to work
            as one system. Physical sample trials are still required before a
            kit can be sold.
          </p>
        </article>
        <article className="prose-card">
          <span className="eyebrow">03 / The possibilities</span>
          <h2>More than one way to slow down.</h2>
          <p>
            Mosaic cells, contour lines and rhythmic line studies are early
            experiments. Each needs a clear, enjoyable physical action before it
            earns a place beside Signature Dots.
          </p>
          <Link href="/lab/mosaic">Explore the experimental labs</Link>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
