import type { Metadata } from "next";
import Link from "next/link";
export const metadata: Metadata = { title: "Shop" };
export default function ShopPage(){return <main id="main-content" className="site-shell page"><div className="eyebrow">TRENDERA · COLLECTION</div><h1>Shop the collection.</h1><p className="lead">The collection is being prepared. Product listings will appear here once the verified catalogue is connected.</p><div className="empty-catalog"><h2>No products published yet</h2><p>We do not show sample items, fake prices, or placeholder stock. Check back soon or contact us for launch information.</p><Link className="button" href="/contact-us">Contact the store</Link></div></main>;}
