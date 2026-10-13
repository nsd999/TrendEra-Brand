import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { submitStoreOrderToQikink } from "@/lib/qikink/fulfil-order";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeEqualHex(expected: string, received: string) {
  if (!/^[a-f0-9]+$/i.test(received) || expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
}

export async function POST(request: Request) {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });

  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  const expected = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  if (!safeEqualHex(expected, signature)) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  let event: {
    event?: string;
    payload?: { payment?: { entity?: { order_id?: string; status?: string } } };
  };
  try {
    event = JSON.parse(rawBody) as typeof event;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (event.event !== "payment.captured") return NextResponse.json({ received: true });

  const razorpayOrderId = event.payload?.payment?.entity?.order_id;
  if (!razorpayOrderId) return NextResponse.json({ error: "Missing payment order ID." }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ error: "Order storage is not configured." }, { status: 503 });

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: order, error } = await supabase
    .from("store_orders")
    .select("id")
    .eq("razorpay_order_id", razorpayOrderId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Could not find the store order." }, { status: 503 });
  if (!order) return NextResponse.json({ error: "Store order is not recorded yet." }, { status: 404 });

  const { error: paidError } = await supabase.from("store_orders").update({
    payment_status: "paid",
    status: "confirmed",
    updated_at: new Date().toISOString(),
  }).eq("id", order.id).neq("payment_status", "paid");

  if (paidError) return NextResponse.json({ error: "Could not update payment status." }, { status: 503 });

  try {
    await submitStoreOrderToQikink(order.id);
  } catch {
    // Keep webhook response retryable; inspect store_orders.qikink_last_error and Qikink dashboard.
    return NextResponse.json({ error: "Payment was recorded; Qikink submission needs review." }, { status: 503 });
  }

  return NextResponse.json({ received: true });
}
