import { NextResponse } from "next/server";
import { verifyCashfreeWebhookSignature } from "@/lib/cashfree/client";
import { reconcileCashfreeOrder } from "@/lib/cashfree/reconcile-order";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-webhook-signature") ?? "";
  const timestamp = request.headers.get("x-webhook-timestamp") ?? "";

  if (!verifyCashfreeWebhookSignature(signature, timestamp, rawBody)) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  let event: {
    type?: string;
    data?: {
      order?: { order_id?: string };
      payment?: { cf_order_id?: string; order_id?: string; payment_status?: string };
    };
  };
  try {
    event = JSON.parse(rawBody) as typeof event;
  } catch {
    return NextResponse.json({ error: "Invalid webhook JSON." }, { status: 400 });
  }

  // A valid but unrelated/unsuccessful event needs no fulfilment action.
  if (event.type !== "PAYMENT_SUCCESS_WEBHOOK") return NextResponse.json({ received: true });
  const orderId = event.data?.order?.order_id ?? event.data?.payment?.cf_order_id ?? event.data?.payment?.order_id;
  if (!orderId) return NextResponse.json({ error: "Cashfree order ID is missing." }, { status: 400 });

  try {
    const result = await reconcileCashfreeOrder(orderId);
    if (result.status === "pending") {
      return NextResponse.json({ received: true, status: "pending" }, { status: 202 });
    }
    return NextResponse.json({ received: true, status: result.status, fulfilment: result.fulfilment });
  } catch {
    // A retry from Cashfree is safe: payment verification and Qikink submission are guarded.
    return NextResponse.json({ error: "Could not reconcile payment; retry delivery later." }, { status: 503 });
  }
}
