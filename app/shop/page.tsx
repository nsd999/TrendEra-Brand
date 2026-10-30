import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Shop", description: "Explore published TrendEra products." };

type ProductRow = {
  id: string;
  name: string;
  description: string;
  category?: string;
  image_url?: string;
  product_variants?: { id: string; label: string; price: number | string; is_active: boolean }[];
};

async function getPublishedProducts(): Promise<ProductRow[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.from("products")
    .select("id,name,description,category,image_url,product_variants(id,label,price,is_active)")
    .eq("status", "published")
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return (data as ProductRow[]).map((product) => ({
    ...product,
    product_variants: (product.product_variants ?? []).filter((variant) => variant.is_active && Number(variant.price) > 0),
  })).filter((product) => product.product_variants?.length);
}

export default async function ShopPage() {
  const products = await getPublishedProducts();
  return (
    <main id="main-content" className="site-shell page">
      <div className="eyebrow">TRENDERA · COLLECTION</div>
      <h1>Shop the collection.</h1>
      <p className="lead">Browse currently published products. Online payment is handled by Cashfree; cash on delivery remains available where configured.</p>
      {products.length === 0 ? (
        <div className="empty-catalog">
          <h2>No products published yet</h2>
          <p>We do not show sample items, fake prices, or placeholder stock. Publish active product variants with valid Qikink mappings to make the collection available.</p>
          <Link className="button" href="/contact-us">Contact the store</Link>
        </div>
      ) : (
        <>
          <div className="my-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <article key={product.id} className="rounded-2xl border border-black/10 p-5 bg-white shadow-sm flex flex-col justify-between">
                <div>
                  {product.image_url && (
                    <div className="relative mb-4 aspect-square w-full overflow-hidden rounded-xl bg-neutral-100">
                      <Image
                        src={product.image_url}
                        alt={product.name}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover"
                      />
                    </div>
                  )}
                  {product.category && (
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-black/50">{product.category}</span>
                  )}
                  <h2 className="text-xl font-semibold mt-1">{product.name}</h2>
                  {product.description && <p className="mt-2 text-sm leading-6 text-black/65">{product.description}</p>}
                </div>
                <div className="mt-4 space-y-2 border-t border-black/10 pt-3">
                  {product.product_variants?.map((variant) => (
                    <div key={variant.id} className="flex items-center justify-between gap-3 text-sm">
                      <span>{variant.label}</span><strong>₹{Number(variant.price).toFixed(2)}</strong>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
          <Link className="button" href="/checkout">Choose items &amp; checkout</Link>
        </>
      )}
    </main>
  );
}
