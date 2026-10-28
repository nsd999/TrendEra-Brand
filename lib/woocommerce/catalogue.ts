import "server-only";

import { createClient } from "@supabase/supabase-js";
import {
  getWooCommerceProducts,
  type NormalizedProduct,
  type NormalizedProductVariant,
} from "./client.ts";

export type CatalogueResult = {
  products: NormalizedProduct[];
  source: "woocommerce" | "supabase_fallback";
  isEmpty: boolean;
  upstreamError?: string;
  isDegraded?: boolean;
};

export type ValidatedLineItem = {
  productId: string;
  variantId: string;
  name: string;
  label: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  qikinkSku?: string;
  designCode?: string | null;
  designLink?: string | null;
  mockupLink?: string | null;
  widthInches?: number | string | null;
  heightInches?: number | string | null;
  placementSku?: string | null;
  printTypeId?: number;
};

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Fetches products from Supabase as a fallback when WooCommerce upstream is offline or challenge-blocked.
 */
async function getSupabaseFallbackProducts(): Promise<NormalizedProduct[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  type SupabaseProductRow = {
    id: string;
    name: string;
    description: string | null;
    product_variants?: Array<{
      id: string;
      label: string;
      sku: string;
      price: number | string;
      compare_at_price: number | string | null;
      stock_quantity: number | null;
      is_active: boolean;
    }>;
  };

  const { data, error } = await supabase
    .from("products")
    .select("id,name,description,product_variants(id,label,sku,price,compare_at_price,stock_quantity,is_active)")
    .eq("status", "published")
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  return (data as SupabaseProductRow[])
    .map((prod) => {
      const activeVariants = (prod.product_variants ?? [])
        .filter((v) => v.is_active && Number(v.price) > 0)
        .map((v): NormalizedProductVariant => ({
          id: v.id,
          label: v.label,
          sku: v.sku,
          price: Number(v.price),
          regularPrice: v.compare_at_price ? Number(v.compare_at_price) : undefined,
          stockQuantity: v.stock_quantity,
          inStock: v.stock_quantity === null || v.stock_quantity > 0,
          attributes: {},
        }));

      const defaultVariant = activeVariants[0];
      return {
        id: prod.id,
        name: prod.name,
        slug: prod.id,
        description: prod.description || "",
        shortDescription: "",
        type: "variable" as const,
        price: defaultVariant?.price ?? 0,
        inStock: activeVariants.some((v) => v.inStock),
        images: [],
        variants: activeVariants,
        sku: defaultVariant?.sku ?? `PRD-${prod.id}`,
      };
    })
    .filter((prod) => prod.variants.length > 0);
}

/**
 * Retrieves the authoritative product catalogue.
 * Primary source: WooCommerce.
 * Fallback: Supabase (only if WooCommerce is unconfigured or blocked by hosting challenge).
 */
export async function getAuthoritativeCatalogue(options: {
  page?: number;
  perPage?: number;
  fetchImpl?: typeof fetch;
} = {}): Promise<CatalogueResult> {
  try {
    const wcProducts = await getWooCommerceProducts(options);

    // If WooCommerce succeeds and returns products or []
    return {
      products: wcProducts,
      source: "woocommerce",
      isEmpty: wcProducts.length === 0,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "WooCommerce catalogue fetch failed.";

    // Attempt graceful fallback to Supabase so storefront doesn't hard-crash
    const fallbackProducts = await getSupabaseFallbackProducts();

    return {
      products: fallbackProducts,
      source: "supabase_fallback",
      isEmpty: fallbackProducts.length === 0,
      upstreamError: errorMsg,
      isDegraded: true,
    };
  }
}

/**
 * Validates requested line items against WooCommerce (or fallback catalogue).
 * Re-computes unit prices and totals server-side.
 */
export async function validateRequestedCartItems(
  items: Array<{ variantId: string; quantity: number }>,
  fetchImpl?: typeof fetch,
): Promise<{
  valid: boolean;
  error?: string;
  validatedItems?: ValidatedLineItem[];
  totalAmount?: number;
  source: "woocommerce" | "supabase";
}> {
  if (!items || items.length === 0) {
    return { valid: false, error: "Cart is empty.", source: "woocommerce" };
  }

  // 1. Try to validate against WooCommerce
  try {
    const wcProducts = await getWooCommerceProducts({ fetchImpl, perPage: 100 });
    if (wcProducts.length > 0) {
      const validated: ValidatedLineItem[] = [];
      let total = 0;

      for (const reqItem of items) {
        let foundVariant: NormalizedProductVariant | undefined;
        let parentProduct: NormalizedProduct | undefined;

        for (const prod of wcProducts) {
          const v = prod.variants.find((variant) => variant.id === reqItem.variantId);
          if (v) {
            foundVariant = v;
            parentProduct = prod;
            break;
          }
        }

        if (!foundVariant || !parentProduct) {
          return {
            valid: false,
            error: `One or more selected items (ID: ${reqItem.variantId}) are no longer available in WooCommerce.`,
            source: "woocommerce",
          };
        }

        if (!foundVariant.inStock) {
          return {
            valid: false,
            error: `Item "${parentProduct.name} - ${foundVariant.label}" is currently out of stock.`,
            source: "woocommerce",
          };
        }

        if (foundVariant.stockQuantity !== null && foundVariant.stockQuantity < reqItem.quantity) {
          return {
            valid: false,
            error: `Only ${foundVariant.stockQuantity} units available for "${parentProduct.name} - ${foundVariant.label}".`,
            source: "woocommerce",
          };
        }

        const unitPrice = foundVariant.price;
        total += unitPrice * reqItem.quantity;

        validated.push({
          productId: parentProduct.id,
          variantId: foundVariant.id,
          name: parentProduct.name,
          label: foundVariant.label,
          sku: foundVariant.sku,
          unitPrice,
          quantity: reqItem.quantity,
          qikinkSku: foundVariant.sku, // Default to SKU or metadata
        });
      }

      const safeTotal = Math.round(total * 100) / 100;
      return {
        valid: true,
        validatedItems: validated,
        totalAmount: safeTotal,
        source: "woocommerce",
      };
    }
  } catch {
    // Fall back to Supabase validation below if WooCommerce is unreachable
  }

  // 2. Validate against Supabase
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      valid: false,
      error: "Store catalogue backend is currently unavailable.",
      source: "supabase",
    };
  }

  const uniqueVariantIds = [...new Set(items.map((i) => i.variantId))];
  const { data: dbVariants, error: dbErr } = await supabase
    .from("product_variants")
    .select("id,label,sku,qikink_sku,price,stock_quantity,is_active,design_code,design_link,mockup_link,width_inches,height_inches,placement_sku,print_type_id,products!inner(id,name,status)")
    .in("id", uniqueVariantIds);

  if (dbErr || !dbVariants || dbVariants.length !== uniqueVariantIds.length) {
    return {
      valid: false,
      error: "One or more products are no longer available in the catalogue.",
      source: "supabase",
    };
  }

  type VariantRow = {
    id: string;
    label: string;
    sku: string;
    qikink_sku: string;
    price: number | string;
    stock_quantity: number | null;
    is_active: boolean;
    design_code: string | null;
    design_link: string | null;
    mockup_link: string | null;
    width_inches: number | string | null;
    height_inches: number | string | null;
    placement_sku: string | null;
    print_type_id: number;
    products: { id: string; name: string; status: string } | { id: string; name: string; status: string }[];
  };

  const variants = dbVariants as unknown as VariantRow[];
  const byId = new Map(variants.map((v) => [v.id, v]));

  const validated: ValidatedLineItem[] = [];
  let total = 0;

  for (const item of items) {
    const variant = byId.get(item.variantId);
    const product = Array.isArray(variant?.products) ? variant.products[0] : variant?.products;

    if (!variant || !variant.is_active || product?.status !== "published") {
      return {
        valid: false,
        error: "One or more products are inactive or unpublished.",
        source: "supabase",
      };
    }

    if (variant.stock_quantity !== null && variant.stock_quantity < item.quantity) {
      return {
        valid: false,
        error: `Insufficient stock for "${product.name} - ${variant.label}".`,
        source: "supabase",
      };
    }

    const unitPrice = Number(variant.price);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      return {
        valid: false,
        error: "Product has an invalid price configuration.",
        source: "supabase",
      };
    }

    total += unitPrice * item.quantity;
    validated.push({
      productId: product.id,
      variantId: variant.id,
      name: product.name,
      label: variant.label,
      sku: variant.sku,
      unitPrice,
      quantity: item.quantity,
      qikinkSku: variant.qikink_sku,
      designCode: variant.design_code,
      designLink: variant.design_link,
      mockupLink: variant.mockup_link,
      widthInches: variant.width_inches,
      heightInches: variant.height_inches,
      placementSku: variant.placement_sku,
      printTypeId: variant.print_type_id,
    });
  }

  const safeTotal = Math.round(total * 100) / 100;
  return {
    valid: true,
    validatedItems: validated,
    totalAmount: safeTotal,
    source: "supabase",
  };
}
