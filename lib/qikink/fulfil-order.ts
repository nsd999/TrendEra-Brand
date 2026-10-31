import "server-only";

import { getAdminClient } from "../supabase/admin.ts";
import { createQikinkOrder, type QikinkDesign, type QikinkShippingAddress } from "./client.ts";

type StoreOrderItem = {
  product_name: string;
  variant_label: string;
  qikink_sku: string;
  quantity: number;
  unit_price: number | string;
  design_code: string | null;
  design_link: string | null;
  mockup_link: string | null;
  width_inches: number | string | null;
  height_inches: number | string | null;
  placement_sku: string | null;
  print_type_id: number;
};

/** Call only after payment is verified, or after a COD order has been explicitly confirmed. */
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
    .select("product_name,variant_label,qikink_sku,quantity,unit_price,design_code,design_link,mockup_link,width_inches,height_inches,placement_sku,print_type_id")
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
      gateway: order.payment_method === "cod" ? "COD" : "Prepaid",
      total_order_value: Number(order.total_amount),
      line_items: (items as StoreOrderItem[]).map((item) => {
        const design: QikinkDesign | null =
          item.design_code && item.mockup_link
            ? {
                // Qikink allows an existing design code to be reused with blank
                // dimensions/design_link/placement_sku. New designs are validated
                // by checkout before they reach this fulfillment function.
                design_code: item.design_code,
                design_link: item.design_link ?? "",
                mockup_link: item.mockup_link,
                width_inches: String(item.width_inches ?? ""),
                height_inches: String(item.height_inches ?? ""),
                placement_sku: item.placement_sku ?? "",
              }
            : null;
        return {
          sku: item.qikink_sku,
          price: Number(item.unit_price).toFixed(2),
          quantity: item.quantity,
          print_type_id: item.print_type_id,
          design,
        };
      }),
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
