import Link from "next/link";
import { getAuthoritativeCatalogue } from "@/lib/woocommerce/catalogue";
import { TrendEraCheckout, type CheckoutProduct } from "@/components/trendera-checkout";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Checkout | TrendEra",
  description: "Secure checkout for TrendEra products.",
};

async function getAuthoritativeVariants(): Promise<CheckoutProduct[]> {
  const { products } = await getAuthoritativeCatalogue({ perPage: 100 });
  return products.flatMap((product) =>
    product.variants
      .filter((v) => v.inStock && v.price > 0)
      .map((variant) => ({
        id: variant.id,
        name: product.name,
        label: variant.label,
        price: variant.price,
        sku: variant.sku,
      })),
  );
}

export default async function CheckoutPage() {
  const products = await getAuthoritativeVariants();
  return (
    <main id="main-content" className="site-shell page">
      <div className="eyebrow">TRENDERA · SECURE CHECKOUT</div>
      <h1>Checkout.</h1>
      <p className="lead">
        Review your selection and delivery details. Online payments are securely processed by Cashfree.
      </p>
      <div className="my-6">
        <Link className="button secondary" href="/shop">
          ← Back to collection
        </Link>
      </div>
      <TrendEraCheckout products={products} />
    </main>
  );
}
