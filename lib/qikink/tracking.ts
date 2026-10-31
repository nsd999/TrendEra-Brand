import "server-only";

import { getAdminClient } from "../supabase/admin.ts";
import { getAccessToken, getQikinkBaseUrl, getQikinkCredentials, getQikinkMode } from "./authentication.ts";
import { QikinkOrderError, QikinkValidationError } from "./errors.ts";
import type {
  QikinkOrder,
  QikinkOrderListQuery,
  QikinkOrderListResponse,
  QikinkTrackingSyncResult,
} from "./types.ts";

const QIKINK_ORDER_STATUSES = new Set([
  "Archived",
  "Cancelled",
  "Consignee unavailable",
  "Delivered",
  "Delivery rescheduled",
  "Dispatch Ready",
  "Exception",
  "In-Transit",
  "Incorrect/incomplete Address",
  "Live",
  "Live-OOS",
  "Lost",
  "Manifested",
  "Maximum attempts reached",
  "Misrouted",
  "No-Data",
  "Not attempted",
  "ODA",
  "On Hold",
  "Open delivery refused",
  "OTP not shared",
  "OTP verification cancelled",
  "Out for Delivery",
  "Out Of Stock",
  "Partially Printed",
  "Partially Returned",
  "Partitally Picklisted",
  "PIcked Up",
  "Printed",
  "Refused to accept",
  "Residence / office closed",
  "Returned",
  "Reverse Pickup Initiated",
  "RTO Initiated",
  "S-Printed",
  "Self collect",
  "Stitched/QC",
  "To be Printed",
]);

const QIKINK_ORDER_FIELDS = new Set([
  "order_id",
  "number",
  "created_on",
  "live_date",
  "status",
  "shipping_type",
  "payment_type",
  "total_order_value",
  "shipping",
  "line_items",
]);

export async function getQikinkOrderList(query: QikinkOrderListQuery = {}): Promise<QikinkOrderListResponse> {
  const mode = getQikinkMode();
  if (mode === "sandbox") {
    throw new QikinkValidationError(
      "Qikink order lookup is not available in the sandbox environment; use approved live credentials to query the order list.",
    );
  }

  if (query.order_reference_no && query.order_reference_no.length > 22) {
    throw new QikinkValidationError("order_reference_no must be at most 22 characters.");
  }
  if (query.status && !QIKINK_ORDER_STATUSES.has(query.status)) {
    throw new QikinkValidationError(`Unsupported Qikink order status: ${query.status}.`);
  }
  if (query.id && !/^\d+$/.test(query.id)) {
    throw new QikinkValidationError("Qikink order id must be numeric.");
  }
  if (query.ids && !/^\d+(,\d+)*$/.test(query.ids)) {
    throw new QikinkValidationError("Qikink ids must be comma-separated numeric order IDs.");
  }
  if (query.params && query.params.split(",").some((field) => !QIKINK_ORDER_FIELDS.has(field.trim()))) {
    throw new QikinkValidationError("One or more requested Qikink response fields are unsupported.");
  }
  for (const date of [query.live_date_min, query.live_date_max]) {
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new QikinkValidationError("Qikink live-date filters must use YYYY-MM-DD format.");
    }
  }
  if (query.page_no !== undefined && (!Number.isInteger(query.page_no) || query.page_no < 1)) {
    throw new QikinkValidationError("Qikink page_no must be a positive integer.");
  }

  const { clientId } = getQikinkCredentials(mode);
  const token = await getAccessToken(false, false);

  const url = new URL(`${getQikinkBaseUrl(mode)}/api/order/list`);
  if (query.order_reference_no) url.searchParams.set("order_reference_no", query.order_reference_no);
  if (query.status) url.searchParams.set("status", query.status);
  if (query.id) url.searchParams.set("id", query.id);
  if (query.ids) url.searchParams.set("ids", query.ids);
  if (query.params) url.searchParams.set("params", query.params);
  if (query.live_date_min) url.searchParams.set("live_date_min", query.live_date_min);
  if (query.live_date_max) url.searchParams.set("live_date_max", query.live_date_max);
  if (query.page_no) url.searchParams.set("page_no", String(query.page_no));

  const response = await fetch(url, {
    method: "GET",
    headers: {
      ClientId: clientId,
      Accesstoken: token,
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  const body = (await response.json().catch(() => null)) as QikinkOrderListResponse | null;
  if (!response.ok || body?.success !== true || !Array.isArray(body.data)) {
    const message = typeof body?.message === "string" ? body.message.slice(0, 180) : "";
    throw new QikinkOrderError(
      `Qikink order lookup failed (HTTP ${response.status})${message ? `: ${message}` : "."}`,
      response.status,
    );
  }

  return body;
}

/**
 * Synchronizes tracking details from Qikink for a specific TrendEra internal order.
 */
export async function syncOrderTrackingFromQikink(orderIdOrNumber: string): Promise<QikinkTrackingSyncResult> {
  const supabase = getAdminClient();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderIdOrNumber);

  let queryBuilder = supabase
    .from("store_orders")
    .select("id,order_number,qikink_order_id,qikink_submission_status,status");

  queryBuilder = isUuid
    ? queryBuilder.eq("id", orderIdOrNumber)
    : queryBuilder.eq("order_number", orderIdOrNumber);

  const { data: order, error } = await queryBuilder.maybeSingle();

  if (error || !order) {
    throw new QikinkValidationError(`Order '${orderIdOrNumber}' was not found in store database.`);
  }

  const result: QikinkTrackingSyncResult = {
    orderId: order.id,
    orderNumber: order.order_number,
    qikinkOrderId: order.qikink_order_id ?? undefined,
    synced: false,
  };

  if (!order.qikink_order_id && order.qikink_submission_status !== "submitted") {
    result.error = "Order has not been successfully submitted to Qikink yet.";
    return result;
  }

  try {
    const listResponse = await getQikinkOrderList({
      order_reference_no: order.order_number,
      params: "order_id,number,status,shipping",
    });

    const matchingOrder: QikinkOrder | undefined =
      listResponse.data?.find((o) => o.number === order.order_number || String(o.order_id) === order.qikink_order_id) ??
      listResponse.data?.[0];

    if (!matchingOrder) {
      result.error = "No matching order record found in Qikink yet.";
      return result;
    }

    const qikinkStatus = matchingOrder.status;
    const awb = matchingOrder.shipping?.awb ?? null;
    const courier = matchingOrder.shipping?.courier_provider_name ?? null;
    const trackingUrl = matchingOrder.shipping?.tracking_link ?? null;

    result.status = qikinkStatus;
    result.awb = awb;
    result.courier = courier;
    result.trackingUrl = trackingUrl;

    // Map Qikink status to TrendEra store order status
    let internalStatus = order.status;
    if (qikinkStatus === "Delivered") {
      internalStatus = "fulfilled";
    } else if (qikinkStatus === "Cancelled") {
      internalStatus = "cancelled";
    }

    const { error: updateError } = await supabase
      .from("store_orders")
      .update({
        status: internalStatus,
        qikink_status: qikinkStatus,
        qikink_awb: awb,
        qikink_courier: courier,
        qikink_tracking_url: trackingUrl,
        qikink_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    if (updateError) {
      throw new Error(`Failed to save updated tracking to database: ${updateError.message}`);
    }

    result.synced = true;
    return result;
  } catch (err) {
    result.error = err instanceof Error ? err.message : "Tracking synchronization failed.";
    return result;
  }
}

/**
 * Synchronize all active orders that have been submitted to Qikink.
 */
export async function syncAllActiveOrders(): Promise<{
  total: number;
  synced: number;
  results: QikinkTrackingSyncResult[];
}> {
  const supabase = getAdminClient();
  const { data: orders, error } = await supabase
    .from("store_orders")
    .select("id,order_number,qikink_order_id")
    .eq("qikink_submission_status", "submitted")
    .not("qikink_status", "in", '("Delivered","Cancelled","Returned")')
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !orders) {
    return { total: 0, synced: 0, results: [] };
  }

  const results: QikinkTrackingSyncResult[] = [];
  let synced = 0;

  for (const order of orders) {
    const res = await syncOrderTrackingFromQikink(order.id);
    results.push(res);
    if (res.synced) synced++;
  }

  // Log sync run to qikink_sync_logs
  try {
    await supabase.from("qikink_sync_logs").insert({
      sync_type: "tracking",
      status: synced === orders.length ? "success" : synced > 0 ? "partial" : "failed",
      items_count: orders.length,
      details: { ordersChecked: orders.length, ordersUpdated: synced },
    });
  } catch {
    // Non-blocking
  }

  return { total: orders.length, synced, results };
}
