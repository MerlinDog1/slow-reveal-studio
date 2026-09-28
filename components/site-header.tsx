import Link from "next/link";
import { ArrowUpRight, ShoppingBag } from "lucide-react";

export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Slow Reveal Studio home">
      <span className="brand-mark" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      <span>
        slow reveal<span className="brand-small">S T U D I O</span>
      </span>
    </Link>
  );
}

export function SiteHeader({ studio = false }: { studio?: boolean }) {
  return (
    <header className="site-header">
      <Brand />
      <nav aria-label="Main navigation">
        <Link href="/#how-it-works">How it works</Link>
        <Link href="/lab/dots">The dot lab</Link>
        <Link href="/journal">Field notes</Link>
      </nav>
      <div className="header-actions">
        <Link className="bag-link" href="/basket" aria-label="Review your kit">
          <ShoppingBag size={19} />
        </Link>
        <Link className="button small" href={studio ? "/" : "/create"}>
          {studio ? "Back to studio home" : "Create your own"}
          <ArrowUpRight size={16} />
        </Link>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div>
        <Brand />
        <p>
          A little time. A meaningful image.
          <br />
          Something made by you.
        </p>
      </div>
      <div className="footer-links">
        <Link href="/studies">Studio studies</Link>
        <Link href="/photo-guide">Photo guide</Link>
        <Link href="/canvas-guide">Canvas sizes & finishes</Link>
        <Link href="/create">Create your own</Link>
        <Link href="/lab/dots">Rendering lab</Link>
        <Link href="/privacy">Your photos & privacy</Link>
        <Link href="/admin">Production desk</Link>
      </div>
      <p className="footer-note">
        Designed for a slower kind of making.
        <br />
        UK studio · In development
      </p>
    </footer>
  );
}
