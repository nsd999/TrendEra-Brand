import type { Metadata, Viewport } from "next";
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
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
  },
  manifest: "/site.webmanifest",
  openGraph: {
    title: "TRENDERA — Create the Trend",
    description: "The official TrendEra Brand storefront.",
    type: "website",
    url: siteUrl,
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "TRENDERA — Create the Trend",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "TRENDERA — Create the Trend",
    description: "The official TrendEra Brand storefront.",
    images: ["/og-image.jpg"],
  },
  robots: { index: process.env.NEXT_PUBLIC_STORE_MODE === "live", follow: process.env.NEXT_PUBLIC_STORE_MODE === "live" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#050505" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><a className="skip-link" href="#main-content">Skip to content</a><SiteHeader />{children}<SiteFooter /></body></html>;
}
