import { NextResponse } from "next/server";
import { isAuthorizedAdmin } from "@/lib/admin/auth";
import { getAdminClient, inspectSupabaseConfig } from "@/lib/supabase/admin";
import { syncAllActiveOrders, syncOrderTrackingFromQikink } from "@/lib/qikink/client";
import { submitStoreOrderToQikink } from "@/lib/qikink/fulfil-order";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await isAuthorizedAdmin(request))) {
    return NextResponse.json({ error: "Unauthorized admin access." }, { status: 401 });
  }

  const config = inspectSupabaseConfig();
  if (!config.hasUrl || !config.hasServiceRoleKey) {
    return NextResponse.json({
      orders: [],
      configurationError: `Supabase server configuration is missing: ${config.missingVariables.join(", ")}.`,
    });
  }

  try {
    const supabase = getAdminClient();
    const { data: orders, error } = await supabase
      .from("store_orders")
      .select("id,order_number,status,payment_method,payment_status,total_amount,currency,customer_name,customer_email,customer_phone,cashfree_order_id,qikink_order_id,qikink_submission_status,qikink_status,qikink_awb,qikink_courier,qikink_tracking_url,qikink_synced_at,qikink_last_error,created_at,store_order_items(product_name,variant_label,qikink_sku,quantity,unit_price)")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ orders: [], configurationError: `Database error: ${error.message}` });
    }

    return NextResponse.json({ orders: orders ?? [] });
  } catch (err) {
    return NextResponse.json({
      orders: [],
      configurationError: err instanceof Error ? err.message : "Database connection failed",
    });
  }
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
