import "server-only";

type TokenResponse = { Accesstoken?: string; expires_in?: number; message?: string };
type OrderResponse = { order_id?: number | string; status_code?: string | number; code?: string | number; message?: string; msg?: string; error?: string };
type OrderListResponse = { success?: boolean; data?: QikinkOrder[]; pagination?: { page: number; per_page: number; total_results: number; total_pages: number; has_next: boolean }; filters?: Record<string, string>; message?: string };
export type QikinkOrder = { order_id: number; number: string; created_on: string; live_date: string | null; status: string; shipping_type: string; payment_type: string; total_order_value: string; shipping?: { first_name?: string; last_name?: string; city?: string; zip?: string; province?: string; country_code?: string; awb?: string | null; tracking_link?: string | null; courier_provider_name?: string | null }; line_items?: Array<{ sku: string; quantity: string; price: string }> };

export type QikinkDesign = {
  design_code: string;
  width_inches: string;
  height_inches: string;
  placement_sku: string;
  design_link: string;
  mockup_link: string;
};

export type QikinkLineItem = {
  sku: string;
  price: string;
  quantity: number;
  print_type_id: number;
  design?: QikinkDesign | null;
};

export type QikinkShippingAddress = {
  first_name: string;
  last_name: string;
  address1: string;
  address2?: string;
  phone: string;
  email: string;
  city: string;
  zip: string;
  province: string;
  country?: string;
  country_code: string;
};

export type QikinkCreateOrderInput = {
  order_number: string;
  gateway: "Prepaid" | "COD";
  total_order_value: number;
  line_items: QikinkLineItem[];
  shipping_address: QikinkShippingAddress;
};

let cachedToken: string | null = null;
let cachedTokenMode: "sandbox" | "live" | null = null;
let tokenExpiresAt = 0;

function getMode() {
  return process.env.QIKINK_SANDBOX_MODE !== "false" ? "sandbox" : "live";
}

function getBaseUrl() {
  return getMode() === "sandbox" ? "https://sandbox.qikink.com" : "https://api.qikink.com";
}

async function getAccessToken(forceRefresh = false, requireLiveOrderSubmission = true): Promise<string> {
  const mode = getMode();
  const clientId = process.env.QIKINK_CLIENT_ID?.trim();
  const clientSecret = (mode === "sandbox"
    ? process.env.QIKINK_SANDBOX_SECRET
    : process.env.QIKINK_CLIENT_SECRET)?.trim();

  if (!clientId || !clientSecret) {
    throw new Error(mode === "sandbox"
      ? "Qikink sandbox credentials are not configured."
      : "Qikink live credentials are not configured.");
  }
  if (requireLiveOrderSubmission && mode === "live" && process.env.QIKINK_LIVE_ORDERS_ENABLED !== "true") {
    throw new Error("Live Qikink order submission is disabled. Set QIKINK_LIVE_ORDERS_ENABLED=true only after sandbox testing.");
  }
  if (!forceRefresh && cachedToken && cachedTokenMode === mode && Date.now() < tokenExpiresAt - 30_000) return cachedToken;

  const form = new URLSearchParams();
  form.set("ClientId", clientId);
  form.set("client_secret", clientSecret);
  const response = await fetch(`${getBaseUrl()}/api/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: form.toString(),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json().catch(() => null) as TokenResponse | null;
  if (!response.ok || !body?.Accesstoken) {
    throw new Error(`Qikink authentication failed (HTTP ${response.status}). Check credentials and environment mode.`);
  }

  cachedToken = body.Accesstoken;
  cachedTokenMode = mode;
  const lifetimeSeconds = Math.max(60, Math.min(Number(body.expires_in) || 3600, 3600));
  tokenExpiresAt = Date.now() + (lifetimeSeconds - 60) * 1000;
  return cachedToken;
}

async function sendOrder(input: QikinkCreateOrderInput, token: string) {
  const mode = getMode();
  const clientId = process.env.QIKINK_CLIENT_ID!.trim();
  const lineItems = input.line_items.map((item) => {
    if (mode === "sandbox") {
      // Qikink plain products use print_type_id=1 and have no design object.
      if (!item.design && item.print_type_id !== 1) {
        throw new Error("Printed sandbox products need design metadata. Configure a design code and mockup for the variant.");
      }
      return {
        search_from_my_products: 0,
        sku: item.sku,
        quantity: String(item.quantity),
        price: item.price,
        print_type_id: String(item.print_type_id),
        ...(item.design ? {
          designs: [{
            design_code: item.design.design_code,
            width_inches: item.design.width_inches,
            height_inches: item.design.height_inches,
            placement_sku: item.design.placement_sku,
            design_link: item.design.design_link,
            mockup_link: item.design.mockup_link,
          }],
        } : {}),
      };
    }
    return {
      search_from_my_products: 1,
      sku: item.sku,
      quantity: String(item.quantity),
      price: item.price,
    };
  });

  const response = await fetch(`${getBaseUrl()}/api/order/create`, {
    method: "POST",
    headers: {
      ClientId: clientId,
      Accesstoken: token,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      order_number: input.order_number,
      qikink_shipping: "1",
      gateway: input.gateway,
      total_order_value: input.total_order_value.toFixed(2),
      line_items: lineItems,
      // Send only documented fields. "country" is not a Qikink API field and
      // causes the API to reject the entire request as an unexpected field.
      shipping_address: {
        first_name: input.shipping_address.first_name,
        last_name: input.shipping_address.last_name ?? "",
        address1: input.shipping_address.address1,
        address2: input.shipping_address.address2 ?? "",
        phone: input.shipping_address.phone,
        email: input.shipping_address.email,
        city: input.shipping_address.city,
        zip: input.shipping_address.zip,
        province: input.shipping_address.province,
        country_code: input.shipping_address.country_code || "IN",
      },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  const body = await response.json().catch(() => null) as OrderResponse | null;
  const success = body && (
    String(body.status_code) === "200" ||
    (body.order_id != null && (body.code == null || String(body.code) === "1"))
  );
  if (!response.ok || !success || body?.order_id == null) {
    const providerError = body?.error?.slice(0, 180);
    throw new Error(`Qikink order submission failed (HTTP ${response.status})${providerError ? `: ${providerError}` : ". Check the Qikink dashboard and SKU/design mapping before retrying."}`);
  }
  return { orderId: String(body.order_id), message: body.message ?? body.msg ?? "Order accepted by Qikink." };
}

export async function createQikinkOrder(input: QikinkCreateOrderInput) {
  if (!/^[A-Za-z0-9_]{1,15}$/.test(input.order_number)) {
    throw new Error("Qikink order number must be 1–15 letters, digits, or underscores.");
  }
  if (!input.line_items.length) throw new Error("At least one Qikink line item is required.");
  let token = await getAccessToken();
  try {
    return await sendOrder(input, token);
  } catch (error) {
    // Refresh once for expired tokens only; avoid retrying order submissions after ambiguous failures.
    if (error instanceof Error && /HTTP 401/.test(error.message)) {
      token = await getAccessToken(true);
      return sendOrder(input, token);
    }
    throw error;
  }
}


const QIKINK_ORDER_STATUSES = new Set([
  "Archived", "Cancelled", "Consignee unavailable", "Delivered", "Delivery rescheduled",
  "Dispatch Ready", "Exception", "In-Transit", "Incorrect/incomplete Address", "Live",
  "Live-OOS", "Lost", "Manifested", "Maximum attempts reached", "Misrouted", "No-Data",
  "Not attempted", "ODA", "On Hold", "Open delivery refused", "OTP not shared",
  "OTP verification cancelled", "Out for Delivery", "Out Of Stock", "Partially Printed",
  "Partially Returned", "Partitally Picklisted", "PIcked Up", "Printed", "Refused to accept",
  "Residence / office closed", "Returned", "Reverse Pickup Initiated", "RTO Initiated",
  "S-Printed", "Self collect", "Stitched/QC", "To be Printed",
]);
const QIKINK_ORDER_FIELDS = new Set([
  "order_id", "number", "created_on", "live_date", "status", "shipping_type",
  "payment_type", "total_order_value", "shipping", "line_items",
]);

export type QikinkOrderListQuery = {
  order_reference_no?: string;
  status?: string;
  id?: string;
  ids?: string;
  params?: string;
  live_date_min?: string;
  live_date_max?: string;
  page_no?: number;
};

/** Fetch the documented, paginated Qikink order list. Qikink documents order lookup as unavailable in sandbox. */
export async function getQikinkOrderList(query: QikinkOrderListQuery = {}) {
  if (getMode() === "sandbox") {
    throw new Error("Qikink order lookup is not available in the sandbox environment; use the Qikink dashboard or configure live access when approved.");
  }
  if (query.order_reference_no && query.order_reference_no.length > 22) throw new Error("order_reference_no must be at most 22 characters.");
  if (query.status && !QIKINK_ORDER_STATUSES.has(query.status)) throw new Error("Unsupported Qikink order status.");
  if (query.id && !/^\d+$/.test(query.id)) throw new Error("Qikink order id must be numeric.");
  if (query.ids && !/^\d+(,\d+)*$/.test(query.ids)) throw new Error("Qikink ids must be comma-separated numeric order IDs.");
  if (query.params && query.params.split(",").some((field) => !QIKINK_ORDER_FIELDS.has(field))) throw new Error("One or more Qikink response fields are unsupported.");
  for (const date of [query.live_date_min, query.live_date_max]) {
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Qikink live-date filters must use YYYY-MM-DD.");
  }
  if (query.page_no !== undefined && (!Number.isInteger(query.page_no) || query.page_no < 1)) throw new Error("Qikink page_no must be a positive integer.");

  const token = await getAccessToken(false, false);
  const url = new URL(`${getBaseUrl()}/api/order/list`);
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
    headers: { ClientId: process.env.QIKINK_CLIENT_ID!.trim(), Accesstoken: token, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json().catch(() => null) as OrderListResponse | null;
  if (!response.ok || body?.success !== true || !Array.isArray(body.data)) {
    const message = typeof body?.message === "string" ? body.message.slice(0, 180) : "";
    throw new Error(`Qikink order lookup failed (HTTP ${response.status})${message ? `: ${message}` : "."}`);
  }
  return body;
}
