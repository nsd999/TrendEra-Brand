import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Shop", description: "Explore published TrendEra products." };

type ProductRow = { id: string; name: string; description: string; product_variants?: { id: string; label: string; price: number | string; is_active: boolean }[] };

async function getPublishedProducts(): Promise<ProductRow[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.from("products")
    .select("id,name,description,product_variants(id,label,price,is_active)")
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
              <article key={product.id} className="rounded-2xl border border-black/10 p-5">
                <h2 className="text-xl font-semibold">{product.name}</h2>
                {product.description && <p className="mt-2 text-sm leading-6 text-black/65">{product.description}</p>}
                <div className="mt-4 space-y-2">
                  {product.product_variants?.map((variant) => (
                    <div key={variant.id} className="flex items-center justify-between gap-3 border-t border-black/10 pt-3 text-sm">
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
