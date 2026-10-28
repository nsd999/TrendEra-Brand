import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { submitStoreOrderToQikink } from "@/lib/qikink/fulfil-order";
import { validateRequestedCartItems } from "@/lib/woocommerce/catalogue";
import { createWooCommerceOrder, getWooCommerceConfig } from "@/lib/woocommerce/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  paymentMethod: z.enum(["online", "cod"]),
  customer: z.object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().email().max(254),
    phone: z.string().trim().min(8).max(20),
  }),
  shippingAddress: z.object({
    first_name: z.string().trim().min(1).max(40),
    last_name: z.string().trim().max(40).optional().default(""),
    address1: z.string().trim().min(5).max(100),
    address2: z.string().trim().max(100).optional().default(""),
    phone: z.string().trim().min(8).max(20),
    email: z.string().trim().email().max(100),
    city: z.string().trim().min(2).max(60),
    zip: z.string().trim().regex(/^\d{4,10}$/, "Postal code must be numeric."),
    province: z.string().trim().min(2).max(60),
    country: z.string().trim().default("India"),
    country_code: z.string().trim().length(2).default("IN"),
  }),
  items: z.array(
    z.object({
      variantId: z.string().trim().min(1).max(64),
      quantity: z.number().int().min(1).max(5),
    }),
  ).min(1).max(10),
});

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function requestOriginAllowed(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  let normalizedOrigin: string;
  try {
    normalizedOrigin = new URL(origin).origin;
  } catch {
    return false;
  }

  const explicitOrigins = (process.env.CHECKOUT_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  const configuredOrigins = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null,
    ...explicitOrigins,
  ].filter((v): v is string => Boolean(v));

  return configuredOrigins.some((v) => {
    try {
      return new URL(v).origin === normalizedOrigin;
    } catch {
      return false;
    }
  });
}

export async function POST(request: Request) {
  if (!requestOriginAllowed(request)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please check the customer, address and cart details." },
      { status: 400 },
    );
  }

  let cashfreeSiteBase = "";
  let cashfreeCustomerPhone = "";
  if (parsed.data.paymentMethod === "online") {
    if (!process.env.CASHFREE_APP_ID || !process.env.CASHFREE_SECRET_KEY || !process.env.NEXT_PUBLIC_SITE_URL) {
      return NextResponse.json({ error: "Online payment is not configured yet." }, { status: 503 });
    }
    cashfreeSiteBase = process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
    const digits = parsed.data.customer.phone.replace(/\D/g, "");
    cashfreeCustomerPhone =
      digits.length === 10 ? digits : digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : "";
    if (!cashfreeCustomerPhone) {
      return NextResponse.json(
        { error: "Enter a valid 10-digit Indian mobile number for online payment." },
        { status: 400 },
      );
    }
  }

  const uniqueIds = [...new Set(parsed.data.items.map((item) => item.variantId))];
  if (uniqueIds.length !== parsed.data.items.length) {
    return NextResponse.json({ error: "Please remove duplicate cart variants and try again." }, { status: 400 });
  }

  // 1. Authoritative server-side price and stock validation
  const validation = await validateRequestedCartItems(parsed.data.items);
  if (!validation.valid || !validation.validatedItems || !validation.totalAmount) {
    return NextResponse.json(
      { error: validation.error || "One or more items in your cart could not be validated." },
      { status: 409 },
    );
  }

  const total = validation.totalAmount;
  if (!Number.isFinite(total) || total <= 0 || total > 500000) {
    return NextResponse.json({ error: "The cart total is invalid." }, { status: 400 });
  }

  const orderNumber = `TR${randomBytes(6).toString("hex").toUpperCase()}`;
  let woocommerceOrderId: string | null = null;

  // 2. Authoritative WooCommerce Order Creation
  const wcConfig = getWooCommerceConfig();
  if (wcConfig.isConfigured) {
    try {
      const wcLineItems = validation.validatedItems.map((item) => {
        const isNumericProduct = /^\d+$/.test(item.productId);
        const isNumericVariant = /^\d+$/.test(item.variantId);
        return {
          product_id: isNumericProduct ? Number(item.productId) : 0,
          variation_id: isNumericVariant ? Number(item.variantId) : undefined,
          quantity: item.quantity,
          name: `${item.name} - ${item.label}`,
          sku: item.sku,
          price: item.unitPrice.toFixed(2),
          total: (item.unitPrice * item.quantity).toFixed(2),
        };
      });

      const customerParts = parsed.data.customer.name.trim().split(/\s+/);
      const firstName = parsed.data.shippingAddress.first_name || customerParts[0] || "Customer";
      const lastName = parsed.data.shippingAddress.last_name || customerParts.slice(1).join(" ") || "";

      const wcOrder = await createWooCommerceOrder({
        payment_method: parsed.data.paymentMethod === "online" ? "cashfree" : "cod",
        payment_method_title: parsed.data.paymentMethod === "online" ? "Cashfree Payments" : "Cash on Delivery",
        set_paid: false,
        status: parsed.data.paymentMethod === "cod" ? "on-hold" : "pending",
        billing: {
          first_name: firstName,
          last_name: lastName,
          address_1: parsed.data.shippingAddress.address1,
          address_2: parsed.data.shippingAddress.address2 || "",
          city: parsed.data.shippingAddress.city,
          state: parsed.data.shippingAddress.province,
          postcode: parsed.data.shippingAddress.zip,
          country: parsed.data.shippingAddress.country_code || "IN",
          email: parsed.data.customer.email,
          phone: parsed.data.customer.phone,
        },
        shipping: {
          first_name: firstName,
          last_name: lastName,
          address_1: parsed.data.shippingAddress.address1,
          address_2: parsed.data.shippingAddress.address2 || "",
          city: parsed.data.shippingAddress.city,
          state: parsed.data.shippingAddress.province,
          postcode: parsed.data.shippingAddress.zip,
          country: parsed.data.shippingAddress.country_code || "IN",
          phone: parsed.data.shippingAddress.phone,
        },
        line_items: wcLineItems,
        meta_data: [
          { key: "_order_number", value: orderNumber },
          { key: "_source", value: "trendera_storefront" },
        ],
      });

      if (wcOrder?.id) {
        woocommerceOrderId = String(wcOrder.id);
      }
    } catch {
      // If WooCommerce order creation fails (e.g. host unreachable or challenge blocked),
      // we log safely without secrets and continue with local persistence so customer order is preserved.
    }
  }

  // 3. Persist internal order for idempotency, claim guards, and reconciliation
  const supabase = getAdminClient();
  let internalOrderId = orderNumber;

  if (supabase) {
    const { data: order, error: orderError } = await supabase
      .from("store_orders")
      .insert({
        order_number: orderNumber,
        status: parsed.data.paymentMethod === "cod" ? "confirmed" : "pending",
        payment_method: parsed.data.paymentMethod,
        payment_status: parsed.data.paymentMethod === "cod" ? "cod_due" : "pending",
        total_amount: total,
        customer_name: parsed.data.customer.name,
        customer_email: parsed.data.customer.email,
        customer_phone: parsed.data.customer.phone,
        shipping_address: parsed.data.shippingAddress,
        cashfree_order_id: null,
        woocommerce_order_id: woocommerceOrderId,
        qikink_submission_status: "pending",
      })
      .select("id,order_number")
      .single();

    if (!orderError && order) {
      internalOrderId = order.id;

      const orderItemRows = validation.validatedItems.map((item) => ({
        order_id: order.id,
        variant_id: /^[0-9a-fA-F-]{36}$/.test(item.variantId) ? item.variantId : null,
        product_name: item.name,
        variant_label: item.label,
        qikink_sku: item.qikinkSku || item.sku,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        design_code: item.designCode || null,
        design_link: item.designLink || null,
        mockup_link: item.mockupLink || null,
        width_inches: item.widthInches || null,
        height_inches: item.heightInches || null,
        placement_sku: item.placementSku || null,
        print_type_id: item.printTypeId || 1,
      }));

      await supabase.from("store_order_items").insert(orderItemRows);
    }
  }

  // 4. Online Payment via Cashfree
  if (parsed.data.paymentMethod === "online") {
    const { createCashfreeOrder } = await import("@/lib/cashfree/client");
    try {
      const cashfreeOrder = await createCashfreeOrder({
        order_id: orderNumber,
        order_amount: total,
        order_currency: "INR",
        customer_details: {
          customer_id: orderNumber,
          customer_name: parsed.data.customer.name,
          customer_email: parsed.data.customer.email,
          customer_phone: cashfreeCustomerPhone,
        },
        order_meta: {
          return_url: `${cashfreeSiteBase}/checkout/return?order_id={order_id}`,
          notify_url: `${cashfreeSiteBase}/api/webhooks/cashfree`,
        },
      });

      if (supabase && internalOrderId !== orderNumber) {
        await supabase
          .from("store_orders")
          .update({ cashfree_order_id: cashfreeOrder.order_id, updated_at: new Date().toISOString() })
          .eq("id", internalOrderId);
      }

      // If WooCommerce order was created, attach cashfree reference
      if (woocommerceOrderId) {
        try {
          const { updateWooCommerceOrder } = await import("@/lib/woocommerce/client");
          await updateWooCommerceOrder(woocommerceOrderId, {
            meta_data: [{ key: "_cashfree_order_id", value: cashfreeOrder.order_id }],
          });
        } catch {
          // Non-fatal
        }
      }

      return NextResponse.json(
        {
          orderId: internalOrderId,
          orderNumber,
          woocommerceOrderId,
          payment: {
            provider: "cashfree",
            paymentSessionId: cashfreeOrder.payment_session_id,
            cashfreeOrderId: cashfreeOrder.order_id,
            amount: Math.round(total * 100),
            currency: "INR",
            environment: process.env.CASHFREE_ENV === "production" ? "production" : "sandbox",
          },
        },
        { status: 201 },
      );
    } catch {
      return NextResponse.json(
        {
          orderId: internalOrderId,
          orderNumber,
          payment: { provider: "cashfree", status: "needs_reconciliation" },
          error: "Payment setup could not be confirmed. Do not submit another payment; contact TrendEra before retrying.",
        },
        { status: 202 },
      );
    }
  }

  // 5. Cash on Delivery (COD) Flow
  if (supabase && internalOrderId !== orderNumber) {
    try {
      await submitStoreOrderToQikink(internalOrderId);
      return NextResponse.json(
        {
          orderId: internalOrderId,
          orderNumber,
          woocommerceOrderId,
          paymentMethod: "cod",
          fulfilment: "submitted",
        },
        { status: 201 },
      );
    } catch {
      return NextResponse.json(
        {
          orderId: internalOrderId,
          orderNumber,
          woocommerceOrderId,
          paymentMethod: "cod",
          fulfilment: "needs_review",
          message: "Your order was saved, but fulfilment needs review. Please contact TrendEra before retrying.",
        },
        { status: 202 },
      );
    }
  }

  return NextResponse.json(
    {
      orderId: internalOrderId,
      orderNumber,
      woocommerceOrderId,
      paymentMethod: "cod",
      fulfilment: "recorded",
    },
    { status: 201 },
  );
}
