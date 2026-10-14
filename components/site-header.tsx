"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Menu, Search, ShoppingBag, UserRound, X, ChevronDown } from "lucide-react";

const primaryLinks = [
  { href: "/", label: "Home" },
  { href: "/shop", label: "Shop" },
  { href: "/about", label: "About" },
  { href: "/contact-us", label: "Contact" },
];

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const updateScroll = () => setScrolled(window.scrollY > 12);
    updateScroll();
    window.addEventListener("scroll", updateScroll, { passive: true });
    return () => window.removeEventListener("scroll", updateScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className={`site-header ${scrolled ? "is-scrolled" : ""}`}>
      <div className="site-shell header-inner">
        <button
          className="mobile-menu-trigger icon-link"
          type="button"
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={20} strokeWidth={1.6} /> : <Menu size={20} strokeWidth={1.6} />}
        </button>

        <Link href="/" className="brand" aria-label="TrendEra home" onClick={closeMenu}>
          <Image
            src="/brand/trendera-logo-horizontal.png"
            alt="TrendEra — Create the Trend"
            width={160}
            height={97}
            priority
            className="brand-logo-img"
          />
        </Link>

        <nav className="nav desktop-nav" aria-label="Main navigation">
          {primaryLinks.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
              {item.href === "/shop" && <ChevronDown className="nav-chevron" size={12} aria-hidden="true" />}
            </Link>
          ))}
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

      <div
        className={`mobile-nav-overlay ${menuOpen ? "is-open" : ""}`}
        aria-hidden={!menuOpen}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeMenu();
        }}
      >
        <nav id="mobile-navigation" className="mobile-nav-panel" aria-label="Mobile navigation" inert={!menuOpen}>
          <div className="mobile-nav-heading">
            <span>Explore TrendEra</span>
            <button type="button" className="icon-link" aria-label="Close navigation menu" onClick={closeMenu}>
              <X size={18} />
            </button>
          </div>
          {primaryLinks.map((item, index) => (
            <Link key={item.href} href={item.href} className="mobile-nav-link" onClick={closeMenu}>
              <span className="mobile-nav-index">0{index + 1}</span>
              <span>{item.label}</span>
              <span className="mobile-nav-arrow" aria-hidden="true">↗</span>
            </Link>
          ))}
          <div className="mobile-nav-note">Independent style. Everyday confidence.</div>
        </nav>
      </div>
    </header>
  );
}
