import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { getAuthoritativeCatalogue } from "@/lib/woocommerce/catalogue";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Shop",
  description: "Explore published TrendEra products.",
};

export default async function ShopPage() {
  const { products, isEmpty, upstreamError, isDegraded } = await getAuthoritativeCatalogue();

  return (
    <main id="main-content" className="site-shell page">
      <div className="eyebrow">TRENDERA · COLLECTION</div>
      <h1>Shop the collection.</h1>
      <p className="lead">
        Browse currently published products. Authoritative catalogue and stock are managed through WooCommerce. Online payments are secured by Cashfree.
      </p>

      {isDegraded && upstreamError && (
        <div className="mb-6 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-900" role="status">
          <p className="font-semibold">Notice: Live WooCommerce catalogue sync notice</p>
          <p className="mt-1 text-xs opacity-80">{upstreamError}</p>
        </div>
      )}

      {isEmpty ? (
        <div className="empty-catalog">
          <h2>No products published yet</h2>
          <p>
            We do not show sample items, fake prices, or placeholder stock. Publish active products in WooCommerce to make the collection available.
          </p>
          <Link className="button" href="/contact-us">
            Contact the store
          </Link>
        </div>
      ) : (
        <>
          <div className="my-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <article key={product.id} className="flex flex-col rounded-2xl border border-black/10 p-5 bg-white shadow-sm transition hover:shadow-md">
                {product.images[0]?.src && (
                  <div className="relative mb-4 aspect-square w-full overflow-hidden rounded-xl bg-neutral-100">
                    <Image
                      src={product.images[0].src}
                      alt={product.images[0].alt || product.name}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover"
                    />
                  </div>
                )}
                <h2 className="text-xl font-semibold text-black">{product.name}</h2>
                {product.shortDescription ? (
                  <div
                    className="mt-2 text-sm leading-6 text-black/65 line-clamp-2"
                    dangerouslySetInnerHTML={{ __html: product.shortDescription }}
                  />
                ) : product.description ? (
                  <div
                    className="mt-2 text-sm leading-6 text-black/65 line-clamp-2"
                    dangerouslySetInnerHTML={{ __html: product.description }}
                  />
                ) : null}
                <div className="mt-4 flex-1 space-y-2">
                  {product.variants.map((variant) => (
                    <div
                      key={variant.id}
                      className="flex items-center justify-between gap-3 border-t border-black/10 pt-3 text-sm"
                    >
                      <span className="text-black/75">{variant.label}</span>
                      <strong className="text-black">₹{variant.price.toFixed(2)}</strong>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
          <Link className="button" href="/checkout">
            Choose items &amp; checkout
          </Link>
        </>
      )}
    </main>
  );
}
