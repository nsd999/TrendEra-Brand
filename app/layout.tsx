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
  openGraph: { title: "TRENDERA — Create the Trend", description: "The official TrendEra Brand storefront.", type: "website" },
  robots: { index: process.env.NEXT_PUBLIC_STORE_MODE === "live", follow: process.env.NEXT_PUBLIC_STORE_MODE === "live" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#050505" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><a className="skip-link" href="#main-content">Skip to content</a><SiteHeader />{children}<SiteFooter /></body></html>;
}
