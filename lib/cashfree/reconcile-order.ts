import "server-only";

import { createClient } from "@supabase/supabase-js";
import { fetchCashfreeOrderStatus } from "./client";
import { submitStoreOrderToQikink } from "@/lib/qikink/fulfil-order";
import { updateWooCommerceOrder, getWooCommerceConfig } from "@/lib/woocommerce/client";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Order storage is not configured.");
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Never trusts a browser redirect or webhook payload as proof of payment.
 * Re-queries Cashfree, checks amount/currency, updates WooCommerce order status,
 * then lets the Qikink claim guard make fulfilment submission idempotent across webhook and return-page races.
 */
export async function reconcileCashfreeOrder(cashfreeOrderId: string) {
  const supabase = getAdminClient();
  const { data: order, error } = await supabase
    .from("store_orders")
    .select("id,order_number,woocommerce_order_id,total_amount,currency,payment_status,payment_method")
    .or(`cashfree_order_id.eq.${cashfreeOrderId},order_number.eq.${cashfreeOrderId}`)
    .maybeSingle();

  if (error) throw new Error("Could not load the internal order.");
  if (!order) throw new Error("Cashfree order is not linked to an internal order.");
  if (order.payment_method !== "online") throw new Error("This order is not a Cashfree online payment.");

  const providerOrder = await fetchCashfreeOrderStatus(cashfreeOrderId);
  if (providerOrder.order_id !== cashfreeOrderId && providerOrder.order_id !== order.order_number) {
    throw new Error("Cashfree order reference mismatch.");
  }
  if (
    providerOrder.order_currency !== order.currency ||
    Math.round(Number(providerOrder.order_amount) * 100) !== Math.round(Number(order.total_amount) * 100)
  ) {
    throw new Error("Cashfree payment amount or currency does not match the order.");
  }

  if (providerOrder.order_status !== "PAID") {
    return { status: "pending" as const, orderNumber: order.order_number };
  }

  // 1. Mark local order as paid (guarded by previous status 'pending')
  if (order.payment_status !== "paid") {
    const { error: updateError } = await supabase
      .from("store_orders")
      .update({ payment_status: "paid", status: "confirmed", updated_at: new Date().toISOString() })
      .eq("id", order.id)
      .eq("payment_status", "pending");

    if (updateError) throw new Error("Could not record the verified payment.");
  }

  // 2. Synchronize WooCommerce order status to 'processing' (paid)
  const wcConfig = getWooCommerceConfig();
  if (order.woocommerce_order_id && wcConfig.isConfigured) {
    try {
      await updateWooCommerceOrder(order.woocommerce_order_id, {
        status: "processing",
        set_paid: true,
        transaction_id: cashfreeOrderId,
        meta_data: [
          { key: "_cashfree_payment_status", value: "PAID" },
          { key: "_cashfree_order_id", value: cashfreeOrderId },
          { key: "_payment_verified_at", value: new Date().toISOString() },
        ],
      });
    } catch {
      // Keep going if WooCommerce is temporarily unreachable; payment is verified.
    }
  }

  // 3. Submit to Qikink (idempotently guarded)
  try {
    const qikinkResult = await submitStoreOrderToQikink(order.id);

    // If Qikink submitted and WooCommerce order exists, attach reference
    if (order.woocommerce_order_id && qikinkResult.qikinkOrderId && wcConfig.isConfigured) {
      try {
        await updateWooCommerceOrder(order.woocommerce_order_id, {
          meta_data: [
            { key: "_qikink_order_id", value: qikinkResult.qikinkOrderId },
            { key: "_qikink_submission_status", value: "submitted" },
          ],
        });
      } catch {
        // Non-fatal
      }
    }

    return { status: "paid" as const, orderNumber: order.order_number, fulfilment: "submitted" as const };
  } catch {
    // Payment remains verified paid. Never ask customer to pay again because fulfilment failed.
    return { status: "paid" as const, orderNumber: order.order_number, fulfilment: "needs_review" as const };
  }
}
