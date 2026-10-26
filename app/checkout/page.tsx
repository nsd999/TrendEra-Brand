import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { TrendEraCheckout, type CheckoutProduct } from "@/components/trendera-checkout";

export const dynamic = "force-dynamic";
export const metadata = { title: "Checkout | TrendEra", description: "Secure checkout for TrendEra products." };

async function getPublishedVariants(): Promise<CheckoutProduct[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase
    .from("product_variants")
    .select("id,label,price,sku,products!inner(name,status)")
    .eq("is_active", true)
    .eq("products.status", "published")
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data.flatMap((row) => {
    const product = Array.isArray(row.products) ? row.products[0] : row.products;
    if (!product?.name || typeof row.id !== "string" || typeof row.label !== "string") return [];
    const price = Number(row.price);
    if (!Number.isFinite(price) || price <= 0) return [];
    return [{ id: row.id, name: product.name, label: row.label, price, sku: row.sku }];
  });
}

export default async function CheckoutPage() {
  const products = await getPublishedVariants();
  return (
    <main id="main-content" className="site-shell page">
      <div className="eyebrow">TRENDERA · SECURE CHECKOUT</div>
      <h1>Checkout.</h1>
      <p className="lead">Review your selection and delivery details. Online payments are securely processed by Cashfree.</p>
      <div className="my-6"><Link className="button secondary" href="/shop">← Back to collection</Link></div>
      <TrendEraCheckout products={products} />
    </main>
  );
}
