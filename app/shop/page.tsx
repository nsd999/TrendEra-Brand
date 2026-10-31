import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { getStorefrontClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Shop the Collection",
  description: "Explore published authentic TrendEra products fulfilled directly via Qikink.",
};

type ProductVariantRow = {
  id: string;
  label: string;
  sku: string;
  qikink_sku: string;
  price: number | string;
  cost_price?: number;
  mockup_link?: string;
  is_active: boolean;
};

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number | string;
  category?: string;
  image_url?: string;
  qikink_product_id?: string;
  status: string;
  product_variants?: ProductVariantRow[];
};

async function getPublishedProducts(): Promise<ProductRow[]> {
  const supabase = getStorefrontClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("products")
    .select("id,name,slug,description,price,category,image_url,qikink_product_id,status,product_variants(id,label,sku,qikink_sku,price,cost_price,mockup_link,is_active)")
    .eq("status", "published")
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  return (data as ProductRow[])
    .map((product) => ({
      ...product,
      product_variants: (product.product_variants ?? []).filter(
        (variant) =>
          variant.is_active &&
          Number(variant.price) > 0 &&
          Boolean(variant.qikink_sku?.trim()),
      ),
    }))
    .filter((product) => (product.product_variants?.length ?? 0) > 0);
}

export default async function ShopPage() {
  const products = await getPublishedProducts();

  return (
    <main id="main-content" className="site-shell page">
      <div className="eyebrow">TRENDERA · COLLECTION</div>
      <h1>Shop the collection.</h1>
      <p className="lead">
        Browse currently published print-on-demand pieces. Every design is crafted with precision, printed on demand, and delivered straight to your door.
      </p>

      {products.length === 0 ? (
        <div className="empty-catalog">
          <h2>No products published yet</h2>
          <p>
            We do not show sample items, fake prices, or placeholder stock. Products will appear here as soon as they are published with verified Qikink fulfillment SKUs.
          </p>
          <div className="flex justify-center gap-4 mt-6">
            <Link className="button" href="/contact-us">
              Contact the store
            </Link>
            <Link className="button secondary" href="/admin/integrations/qikink">
              Admin Dashboard →
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="my-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => {
              const displayImage = product.image_url || product.product_variants?.[0]?.mockup_link;
              const prices = product.product_variants?.map((v) => Number(v.price)) || [Number(product.price)];
              const minPrice = Math.min(...prices);
              const maxPrice = Math.max(...prices);
              const priceDisplay =
                minPrice === maxPrice
                  ? `₹${minPrice.toFixed(2)}`
                  : `₹${minPrice.toFixed(2)} – ₹${maxPrice.toFixed(2)}`;

              return (
                <article
                  key={product.id}
                  className="rounded-2xl border border-[#202020] bg-gradient-to-b from-[#111] to-[#0a0a0a] p-5 shadow-lg flex flex-col justify-between hover:border-[#383838] transition-all group"
                >
                  <div>
                    {displayImage ? (
                      <div className="relative mb-5 aspect-square w-full overflow-hidden rounded-xl bg-[#161616] border border-[#222]">
                        <Image
                          src={displayImage}
                          alt={product.name}
                          fill
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                          className="object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      </div>
                    ) : (
                      <div className="relative mb-5 aspect-square w-full flex items-center justify-center rounded-xl bg-[#161616] border border-[#222] text-neutral-600">
                        <span className="text-xs uppercase tracking-widest">No preview image</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2 mb-2">
                      {product.category && (
                        <span className="inline-block rounded-full bg-[#181818] border border-[#2c2c2c] px-2.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold text-neutral-400">
                          {product.category}
                        </span>
                      )}
                      <span className="text-sm font-bold text-white tracking-tight">
                        {priceDisplay}
                      </span>
                    </div>

                    <h2 className="text-lg font-bold text-white tracking-tight group-hover:text-emerald-400 transition-colors">
                      {product.name}
                    </h2>

                    {product.description && (
                      <p className="mt-2 text-xs leading-relaxed text-neutral-400 line-clamp-3">
                        {product.description}
                      </p>
                    )}
                  </div>

                  <div className="mt-6 border-t border-[#202020] pt-4">
                    <div className="space-y-1.5 mb-4 max-h-36 overflow-y-auto pr-1">
                      <div className="text-[10px] uppercase tracking-widest text-neutral-500 font-semibold mb-1">
                        Available Variants ({product.product_variants?.length ?? 0}):
                      </div>
                      {product.product_variants?.slice(0, 4).map((variant) => (
                        <div
                          key={variant.id}
                          className="flex items-center justify-between gap-3 text-xs text-neutral-400 bg-[#141414] px-2.5 py-1.5 rounded-lg border border-[#222]"
                        >
                          <span className="truncate">{variant.label}</span>
                          <strong className="text-white">₹{Number(variant.price).toFixed(2)}</strong>
                        </div>
                      ))}
                      {(product.product_variants?.length ?? 0) > 4 && (
                        <p className="text-[10px] text-neutral-500 text-center pt-1">
                          +{(product.product_variants?.length ?? 0) - 4} more sizes/colours available
                        </p>
                      )}
                    </div>

                    <Link
                      className="button w-full text-center justify-center"
                      href={`/checkout`}
                    >
                      Select &amp; Order
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="flex justify-center mt-12">
            <Link className="button" href="/checkout">
              Go to Checkout →
            </Link>
          </div>
        </>
      )}
    </main>
  );
}
