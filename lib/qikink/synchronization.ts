import "server-only";

import { getAdminClient } from "../supabase/admin.ts";
import { validateProductImportItem, slugify } from "./products.ts";
import type { QikinkProductImportItem, QikinkSyncResult } from "./types.ts";

export type PushProductOptions = {
  preserveExistingPrices?: boolean;
  status?: "draft" | "published" | "archived";
};

export type VerifiedProductPublication = {
  productId: string;
  name: string;
  slug: string;
  status: string;
  category: string;
  imageUrl?: string;
  price: number;
  variantsCount: number;
  validSkusCount: number;
  created: boolean;
  verifiedAt: string;
};

/**
 * Pushes a single Qikink product and its variants into TrendEra's authoritative Supabase database.
 * Completely idempotent: updates if existing, creates if new.
 * Performs an independent post-write database read verification before declaring success.
 */
export async function pushProductToTrendEra(
  item: QikinkProductImportItem,
  options: PushProductOptions = { preserveExistingPrices: true, status: "published" },
): Promise<VerifiedProductPublication> {
  validateProductImportItem(item);
  const supabase = getAdminClient();

  const slug = item.slug ? slugify(item.slug) : slugify(item.name);
  const status = options.status ?? item.status ?? "published";

  // Check for existing product by slug or qikink_product_id
  let existingProduct: { id: string; price: number; name: string } | null = null;
  const { data: bySlug } = await supabase
    .from("products")
    .select("id,price,name")
    .eq("slug", slug)
    .maybeSingle();

  if (bySlug) {
    existingProduct = bySlug;
  } else if (item.qikink_product_id) {
    const { data: byQikId } = await supabase
      .from("products")
      .select("id,price,name")
      .eq("qikink_product_id", item.qikink_product_id)
      .maybeSingle();
    if (byQikId) existingProduct = byQikId;
  }

  // Base price for product level (minimum variant price)
  const minSellingPrice = Math.min(...item.variants.map((v) => Number(v.selling_price)));
  let productId: string;
  let isCreated = false;

  if (existingProduct) {
    productId = existingProduct.id;
    const finalPrice = options.preserveExistingPrices
      ? existingProduct.price
      : minSellingPrice;

    const { error: updateError } = await supabase
      .from("products")
      .update({
        name: item.name,
        description: item.description,
        price: finalPrice,
        category: item.category ?? "Apparel",
        image_url: item.image_url,
        qikink_product_id: item.qikink_product_id,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", productId);

    if (updateError) {
      throw new Error(`Failed to update existing product '${item.name}': ${updateError.message}`);
    }
  } else {
    isCreated = true;
    const { data: inserted, error: insertError } = await supabase
      .from("products")
      .insert({
        name: item.name,
        slug,
        description: item.description,
        price: minSellingPrice,
        currency: "INR",
        category: item.category ?? "Apparel",
        image_url: item.image_url,
        qikink_product_id: item.qikink_product_id,
        status,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      throw new Error(`Failed to create product '${item.name}': ${insertError?.message || "Unknown DB error"}`);
    }
    productId = inserted.id;
  }

  // Process variants with rollback protection for new products
  try {
    for (const v of item.variants) {
      const { data: existingVariant } = await supabase
        .from("product_variants")
        .select("id,price")
        .eq("sku", v.sku)
        .maybeSingle();

      const finalSellingPrice =
        options.preserveExistingPrices && existingVariant
          ? Number(existingVariant.price)
          : Number(v.selling_price);

      const variantData = {
        product_id: productId,
        label: v.label,
        size: v.size ?? null,
        colour: v.colour ?? null,
        sku: v.sku,
        qikink_sku: v.qikink_sku,
        price: finalSellingPrice,
        cost_price: Number(v.cost_price),
        compare_at_price: v.compare_at_price ?? null,
        mockup_link: v.mockup_link ?? item.image_url ?? null,
        design_code: v.design_code ?? null,
        design_link: v.design_link ?? null,
        width_inches: v.width_inches ? Number(v.width_inches) : null,
        height_inches: v.height_inches ? Number(v.height_inches) : null,
        placement_sku: v.placement_sku ?? null,
        print_type_id: v.print_type_id ?? 1,
        is_active: true,
        updated_at: new Date().toISOString(),
      };

      if (existingVariant) {
        const { error: vUpdateErr } = await supabase
          .from("product_variants")
          .update(variantData)
          .eq("id", existingVariant.id);
        if (vUpdateErr) throw new Error(`Failed to update variant '${v.sku}': ${vUpdateErr.message}`);
      } else {
        const { error: vInsertErr } = await supabase
          .from("product_variants")
          .insert(variantData);
        if (vInsertErr) throw new Error(`Failed to insert variant '${v.sku}': ${vInsertErr.message}`);
      }
    }
  } catch (err) {
    if (isCreated) {
      // Rollback newly inserted product if variant creation failed
      await supabase.from("products").delete().eq("id", productId);
    }
    throw err;
  }

  // Independent database read verification
  const { data: verified, error: verifyErr } = await supabase
    .from("products")
    .select("id,name,slug,status,category,image_url,price,product_variants(id,sku,qikink_sku,is_active,price)")
    .eq("id", productId)
    .single();

  if (verifyErr || !verified) {
    throw new Error(`Independent post-publish read failed for product '${item.name}': ${verifyErr?.message || "Record not found"}`);
  }

  const variants = verified.product_variants || [];
  const validSkus = variants.filter((v: { qikink_sku?: string; is_active?: boolean }) => Boolean(v.qikink_sku?.trim()) && v.is_active);

  const publicationResult: VerifiedProductPublication = {
    productId: verified.id,
    name: verified.name,
    slug: verified.slug,
    status: verified.status,
    category: verified.category || "Apparel",
    imageUrl: verified.image_url,
    price: Number(verified.price),
    variantsCount: variants.length,
    validSkusCount: validSkus.length,
    created: isCreated,
    verifiedAt: new Date().toISOString(),
  };

  // Record audit entry
  try {
    await supabase.from("qikink_sync_logs").insert({
      sync_type: "products",
      status: "success",
      items_count: 1,
      details: {
        productId,
        name: item.name,
        variantsCount: variants.length,
        validSkusCount: validSkus.length,
        created: isCreated,
      },
    });
  } catch {
    // Non-blocking log failure
  }

  return publicationResult;
}

/**
 * Synchronizes an array of products in batch, capturing any per-product errors.
 */
export async function syncAllProducts(
  products: QikinkProductImportItem[],
  options: PushProductOptions = { preserveExistingPrices: true, status: "published" },
): Promise<QikinkSyncResult & { verifiedProducts: VerifiedProductPublication[] }> {
  const result: QikinkSyncResult & { verifiedProducts: VerifiedProductPublication[] } = {
    success: true,
    createdProducts: 0,
    updatedProducts: 0,
    createdVariants: 0,
    updatedVariants: 0,
    errors: [],
    verifiedProducts: [],
  };

  const supabase = getAdminClient();

  for (const p of products) {
    try {
      const res = await pushProductToTrendEra(p, options);
      if (res.created) {
        result.createdProducts++;
      } else {
        result.updatedProducts++;
      }
      result.createdVariants += res.variantsCount;
      result.verifiedProducts.push(res);
    } catch (err) {
      result.success = false;
      const msg = err instanceof Error ? err.message : `Failed to sync product ${p.name}`;
      result.errors.push(msg);
    }
  }

  // Record in audit log
  try {
    await supabase.from("qikink_sync_logs").insert({
      sync_type: "products",
      status: result.errors.length === 0 ? "success" : result.createdProducts > 0 || result.updatedProducts > 0 ? "partial" : "failed",
      items_count: products.length,
      details: {
        total: products.length,
        created: result.createdProducts,
        updated: result.updatedProducts,
        variants: result.createdVariants,
      },
      error_message: result.errors.length ? result.errors.join("; ") : null,
    });
  } catch {
    // Non-blocking
  }

  return result;
}

/**
 * Synchronizes categories across products.
 */
export async function syncProductCategories(
  categoryMappings: Record<string, string>,
): Promise<{ updatedCount: number }> {
  const supabase = getAdminClient();
  let updatedCount = 0;

  for (const [productIdentifier, newCategory] of Object.entries(categoryMappings)) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productIdentifier);
    const query = supabase.from("products").update({
      category: newCategory,
      updated_at: new Date().toISOString(),
    });

    const { error } = isUuid
      ? await query.eq("id", productIdentifier)
      : await query.eq("slug", productIdentifier);

    if (!error) updatedCount++;
  }

  try {
    await supabase.from("qikink_sync_logs").insert({
      sync_type: "categories",
      status: "success",
      items_count: updatedCount,
      details: { categoryMappings },
    });
  } catch {
    // Non-blocking
  }

  return { updatedCount };
}

/**
 * Synchronizes images across products and variants.
 */
export async function syncProductImages(
  productId: string,
  imageUrl: string,
  variantMockups?: Record<string, string>,
): Promise<{ success: boolean }> {
  const supabase = getAdminClient();

  const { error: pError } = await supabase
    .from("products")
    .update({ image_url: imageUrl, updated_at: new Date().toISOString() })
    .eq("id", productId);

  if (pError) throw new Error(`Failed to update product image: ${pError.message}`);

  if (variantMockups) {
    for (const [variantIdOrSku, mockupUrl] of Object.entries(variantMockups)) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(variantIdOrSku);
      const query = supabase.from("product_variants").update({
        mockup_link: mockupUrl,
        updated_at: new Date().toISOString(),
      });
      if (isUuid) {
        await query.eq("id", variantIdOrSku);
      } else {
        await query.eq("sku", variantIdOrSku);
      }
    }
  }

  try {
    await supabase.from("qikink_sync_logs").insert({
      sync_type: "images",
      status: "success",
      items_count: 1,
      details: { productId, imageUrl, hasVariantMockups: Boolean(variantMockups) },
    });
  } catch {
    // Non-blocking
  }

  return { success: true };
}
