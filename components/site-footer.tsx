import Link from "next/link";
import Image from "next/image";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-shell">
        <div className="footer-top">
          <div className="footer-brand">
            <Link href="/" aria-label="TrendEra home" className="footer-brand-logo">
              <Image
                src="/brand/trendera-logo-horizontal.png"
                alt="TrendEra — Create the Trend"
                width={150}
                height={91}
                className="footer-logo-img"
              />
            </Link>
            <p>Independent style. Everyday confidence. A new chapter is taking shape.</p>
          </div>
          <nav className="footer-links" aria-label="Footer navigation">
            <Link href="/shop">Shop</Link>
            <Link href="/about">About</Link>
            <Link href="/contact-us">Contact</Link>
            <Link href="/shipping">Shipping</Link>
            <Link href="/returns">Returns</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </nav>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} TrendEra Brand. All rights reserved.</span>
          <span>CREATE THE TREND.</span>
        </div>
      </div>
    </footer>
  );
}
