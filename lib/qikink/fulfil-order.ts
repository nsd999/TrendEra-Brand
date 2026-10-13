import "server-only";

import { createClient } from "@supabase/supabase-js";
import { createQikinkOrder, type QikinkShippingAddress } from "./client";

type StoreOrder = {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  payment_method: "online" | "cod";
  total_amount: number | string;
  shipping_address: QikinkShippingAddress;
  qikink_submission_status: string;
};

type StoreOrderItem = {
  product_name: string;
  variant_label: string;
  qikink_sku: string;
  quantity: number;
  unit_price: number | string;
};

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Supabase server configuration is missing.");
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Call only after payment is verified, or after a COD order has been explicitly confirmed.
 * The database claim prevents two concurrent webhooks from submitting the same order.
 */
export async function submitStoreOrderToQikink(orderId: string) {
  const supabase = getAdminClient();
  const { data: order, error: orderError } = await supabase
    .from("store_orders")
    .select("id,order_number,status,payment_status,payment_method,total_amount,shipping_address,qikink_submission_status")
    .eq("id", orderId)
    .single();

  if (orderError || !order) throw new Error("Store order was not found.");
  const allowed = order.payment_method === "online"
    ? order.payment_status === "paid"
    : order.payment_method === "cod" && order.status === "confirmed";
  if (!allowed) throw new Error("Order is not eligible for Qikink fulfilment yet.");

  const { data: claim, error: claimError } = await supabase
    .from("store_orders")
    .update({ qikink_submission_status: "processing", updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("qikink_submission_status", "pending")
    .select("id")
    .maybeSingle();

  if (claimError) throw new Error("Could not claim order for fulfilment.");
  if (!claim) return { alreadySubmitted: true };

  const { data: items, error: itemsError } = await supabase
    .from("store_order_items")
    .select("product_name,variant_label,qikink_sku,quantity,unit_price")
    .eq("order_id", orderId);

  if (itemsError || !items?.length) {
    await supabase.from("store_orders").update({
      qikink_submission_status: "failed",
      qikink_last_error: "Order items are missing.",
      updated_at: new Date().toISOString(),
    }).eq("id", orderId);
    throw new Error("Order items are missing.");
  }

  try {
    const shipping = order.shipping_address as QikinkShippingAddress;
    const result = await createQikinkOrder({
      order_number: order.order_number,
      gateway: order.payment_method === "cod" ? "cash_on_delivery" : "online",
      total_order_value: Number(order.total_amount),
      line_items: (items as StoreOrderItem[]).map((item) => ({
        search_from_my_products: true,
        price: Number(item.unit_price).toFixed(2),
        quantity: item.quantity,
        sku: item.qikink_sku,
      })),
      shipping_address: shipping,
    });

    const { error: updateError } = await supabase.from("store_orders").update({
      qikink_order_id: result.orderId,
      qikink_submission_status: "submitted",
      qikink_last_error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", orderId);

    if (updateError) throw new Error("Qikink accepted the order, but TrendEra could not save the Qikink order ID. Check Qikink before retrying.");
    return { alreadySubmitted: false, qikinkOrderId: result.orderId };
  } catch (error) {
    const safeMessage = error instanceof Error ? error.message.slice(0, 300) : "Unknown Qikink error.";
    await supabase.from("store_orders").update({
      qikink_submission_status: "failed",
      qikink_last_error: safeMessage,
      updated_at: new Date().toISOString(),
    }).eq("id", orderId);
    throw error;
  }
}
