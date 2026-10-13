import "server-only";

type TokenResponse = { Accesstoken?: string; expires_in?: number; message?: string };
type OrderResponse = { order_id?: number | string; status_code?: string | number; code?: string | number; message?: string; msg?: string };

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
let tokenExpiresAt = 0;

function getMode() {
  return process.env.QIKINK_SANDBOX_MODE !== "false" ? "sandbox" : "live";
}

function getBaseUrl() {
  return getMode() === "sandbox" ? "https://sandbox.qikink.com" : "https://api.qikink.com";
}

async function getAccessToken(forceRefresh = false): Promise<string> {
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
  if (mode === "live" && process.env.QIKINK_LIVE_ORDERS_ENABLED !== "true") {
    throw new Error("Live Qikink order submission is disabled. Set QIKINK_LIVE_ORDERS_ENABLED=true only after sandbox testing.");
  }
  if (!forceRefresh && cachedToken && Date.now() < tokenExpiresAt - 30_000) return cachedToken;

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
  const lifetimeSeconds = Math.max(60, Math.min(Number(body.expires_in) || 3600, 3600));
  tokenExpiresAt = Date.now() + (lifetimeSeconds - 60) * 1000;
  return cachedToken;
}

async function sendOrder(input: QikinkCreateOrderInput, token: string) {
  const mode = getMode();
  const clientId = process.env.QIKINK_CLIENT_ID!.trim();
  const lineItems = input.line_items.map((item) => {
    if (mode === "sandbox") {
      if (!item.design) {
        throw new Error("Sandbox order needs design metadata for every variant. Add the design file, mockup and placement in the product variant.");
      }
      return {
        search_from_my_products: 0,
        sku: item.sku,
        quantity: String(item.quantity),
        price: item.price,
        print_type_id: item.print_type_id,
        designs: [{
          design_code: item.design.design_code,
          width_inches: item.design.width_inches,
          height_inches: item.design.height_inches,
          placement_sku: item.design.placement_sku,
          design_link: item.design.design_link,
          mockup_link: item.design.mockup_link,
        }],
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
      shipping_address: {
        ...input.shipping_address,
        address2: input.shipping_address.address2 ?? "",
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
    throw new Error(`Qikink order submission failed (HTTP ${response.status}). Check the Qikink dashboard and SKU/design mapping before retrying.`);
  }
  return { orderId: String(body.order_id), message: body.message ?? body.msg ?? "Order accepted by Qikink." };
}

export async function createQikinkOrder(input: QikinkCreateOrderInput) {
  if (!/^[A-Za-z0-9]{1,15}$/.test(input.order_number)) {
    throw new Error("Qikink order number must be 1–15 alphanumeric characters.");
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
