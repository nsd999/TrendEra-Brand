import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAuthorizedAdmin } from "@/lib/admin/auth";
import { syncAllActiveOrders, syncOrderTrackingFromQikink } from "@/lib/qikink/client";
import { submitStoreOrderToQikink } from "@/lib/qikink/fulfil-order";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Supabase server configuration is missing.");
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(request: Request) {
  if (!(await isAuthorizedAdmin(request))) {
    return NextResponse.json({ error: "Unauthorized admin access." }, { status: 401 });
  }

  const supabase = getAdminClient();
  const { data: orders, error } = await supabase
    .from("store_orders")
    .select("id,order_number,status,payment_method,payment_status,total_amount,currency,customer_name,customer_email,customer_phone,cashfree_order_id,qikink_order_id,qikink_submission_status,qikink_status,qikink_awb,qikink_courier,qikink_tracking_url,qikink_synced_at,qikink_last_error,created_at,store_order_items(product_name,variant_label,qikink_sku,quantity,unit_price)")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: `Database error: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ orders: orders ?? [] });
}

export async function POST(request: Request) {
  if (!(await isAuthorizedAdmin(request))) {
    return NextResponse.json({ error: "Unauthorized admin access." }, { status: 401 });
  }

  let body: {
    action: string;
    orderId?: string;
    orderNumber?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const { action } = body;

  try {
    switch (action) {
      case "sync_order": {
        const target = body.orderId || body.orderNumber;
        if (!target) {
          return NextResponse.json({ error: "orderId or orderNumber is required." }, { status: 400 });
        }
        const result = await syncOrderTrackingFromQikink(target);
        return NextResponse.json({ success: true, result });
      }

      case "sync_all": {
        const result = await syncAllActiveOrders();
        return NextResponse.json({ success: true, result });
      }

      case "retry_fulfilment": {
        if (!body.orderId) {
          return NextResponse.json({ error: "orderId is required." }, { status: 400 });
        }
        const result = await submitStoreOrderToQikink(body.orderId);
        return NextResponse.json({ success: true, result });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to execute tracking action." },
      { status: 500 },
    );
  }
}
