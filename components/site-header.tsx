import Link from "next/link";
import { Search, ShoppingBag, UserRound } from "lucide-react";
export function SiteHeader() {
  return <header className="site-header"><div className="site-shell header-inner">
    <Link href="/" className="brand" aria-label="TrendEra home"><span className="brand-mark">T</span><span className="brand-word">TREND<span>ERA</span><small>CREATE THE TREND</small></span></Link>
    <nav className="nav" aria-label="Main navigation"><Link href="/">Home</Link><Link href="/shop">Shop</Link><Link href="/about">About</Link><Link href="/contact-us">Contact</Link></nav>
    <div className="header-actions"><Link href="/search" aria-label="Search" className="icon-link"><Search size={18} strokeWidth={1.5}/></Link><Link href="/account" aria-label="Account" className="icon-link"><UserRound size={18} strokeWidth={1.5}/></Link><Link href="/cart" aria-label="Shopping bag" className="icon-link"><ShoppingBag size={18} strokeWidth={1.5}/></Link></div>
  </div></header>;
}
