import Link from "next/link";
export function SiteFooter() {
  return <footer className="site-footer"><div className="site-shell"><div className="footer-top"><div className="footer-brand"><strong>TREND<span>ERA</span></strong><p>Independent style. Everyday confidence. A new chapter is taking shape.</p></div><nav className="footer-links" aria-label="Footer navigation"><Link href="/shop">Shop</Link><Link href="/about">About</Link><Link href="/contact-us">Contact</Link><Link href="/shipping">Shipping</Link><Link href="/returns">Returns</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></nav></div><div className="footer-bottom"><span>© {new Date().getFullYear()} TrendEra Brand. All rights reserved.</span><span>CREATE THE TREND.</span></div></div></footer>;
}
