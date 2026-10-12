import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
const pages: Record<string, {title:string;eyebrow:string;body:string[]}> = {
  about:{title:"About TrendEra",eyebrow:"OUR STORY",body:["TrendEra is an independent brand built around personal style, everyday confidence, and the joy of finding pieces that feel like you.","We are preparing our online storefront. New collection details will be shared here when they are ready."]},
  privacy:{title:"Privacy policy",eyebrow:"YOUR PRIVACY",body:["This starter site only processes information you submit through the contact form. Form submissions are sent to the store email through the configured email provider and are not stored in this website database by this code.","Before launch, replace this draft with a reviewed policy explaining your actual analytics, cookies, data retention, payment, shipping, customer support, and legal obligations."]},
  terms:{title:"Terms of use",eyebrow:"TERMS",body:["This website is currently an informational launch page. No product orders or payments are taken through this starter.","Before enabling checkout, publish reviewed terms covering purchases, prices, payment, cancellations, liability, dispute resolution, and applicable law."]},
  shipping:{title:"Shipping information",eyebrow:"DELIVERY",body:["Shipping options, delivery estimates, charges, and serviceable pin codes will be published when the store opens.","No order can be placed through this starter, so no delivery timeline is being promised."]},
  returns:{title:"Returns and refunds",eyebrow:"RETURNS",body:["The storefront is not currently accepting purchases. Return, exchange, cancellation, and refund rules must be reviewed and published before checkout is enabled."]},
  cart:{title:"Your bag",eyebrow:"SHOPPING BAG",body:["Your persistent shopping cart is not connected yet. No items have been added and no orders can be placed from this starter."]},
  search:{title:"Search",eyebrow:"FIND YOUR STYLE",body:["Search will be enabled when a real product catalogue is connected. No placeholder results are displayed."]},
  account:{title:"Your account",eyebrow:"ACCOUNT",body:["Customer sign-in and account management are not enabled yet. We will share an update when these features are ready."]},
  orders:{title:"Your orders",eyebrow:"ORDER HISTORY",body:["Order history will be available after secure sign-in and order processing are implemented. This starter does not accept orders."]}
};
export function generateStaticParams(){return Object.keys(pages).map(slug=>({slug}));}
export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{const {slug}=await params;const page=pages[slug];return page?{title:page.title}:{title:"Page not found"};}
export default async function InfoPage({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const page=pages[slug];if(!page)notFound();return <main id="main-content" className="site-shell page"><div className="eyebrow">{page.eyebrow}</div><h1>{page.title}</h1><div className="page-copy">{page.body.map(p=><p key={p}>{p}</p>)}</div><div className="actions" style={{justifyContent:"flex-start"}}><Link className="button" href="/shop">Explore the shop</Link><Link className="button secondary" href="/contact-us">Contact us</Link></div></main>;}
