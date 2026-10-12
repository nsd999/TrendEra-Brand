import Link from "next/link";
import Image from "next/image";
import { Search, ShoppingBag, UserRound } from "lucide-react";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-shell header-inner">
        <Link href="/" className="brand" aria-label="TrendEra home">
          <Image
            src="/brand/trendera-logo-horizontal.png"
            alt="TrendEra — Create the Trend"
            width={160}
            height={97}
            priority
            className="brand-logo-img"
          />
        </Link>
        <nav className="nav" aria-label="Main navigation">
          <Link href="/">Home</Link>
          <Link href="/shop">Shop</Link>
          <Link href="/about">About</Link>
          <Link href="/contact-us">Contact</Link>
        </nav>
        <div className="header-actions">
          <Link href="/search" aria-label="Search" className="icon-link">
            <Search size={18} strokeWidth={1.5} />
          </Link>
          <Link href="/account" aria-label="Account" className="icon-link">
            <UserRound size={18} strokeWidth={1.5} />
          </Link>
          <Link href="/cart" aria-label="Shopping bag" className="icon-link">
            <ShoppingBag size={18} strokeWidth={1.5} />
          </Link>
        </div>
      </div>
    </header>
  );
}
