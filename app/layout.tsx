import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "TRENDERA — Create the Trend", template: "%s | TRENDERA" },
  description: "TrendEra Brand — create the trend. Explore the store launch and contact the team.",
  applicationName: "TRENDERA",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: "/favicon.ico",
  },
  manifest: "/site.webmanifest",
  openGraph: {
    title: "TRENDERA — Create the Trend",
    description: "The official TrendEra Brand storefront.",
    type: "website",
    url: siteUrl,
    images: [{ url: "/og-image.jpg", width: 1200, height: 630, alt: "TRENDERA — Create the Trend" }],
  },
  twitter: { card: "summary_large_image", title: "TRENDERA — Create the Trend", description: "The official TrendEra Brand storefront.", images: ["/og-image.jpg"] },
  robots: { index: process.env.NEXT_PUBLIC_STORE_MODE === "live", follow: process.env.NEXT_PUBLIC_STORE_MODE === "live" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#050505" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <Script id="trendera-external-browser" strategy="beforeInteractive">
          {`(function () {
  "use strict";
  try {
    var ua = navigator.userAgent || navigator.vendor || "";
    var isSocialInApp = /Instagram|FBAN|FBAV|FB_IAB|Twitter|LinkedIn|Threads|Snapchat|TikTok|Line\\//i.test(ua);
    if (!isSocialInApp) return;

    var currentUrl = window.location.href;
    var isAndroid = /Android/i.test(ua);
    var isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
    if (!isAndroid && !isIOS) return;

    // Guard by the exact URL to avoid repeated intent redirects.
    var storageKey = "trendera_external_browser_attempted_url";
    try {
      if (window.sessionStorage.getItem(storageKey) === currentUrl) return;
      window.sessionStorage.setItem(storageKey, currentUrl);
      if (window.sessionStorage.getItem(storageKey) !== currentUrl) return;
    } catch (_storageError) {
      // If storage is blocked, avoid automatic redirects that could loop.
      return;
    }

    if (isAndroid) {
      var parsedUrl = new URL(currentUrl);
      var scheme = parsedUrl.protocol.replace(":", "");
      var intentTarget = parsedUrl.host + parsedUrl.pathname + parsedUrl.search;
      var fallbackUrl = encodeURIComponent(currentUrl);
      window.location.replace(
        "intent://" + intentTarget + "#Intent;scheme=" + scheme +
        ";package=com.android.chrome;S.browser_fallback_url=" + fallbackUrl + ";end"
      );
      return;
    }

    // iOS has no universal API for forcing Safari. Try Chrome if installed;
    // otherwise show manual instructions instead of repeatedly redirecting.
    var chromeUrl = currentUrl.replace(/^https:/i, "googlechromes:").replace(/^http:/i, "googlechrome:");
    window.location.href = chromeUrl;
    window.setTimeout(function () {
      if (document.visibilityState === "hidden" || !document.body) return;
      if (document.getElementById("trendera-browser-help")) return;
      var overlay = document.createElement("div");
      overlay.id = "trendera-browser-help";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,.96);color:#fff;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;text-align:center";
      var card = document.createElement("div");
      card.style.cssText = "width:100%;max-width:420px;padding:26px;border:1px solid rgba(255,255,255,.18);border-radius:18px;background:#101010;box-shadow:0 24px 70px rgba(0,0,0,.45)";
      var title = document.createElement("h2");
      title.textContent = "Open TrendEra in your browser";
      title.style.cssText = "font-size:21px;line-height:1.3;margin:0 0 12px;font-weight:700";
      var message = document.createElement("p");
      message.textContent = "This app may block automatic browser switching. Tap the menu (••• or ⋮) and choose ‘Open in browser’ or ‘Open in Chrome/Safari’.";
      message.style.cssText = "margin:0;color:#c8c8c8;font-size:15px;line-height:1.65";
      var button = document.createElement("button");
      button.type = "button";
      button.textContent = "Continue on this page";
      button.style.cssText = "margin-top:20px;padding:12px 18px;border:1px solid #777;border-radius:10px;background:#fff;color:#080808;font:inherit;font-weight:650;cursor:pointer";
      button.addEventListener("click", function () { overlay.remove(); });
      card.appendChild(title);
      card.appendChild(message);
      card.appendChild(button);
      overlay.appendChild(card);
      document.body.appendChild(overlay);
    }, 1000);
  } catch (_error) {
    // Browser detection must never prevent the storefront from rendering.
  }
})();`}
        </Script>
      </head>
      <body>
        <a className="skip-link" href="#main-content">Skip to content</a>
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
