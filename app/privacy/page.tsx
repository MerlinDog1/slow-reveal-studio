import { SiteHeader, SiteFooter } from "@/components/site-header";
export const metadata = { title: "Your photographs & privacy" };
export default function Privacy() {
  return (
    <>
      <SiteHeader />
      <main className="content-page">
        <span className="eyebrow">Your memories belong to you</span>
        <h1>Your photographs, handled with care.</h1>
        <div className="prose-card">
          <h2>While you explore</h2>
          <p>
            Your uploads are processed in your browser. “Save design” in the
            studio saves the source photo and settings to this device’s browser
            storage. Other people using the same browser profile may be able to
            reopen them. Remove saved designs from the studio when you finish on
            a shared device.
          </p>
          <h2>When you save a private design</h2>
          <p>
            Choosing “Save a private design” on the review page uploads your
            photograph and settings to the studio server. Source photos and
            artwork are private and require a private access link. Treat that
            link like a password. Unpurchased designs expire after 30 days;
            expired designs are unavailable. An administrator cleanup action
            removes unattached expired files; automated scheduling must be
            configured before launch.
          </p>
          <h2>Deleting a design</h2>
          <p>
            Open the private link and select “Delete private design” to remove
            the saved design and source. Paid production snapshots are retained
            separately for fulfilment and order records. Production retention
            and the business contact for order-data requests must be configured
            before launch.
          </p>
          <h2>No public gallery by default</h2>
          <p>
            Photographs are not published in a gallery, used as customer
            testimonials or submitted for model training. No marketing
            permission is assumed. Only use images you have permission to use.
          </p>
          <h2>Payments and delivery</h2>
          <p>
            Live checkout remains unavailable during physical prototyping. When
            enabled, Stripe handles payment details; the studio receives the
            order and delivery information needed to fulfil your kit. The studio
            does not store card numbers.
          </p>
          <h2>Optional analytics</h2>
          <p>
            Analytics are off until you allow them. With permission, the studio
            records a short list of actions, selected styles and canvas sizes on
            its own service. These events exclude photographs, names, emails,
            personalisation and private links. A random identifier connects
            steps within this browser tab; your preference stays on this device.
            Change it using “Analytics settings”. Declining clears pending
            events and stops new analytics requests. Aggregate reporting covers
            30 days.
          </p>
          <h2>Prototype status</h2>
          <p>
            This page describes the current prototype’s behaviour. The business
            identity, contact information, final retention schedule and full
            privacy notice need approval before a public commercial launch.
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
