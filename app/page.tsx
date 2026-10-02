import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Flower2,
  Image,
  PenLine,
} from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { HeroArtwork } from "@/components/hero-artwork";
import {
  PersonalisationSection,
  PhotoSuitabilitySection,
  CanvasChoiceSection,
} from "@/components/making-guides";
import { trustedPublicOrigin } from "@/lib/public-origin";
import { getPreviewModes } from "@/lib/mode-availability";
import { RevealModes } from "@/components/reveal-modes";

export const metadata = {
  alternates: trustedPublicOrigin() ? { canonical: "/" } : undefined,
};
export default function Home() {
  const availableModes = getPreviewModes();
  return (
    <>
      <SiteHeader />
      <main>
        <section className="home-hero home-hero-colour">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="little-line" />
              Your memory. The joy of making it.
            </span>
            <h1>
              Put yourself
              <br />
              <em>
                in the
                <br />
                picture.
              </em>
            </h1>
            <p>
              A favourite face. A place you miss. That very good dog. Turn a
              photograph you love into an artwork that reveals itself, one small
              mark at a time.
            </p>
            <Link href="/create" className="button">
              Create your own
              <ArrowUpRight size={18} />
            </Link>
            <a className="colour-hero-how" href="#how-it-works">
              Watch the reveal <ArrowRight size={16} />
            </a>
            <div className="hero-reassurance">
              <span>
                <Check size={14} />
                Your photo, your artwork
              </span>
              <span>
                <Check size={14} />
                No artistic experience needed
              </span>
            </div>
          </div>
          <HeroArtwork />
        </section>
        <div className="manifesto-strip">
          <span>Less scrolling. More making.</span>
          <span>Something personal, made by hand.</span>
          <span>A little time, beautifully spent.</span>
        </div>
        <section className="how-section section" id="how-it-works">
          <div className="section-heading">
            <span className="eyebrow">The lovely part is making it</span>
            <h2>
              A photograph becomes
              <br />
              <em>something more.</em>
            </h2>
            <p>
              You already have the inspiration.
              <br />
              We help you turn it into a moment for yourself.
            </p>
          </div>
          <div className="steps-grid">
            {[
              {
                n: "01",
                icon: Image,
                title: "Choose a memory",
                text: "Upload a favourite photograph. Find the crop, colour and level of detail that feels right.",
              },
              {
                n: "02",
                icon: PenLine,
                title: "Enjoy the in-between",
                text: "Follow the faint guide, one colour at a time. Make a little each day, or gather around the table and make it together.",
              },
              {
                n: "03",
                icon: Flower2,
                title: "See what you’ve made",
                text: "Step back and watch the image come together. A familiar moment, made entirely your own.",
              },
            ].map(({ n, icon: Icon, title, text }) => (
              <article key={n}>
                <div className="step-top">
                  <span>{n}</span>
                  <Icon size={25} strokeWidth={1} />
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <RevealModes availableModes={availableModes} />
        <section className="making-moments section">
          <div className="moments-heading">
            <span className="eyebrow">The picture is only half of it</span>
            <h2>
              A little time together.
              <br />
              <em>Something to keep.</em>
            </h2>
            <p>
              Leave it on the table. Come back for a few more marks. The small
              moments become part of the picture, too.
            </p>
          </div>
          <div className="moments-grid">
            <figure>
              <div className="moment-photo">
                <img
                  src="/marketing/web/family-making-1280.webp"
                  srcSet="/marketing/web/family-making-640.webp 640w, /marketing/web/family-making-1280.webp 1280w"
                  sizes="(max-width: 700px) 100vw, 57vw"
                  width={1536}
                  height={1024}
                  loading="lazy"
                  alt="Illustrative family concept: two adults and two children adding small coloured marks to a partly completed dog portrait around a kitchen table"
                />
              </div>
              <figcaption>
                <small className="moment-disclosure">
                  Illustrative prototype · AI-generated
                </small>
                <span>01 / The making</span>
                <h3>A table everyone can come back to.</h3>
                <p>
                  A shared project, a quiet afternoon, a colour each. There’s no
                  need to finish it all today.
                </p>
              </figcaption>
            </figure>
            <figure>
              <div className="moment-photo">
                <img
                  src="/marketing/web/macaw-on-wall-1280.webp"
                  srcSet="/marketing/web/macaw-on-wall-640.webp 640w, /marketing/web/macaw-on-wall-1280.webp 1280w"
                  sizes="(max-width: 700px) 100vw, 43vw"
                  width={1536}
                  height={1024}
                  loading="lazy"
                  alt="Illustrative room concept: the studio’s colourful dotted macaw artwork framed above an oak cabinet"
                />
              </div>
              <figcaption>
                <small className="moment-disclosure">
                  Illustrative prototype · AI-generated
                </small>
                <span>02 / The keeping</span>
                <h3>A place on the wall. A story behind it.</h3>
                <p>
                  The photograph starts the story. The time you spend making it
                  adds another chapter.
                </p>
              </figcaption>
            </figure>
          </div>
        </section>
        <section className="signature-section section">
          <div className="signature-image">
            <img
              src="/marketing/web/home-hero-1280.webp"
              srcSet="/marketing/web/home-hero-640.webp 640w, /marketing/web/home-hero-1280.webp 1280w"
              sizes="(max-width: 760px) 100vw, 50vw"
              width={1536}
              height={1024}
              loading="lazy"
              alt="Illustrative concept: hands completing a dotted dog portrait on canvas"
            />
            <div className="image-note">
              Illustrative prototype · AI-generated
            </div>
          </div>
          <div className="signature-copy">
            <span className="eyebrow">Meet Signature Dots</span>
            <h2>
              Small marks.
              <br />
              <em>So much meaning.</em>
            </h2>
            <p>
              There’s something quietly satisfying about filling a circle. Then
              another. Until a picture you know by heart starts to appear.
            </p>
            <p>
              Our dot studio finds the light, shade and little details in your
              photo, and turns them into a guide you can follow.
            </p>
            <Link className="text-link" href="/lab/dots">
              Step inside the dot lab
              <ArrowRight size={17} />
            </Link>
            {availableModes.length > 1 && (
              <div className="mode-links">
                {availableModes.includes("fibonacci") && (
                  <Link href="/lab/fibonacci">
                    Fibonacci Spiral <ArrowUpRight size={14} />
                  </Link>
                )}
                {availableModes.includes("mosaic") && (
                  <Link href="/lab/mosaic">
                    Mosaic studies <ArrowUpRight size={14} />
                  </Link>
                )}
                {availableModes.includes("line-amplification") && (
                  <Link href="/lab/line-amplification">
                    Line studies <ArrowUpRight size={14} />
                  </Link>
                )}
                {availableModes.includes("colour-blend") && (
                  <Link href="/lab/colour-blend">
                    Colour Blend <ArrowUpRight size={14} />
                  </Link>
                )}
                {availableModes.includes("tv-weave") && (
                  <Link href="/lab/tv-weave">
                    TV Weave <ArrowUpRight size={14} />
                  </Link>
                )}
                {availableModes.includes("cross-stitch") && (
                  <Link href="/lab/cross-stitch">
                    Cross Stitch <ArrowUpRight size={14} />
                  </Link>
                )}
              </div>
            )}
            {availableModes.length > 1 && (
              <p className="fine-print">
                Alternative modes are experiments until physical making tests
                are complete.
              </p>
            )}
          </div>
        </section>
        <section className="kit-section section">
          <div>
            <span className="eyebrow">A considered little kit</span>
            <h2>
              Everything to begin.
              <br />
              <em>Time to make it yours.</em>
            </h2>
          </div>
          <div className="kit-list">
            {[
              "A canvas guide, made from your photograph",
              "Markers matched to your chosen colour key",
              "A simple guide to getting started",
              "Your finished preview, to keep beside you",
            ].map((text, i) => (
              <div key={text}>
                <span>0{i + 1}</span>
                <p>{text}</p>
                <Check size={18} />
              </div>
            ))}
            <p className="fine-print">
              Kit contents, materials and pricing are being validated through
              physical prototypes. The studio is open for exploration;
              purchasing opens after approval.
            </p>
          </div>
        </section>
        <PersonalisationSection />
        <section className="progression-section section">
          <span className="eyebrow">The same memory, seen differently</span>
          <h2>
            Watch it <em>come together.</em>
          </h2>
          <img
            src="/marketing/web/dots-progression-1280.webp"
            srcSet="/marketing/web/dots-progression-640.webp 640w, /marketing/web/dots-progression-1280.webp 1280w"
            sizes="(max-width: 760px) 100vw, 1100px"
            alt="The same photograph becomes an outlined dot template, partially completed dots and the finished artwork"
            loading="lazy"
          />
          <p className="fine-print">
            Digital rendering study from the same set of marks. Physical canvas
            results still need testing.
          </p>
          <Link href="/studies" className="text-link">
            Explore the studio studies
            <ArrowRight size={17} />
          </Link>
        </section>
        <PhotoSuitabilitySection />
        <CanvasChoiceSection />
        <section className="faq-section section">
          <div>
            <span className="eyebrow">A few things you might wonder</span>
            <h2>
              Before your
              <br />
              <em>first little mark.</em>
            </h2>
          </div>
          <div className="faq-list">
            {[
              {
                q: "Do I need to be artistic?",
                a: "The template gives you marks to fill at your own pace. Start with Easy for fewer, larger marks and a more relaxed making experience. Each mode has its own making guide.",
              },
              {
                q: "What makes a good photograph?",
                a: "Choose a sharp, well-lit photograph with your subject reasonably close. Strong contrast helps, especially for dark pets. Our studio gives basic exposure and contrast advice, and you can adjust the crop before making your template.",
              },
              {
                q: "Can I see the template before I decide?",
                a: "Yes. Switch between your original photo, finished artwork and printed template in the studio. Both artwork views are drawn from the same marks, so you can see exactly how the image is constructed.",
              },
              {
                q: "Which styles keep the picture a surprise?",
                a: "Try Colour Blend, TV Weave, colour Fibonacci Spiral or Cross Stitch. Their repeated marks reveal the image through colour as you work. Cross Stitch keeps the same grid even in blank areas. Number patterns can still give clues, so concealment depends on your photograph and settings. Compare the template before choosing.",
              },
              {
                q: "Can I add names or a date?",
                a: "Yes. Add a short line of text, choose a classic or simple typeface and pick a position within the safe area. The text appears in both previews.",
              },
              {
                q: "How long does it take?",
                a: "It depends on canvas size, detail and your pace. The studio estimates making time from mark count, but those estimates still need calibration against completed physical samples.",
              },
              {
                q: "Are you taking orders?",
                a: "Not yet. You can explore the studio and download prototype templates now. Live ordering will open after the canvas, printed guides and markers have passed physical testing.",
              },
            ].map((item) => (
              <details key={item.q}>
                <summary>
                  {item.q}
                  <span>+</span>
                </summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="final-cta">
          <span className="eyebrow">Start with something you love</span>
          <h2>
            Your photograph.
            <br />
            <em>A new way to remember.</em>
          </h2>
          <Link href="/create" className="button">
            Let’s make something
            <ArrowUpRight size={18} />
          </Link>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
