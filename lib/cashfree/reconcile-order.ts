import "server-only";

import { createClient } from "@supabase/supabase-js";
import { fetchCashfreeOrderStatus } from "./client";
import { submitStoreOrderToQikink } from "@/lib/qikink/fulfil-order";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Order storage is not configured.");
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Never trusts a browser redirect or webhook payload as proof of payment.
 * Re-queries Cashfree, checks amount/currency, then lets the Qikink claim guard
 * make fulfilment submission idempotent across webhook and return-page races.
 */
export async function reconcileCashfreeOrder(cashfreeOrderId: string) {
  const supabase = getAdminClient();
  const { data: order, error } = await supabase
    .from("store_orders")
    .select("id,order_number,total_amount,currency,payment_status,payment_method")
    .eq("cashfree_order_id", cashfreeOrderId)
    .maybeSingle();

  if (error) throw new Error("Could not load the internal order.");
  if (!order) throw new Error("Cashfree order is not linked to an internal order.");
  if (order.payment_method !== "online") throw new Error("This order is not a Cashfree online payment.");

  const providerOrder = await fetchCashfreeOrderStatus(cashfreeOrderId);
  if (providerOrder.order_id !== cashfreeOrderId) throw new Error("Cashfree order reference mismatch.");
  if (providerOrder.order_currency !== order.currency || Math.round(Number(providerOrder.order_amount) * 100) !== Math.round(Number(order.total_amount) * 100)) {
    throw new Error("Cashfree payment amount or currency does not match the order.");
  }

  if (providerOrder.order_status !== "PAID") {
    return { status: "pending" as const, orderNumber: order.order_number };
  }

  if (order.payment_status !== "paid") {
    const { error: updateError } = await supabase
      .from("store_orders")
      .update({ payment_status: "paid", status: "confirmed", updated_at: new Date().toISOString() })
      .eq("id", order.id)
      .eq("payment_status", "pending");
    if (updateError) throw new Error("Could not record the verified payment.");
  }

  try {
    await submitStoreOrderToQikink(order.id);
    return { status: "paid" as const, orderNumber: order.order_number, fulfilment: "submitted" as const };
  } catch {
    // Payment remains paid. Never ask the customer to pay again because fulfilment failed.
    return { status: "paid" as const, orderNumber: order.order_number, fulfilment: "needs_review" as const };
  }
}
