import { SiteHeader, SiteFooter } from "@/components/site-header";
import { TrialRecorder } from "@/components/trial-recorder";
export const metadata = {
  title: "Physical making trials",
  robots: { index: false, follow: false },
};
export default function Trials() {
  return (
    <>
      <SiteHeader />
      <main className="trial-page">
        <span className="eyebrow">From screen to canvas</span>
        <h1>Make it. Measure it.</h1>
        <p>
          Test the real canvas, printed guide and pens together. Record what
          worked and what needs changing, without turning a digital preview into
          a product claim.
        </p>
        <TrialRecorder />
      </main>
      <SiteFooter />
    </>
  );
}
