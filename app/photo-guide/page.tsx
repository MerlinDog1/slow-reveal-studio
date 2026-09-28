import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { PhotoCropExamples } from "@/components/making-guides";
import { trustedPublicOrigin } from "@/lib/public-origin";

export const metadata: Metadata = {
  title: "Choosing a photo for your dot artwork",
  description:
    "Compare real photo crops and dot previews. Practical guidance for portraits, pets, family photographs and places, with clear checks before you save.",
  alternates: trustedPublicOrigin() ? { canonical: "/photo-guide" } : undefined,
};

const subjects = [
  {
    number: "01",
    title: "A person or a couple",
    text: "Look at the eyes and expression at full size. Keep the faces near enough to read, with a little space around hair and shoulders. For two people, check both faces rather than judging the picture by the sharper one.",
    check:
      "Try the finished preview in black: does the expression still read without the original colours?",
  },
  {
    number: "02",
    title: "Dark or light-coated pets",
    text: "For dark fur, look for visible separation around the eyes, nose and ears. For pale fur, check that the outline does not disappear into a bright background. The original needs usable detail; a slider cannot recover detail that was never captured.",
    check:
      "Compare a closer crop, then try brightness or automatic exposure and inspect the result.",
  },
  {
    number: "03",
    title: "Families and groups",
    text: "Every extra person shares the same canvas area. Start with people close together and enough room around the outside faces. Check each person separately after selecting the canvas shape, especially faces near its edges.",
    check:
      "Compare the available detail presets. More marks may preserve more structure, but also mean more making.",
  },
  {
    number: "04",
    title: "A home or a meaningful place",
    text: "Choose the feature that makes the place yours: a doorway, roofline or whole building. Trees, signs and wires can compete with it. Keep an eye on vertical edges and on anything the selected crop removes.",
    check:
      "Ask whether a simpler crop says more. Fine brickwork and distant details may simplify into tone.",
  },
];

export default function PhotoGuide() {
  return (
    <>
      <SiteHeader />
      <main className="srs-guide-page">
        <header className="srs-guide-page-header">
          <Link className="srs-guide-back" href="/">
            Slow Reveal Studio / Making guides
          </Link>
          <span className="eyebrow">The photo guide</span>
          <h1>
            Keep the detail.
            <br />
            <em>Find the feeling.</em>
          </h1>
          <p>
            A favourite photo does not have to be a studio portrait. Start with
            what you want to remember, then use the crop and two artwork views
            to decide whether the important parts survive as dots.
          </p>
          <nav className="srs-guide-jump-links" aria-label="On this page">
            <a href="#crop">See a crop comparison</a>
            <a href="#subjects">Choose your subject</a>
            <a href="#checks">Before you save</a>
          </nav>
        </header>
        <section
          className="srs-guide-block"
          id="crop"
          aria-labelledby="crop-heading"
        >
          <span className="eyebrow">One photograph, two decisions</span>
          <h2 id="crop-heading">Give the subject some room.</h2>
          <p className="srs-guide-lead">
            In this example, the gate and plants take up much of the wide crop.
            Moving closer gives the dog more of the canvas. The surrounding
            detail is still there; cropping is a choice about the picture, not
            automatic background removal.
          </p>
          <PhotoCropExamples showArtwork />
        </section>
        <section
          className="srs-guide-block"
          id="subjects"
          aria-labelledby="subjects-heading"
        >
          <span className="eyebrow">Different memories, different checks</span>
          <h2 id="subjects-heading">Look for what matters most.</h2>
          <div className="srs-guide-subject-grid">
            {subjects.map((subject) => (
              <article key={subject.number}>
                <span className="srs-guide-index">{subject.number}</span>
                <h3>{subject.title}</h3>
                <p>{subject.text}</p>
                <p className="srs-guide-try">
                  <strong>In the studio</strong>
                  {subject.check}
                </p>
              </article>
            ))}
          </div>
        </section>
        <section
          className="srs-guide-block srs-guide-two-column"
          aria-labelledby="source-heading"
        >
          <div>
            <span className="eyebrow">Start with the original</span>
            <h2 id="source-heading">
              A better file gives you
              <br />
              <em>more to work with.</em>
            </h2>
            <p>
              Use the original photo when you can, rather than a screenshot of
              it. Magnify the important detail before uploading: if it already
              looks soft or blocky, making the canvas larger will not bring that
              detail back.
            </p>
            <p>
              The studio accepts a single JPEG, PNG or WebP, up to 8 MB and 40
              megapixels. Export HEIC photographs to one of those formats first.
              Animated images are not supported.
            </p>
          </div>
          <aside className="srs-guide-note">
            <h3>What the photo advice can tell you</h3>
            <p>
              Local checks offer advice about retained resolution, light and
              shade, busy edges and the crop. Some browsers also offer an
              optional check for possible faces.
            </p>
            <p>
              These checks can miss details or make mistakes. A contrasting
              shape is not necessarily your subject, and an unavailable face
              check does not mean there are no faces. Your view of the finished
              artwork matters more than a reassuring message.
            </p>
            <Link href="/privacy" className="text-link">
              How your photo is handled <ArrowRight size={16} />
            </Link>
          </aside>
        </section>
        <section
          className="srs-guide-block"
          id="checks"
          aria-labelledby="checks-heading"
        >
          <span className="eyebrow">Before you save</span>
          <h2 id="checks-heading">A few deliberate checks.</h2>
          <ol className="srs-guide-checklist">
            <li>
              <strong>Set the shape first.</strong>
              <span>
                Choose your canvas and orientation, then check the crop again.
                Leave important features and lettering inside the safe area.
              </span>
            </li>
            <li>
              <strong>Look at both artwork views.</strong>
              <span>
                Use Finished to check the image, then Template to see the
                activity. Enlarge them; a small thumbnail can hide a lost eye,
                clipped ear or crowded detail.
              </span>
            </li>
            <li>
              <strong>Check the words separately.</strong>
              <span>
                Read names and dates character by character. Shorter wording
                usually leaves more room for clear lettering.
              </span>
            </li>
            <li>
              <strong>Review the saved proof.</strong>
              <span>
                The saved server proof is the version used to prepare
                production. Check both of its views and explicitly approve it
                before any available checkout.
              </span>
            </li>
          </ol>
          <p className="srs-guide-caption">
            You need permission to use the photograph. Images stay local while
            you explore; choosing a private online save uploads the source for
            that design. Physical canvas, guide and marker trials are still
            required before orders open.
          </p>
        </section>
        <div className="srs-guide-end">
          <div>
            <span className="eyebrow">Try your own photograph</span>
            <h2>The preview is the next step.</h2>
          </div>
          <div className="srs-guide-actions">
            <Link className="button" href="/create">
              Open the studio <ArrowRight size={17} />
            </Link>
            <Link className="text-link" href="/canvas-guide">
              Read the canvas guide <ArrowRight size={17} />
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
