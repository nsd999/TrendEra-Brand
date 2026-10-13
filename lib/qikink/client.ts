import "server-only";

type QikinkCreateOrderResponse = {
  code?: number | string;
  order_id?: number | string;
  msg?: string;
};

export type QikinkLineItem = {
  search_from_my_products: boolean;
  price: string;
  quantity: number;
  sku: string;
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
  country: string;
  country_code: string;
};

export type QikinkCreateOrderInput = {
  order_number: string;
  gateway: "online" | "cash_on_delivery";
  total_order_value: number;
  line_items: QikinkLineItem[];
  shipping_address: QikinkShippingAddress;
};

export async function createQikinkOrder(
  input: QikinkCreateOrderInput,
): Promise<{ orderId: string; message: string }> {
  const baseUrl = process.env.QIKINK_API_BASE_URL?.trim().replace(/\/+$/, "");
  const authToken = process.env.QIKINK_AUTH_TOKEN?.trim();

  if (!baseUrl || !authToken) {
    throw new Error("Qikink API is not configured. Set server-side QIKINK_API_BASE_URL and QIKINK_AUTH_TOKEN.");
  }

  if (!/^[A-Za-z0-9]{1,15}$/.test(input.order_number)) {
    throw new Error("Qikink order number must be 1–15 alphanumeric characters.");
  }
  if (!input.line_items.length) throw new Error("At least one Qikink line item is required.");

  const response = await fetch(`${baseUrl}/createOrder`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      auth_token: authToken,
      order_number: input.order_number,
      qikink_shipping: 1,
      gateway: input.gateway,
      total_order_value: input.total_order_value,
      line_items: input.line_items,
      shipping_address: input.shipping_address,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  const body = (await response.json().catch(() => null)) as QikinkCreateOrderResponse | null;
  if (!response.ok || !body || String(body.code) !== "1" || body.order_id == null) {
    // Do not include request headers, credentials, or customer address in logs/errors.
    throw new Error(
      `Qikink order submission failed (HTTP ${response.status}; code ${String(body?.code ?? "unknown")}). ${body?.msg ? "Check the Qikink dashboard and API response." : "Check API availability and configuration."}`,
    );
  }

  return { orderId: String(body.order_id), message: body.msg ?? "Order accepted by Qikink." };
}
