import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { submitStoreOrderToQikink } from "@/lib/qikink/fulfil-order";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QIKINK_PRINT_TYPE_IDS = new Set([1, 2, 3, 5, 6, 7, 12, 13, 14, 15, 17, 23]);

function isHttpsUrl(value: string | null) {
  if (!value) return false;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

function hasValidSandboxVariantMapping(variant: {
  print_type_id: number;
  design_code: string | null;
  design_link: string | null;
  mockup_link: string | null;
  width_inches: number | string | null;
  height_inches: number | string | null;
  placement_sku: string | null;
}) {
  if (!QIKINK_PRINT_TYPE_IDS.has(Number(variant.print_type_id))) return false;
  const hasDesignMetadata = Boolean(
    variant.design_code?.trim() || variant.design_link?.trim() || variant.mockup_link?.trim() ||
    variant.placement_sku?.trim() || variant.width_inches != null || variant.height_inches != null
  );
  // Qikink plain products are print_type_id 1 with no design metadata at all.
  if (Number(variant.print_type_id) === 1 && !hasDesignMetadata) return true;
  if (!variant.design_code?.trim() || !isHttpsUrl(variant.mockup_link)) return false;

  const widthProvided = variant.width_inches != null && String(variant.width_inches).trim() !== "";
  const heightProvided = variant.height_inches != null && String(variant.height_inches).trim() !== "";
  const hasNewDesignDimensions = widthProvided || heightProvided || Boolean(variant.design_link?.trim());
  // Existing designs may be reused with blank dimensions/design_link. New designs need all fields.
  if (!hasNewDesignDimensions) return true;
  if (!isHttpsUrl(variant.design_link) || !variant.placement_sku?.trim() || !widthProvided || !heightProvided) return false;

  const width = Number(variant.width_inches);
  const height = Number(variant.height_inches);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return false;
  if (Number(variant.print_type_id) === 1 && (width > 16 || height > 20)) return false;
  if (Number(variant.print_type_id) === 17 && (width > 18 || height > 20)) return false;
  return true;
}

const schema = z.object({
  paymentMethod: z.enum(["online", "cod"]),
  customer: z.object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().email().max(254),
    phone: z.string().trim().min(8).max(20),
  }),
  shippingAddress: z.object({
    first_name: z.string().trim().min(1).max(20),
    last_name: z.string().trim().max(20).optional().default(""),
    address1: z.string().trim().min(5).max(80),
    address2: z.string().trim().max(80).optional().default(""),
    phone: z.string().trim().min(8).max(15),
    email: z.string().trim().email().max(40),
    city: z.string().trim().min(2).max(40),
    zip: z.string().trim().regex(/^\d{4,10}$/, "Postal code must be numeric."),
    province: z.string().trim().min(2).max(40),
    country: z.string().trim().default("India"),
    country_code: z.string().trim().length(2).default("IN"),
  }),
  items: z.array(z.object({
    variantId: z.string().uuid(),
    quantity: z.number().int().min(1).max(5),
  })).min(1).max(10),
});

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Store database is not configured.");
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function requestOriginAllowed(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  let normalizedOrigin: string;
  try { normalizedOrigin = new URL(origin).origin; } catch { return false; }

  const explicitOrigins = (process.env.CHECKOUT_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const configuredOrigins = [
    // Canonical Trendera storefront domain; keep Vercel aliases configurable below.
    "https://trenderabrand.store",
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null,
    ...explicitOrigins,
  ].filter((value): value is string => Boolean(value));

  return configuredOrigins.some((value) => {
    try { return new URL(value).origin === normalizedOrigin; } catch { return false; }
  });
}

export async function POST(request: Request) {
  if (!requestOriginAllowed(request)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  let raw: unknown;
  try { raw = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Please check the customer, address and cart details." }, { status: 400 });

  const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
  const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
  if (parsed.data.paymentMethod === "online" && (!razorpayKeyId || !razorpayKeySecret)) {
    return NextResponse.json({ error: "Online payment is not configured yet." }, { status: 503 });
  }

  const supabase = getAdminClient();
  const uniqueIds = [...new Set(parsed.data.items.map((item) => item.variantId))];
  if (uniqueIds.length !== parsed.data.items.length) {
    return NextResponse.json({ error: "Please remove duplicate cart variants and try again." }, { status: 400 });
  }

  const { data: variantRows, error: variantError } = await supabase
    .from("product_variants")
    .select("id,label,sku,qikink_sku,price,is_active,design_code,design_link,mockup_link,width_inches,height_inches,placement_sku,print_type_id,products!inner(name,status)")
    .in("id", uniqueIds);

  if (variantError || !variantRows || variantRows.length !== uniqueIds.length) {
    return NextResponse.json({ error: "One or more products are no longer available." }, { status: 409 });
  }

  type VariantRow = {
    id: string; label: string; sku: string; qikink_sku: string; price: number | string; is_active: boolean;
    design_code: string | null; design_link: string | null; mockup_link: string | null;
    width_inches: number | string | null; height_inches: number | string | null; placement_sku: string | null; print_type_id: number;
    products: { name: string; status: string } | { name: string; status: string }[];
  };
  const variants = variantRows as unknown as VariantRow[];
  const byId = new Map(variants.map((variant) => [variant.id, variant]));
  const orderItems = parsed.data.items.map((item) => {
    const variant = byId.get(item.variantId);
    const product = Array.isArray(variant?.products) ? variant.products[0] : variant?.products;
    if (!variant || !variant.is_active || product?.status !== "published" || !variant.qikink_sku) return null;
    if (process.env.QIKINK_SANDBOX_MODE !== "false" && !hasValidSandboxVariantMapping(variant)) return null;
    return {
      variant_id: variant.id,
      product_name: product.name,
      variant_label: variant.label,
      qikink_sku: variant.qikink_sku,
      quantity: item.quantity,
      unit_price: Number(variant.price),
      design_code: variant.design_code,
      design_link: variant.design_link,
      mockup_link: variant.mockup_link,
      width_inches: variant.width_inches,
      height_inches: variant.height_inches,
      placement_sku: variant.placement_sku,
      print_type_id: variant.print_type_id,
    };
  });
  if (orderItems.some((item) => item === null)) {
    return NextResponse.json({ error: "A product is unavailable or its Qikink SKU/design mapping is incomplete." }, { status: 409 });
  }

  const safeItems = orderItems.filter((item): item is NonNullable<typeof item> => item !== null);
  const total = Math.round(safeItems.reduce((sum, item) => sum + item.unit_price * item.quantity, 0) * 100) / 100;
  if (!Number.isFinite(total) || total <= 0 || total > 500000) {
    return NextResponse.json({ error: "The cart total is invalid." }, { status: 400 });
  }

  const orderNumber = `TR${randomBytes(6).toString("hex").toUpperCase()}`;
  let razorpayOrderId: string | null = null;
  if (parsed.data.paymentMethod === "online") {
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ amount: Math.round(total * 100), currency: "INR", receipt: orderNumber }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    const paymentOrder = await response.json().catch(() => null) as { id?: string } | null;
    if (!response.ok || !paymentOrder?.id) {
      return NextResponse.json({ error: "Could not start online payment. Please try again." }, { status: 502 });
    }
    razorpayOrderId = paymentOrder.id;
  }

  const { data: order, error: orderError } = await supabase.from("store_orders").insert({
    order_number: orderNumber,
    status: parsed.data.paymentMethod === "cod" ? "confirmed" : "pending",
    payment_method: parsed.data.paymentMethod,
    payment_status: parsed.data.paymentMethod === "cod" ? "cod_due" : "pending",
    total_amount: total,
    customer_name: parsed.data.customer.name,
    customer_email: parsed.data.customer.email,
    customer_phone: parsed.data.customer.phone,
    shipping_address: parsed.data.shippingAddress,
    razorpay_order_id: razorpayOrderId,
    qikink_submission_status: "pending",
  }).select("id,order_number").single();

  if (orderError || !order) return NextResponse.json({ error: "Could not save the order. Please retry." }, { status: 503 });

  const { error: itemError } = await supabase.from("store_order_items").insert(
    safeItems.map((item) => ({ ...item, order_id: order.id })),
  );
  if (itemError) {
    await supabase.from("store_orders").delete().eq("id", order.id);
    return NextResponse.json({ error: "Could not save the order items. Please retry." }, { status: 503 });
  }

  if (parsed.data.paymentMethod === "online") {
    return NextResponse.json({
      orderId: order.id,
      orderNumber: order.order_number,
      payment: { provider: "razorpay", keyId: razorpayKeyId, razorpayOrderId, amount: Math.round(total * 100), currency: "INR" },
    }, { status: 201 });
  }

  try {
    await submitStoreOrderToQikink(order.id);
    return NextResponse.json({ orderId: order.id, orderNumber: order.order_number, paymentMethod: "cod", fulfilment: "submitted" }, { status: 201 });
  } catch {
    return NextResponse.json({
      orderId: order.id,
      orderNumber: order.order_number,
      paymentMethod: "cod",
      fulfilment: "needs_review",
      message: "Your order was saved, but fulfilment needs review. Please contact TrendEra before retrying.",
    }, { status: 202 });
  }
}
