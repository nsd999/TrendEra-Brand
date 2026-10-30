import "server-only";

import { getAccessToken, getQikinkBaseUrl, getQikinkCredentials, getQikinkMode } from "./authentication.ts";
import { QikinkOrderError, QikinkValidationError } from "./errors.ts";
import type { QikinkCreateOrderInput, QikinkOrderResponse } from "./types.ts";

async function executeOrderRequest(input: QikinkCreateOrderInput, token: string) {
  const mode = getQikinkMode();
  const { clientId } = getQikinkCredentials(mode);

  const lineItems = input.line_items.map((item) => {
    if (mode === "sandbox") {
      // Qikink plain products use print_type_id=1 and have no design object.
      if (!item.design && item.print_type_id !== 1) {
        throw new QikinkValidationError(
          "Printed sandbox products need design metadata. Configure a design code and mockup for the variant.",
        );
      }
      return {
        search_from_my_products: 0,
        sku: item.sku,
        quantity: String(item.quantity),
        price: item.price,
        print_type_id: String(item.print_type_id),
        ...(item.design
          ? {
              designs: [
                {
                  design_code: item.design.design_code,
                  width_inches: item.design.width_inches,
                  height_inches: item.design.height_inches,
                  placement_sku: item.design.placement_sku,
                  design_link: item.design.design_link,
                  mockup_link: item.design.mockup_link,
                },
              ],
            }
          : {}),
      };
    }

    // Live environment: uses pre-configured products from Qikink My Products
    return {
      search_from_my_products: 1,
      sku: item.sku,
      quantity: String(item.quantity),
      price: item.price,
    };
  });

  const payload = {
    order_number: input.order_number,
    qikink_shipping: "1",
    gateway: input.gateway,
    total_order_value: input.total_order_value.toFixed(2),
    line_items: lineItems,
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
  };

  const response = await fetch(`${getQikinkBaseUrl(mode)}/api/order/create`, {
    method: "POST",
    headers: {
      ClientId: clientId,
      Accesstoken: token,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  const body = (await response.json().catch(() => null)) as QikinkOrderResponse | null;
  const success =
    body &&
    (String(body.status_code) === "200" ||
      (body.order_id != null && (body.code == null || String(body.code) === "1")));

  if (!response.ok || !success || body?.order_id == null) {
    const providerError = body?.error?.slice(0, 200) || body?.message?.slice(0, 200);
    throw new QikinkOrderError(
      `Qikink order submission rejected (HTTP ${response.status})${providerError ? `: ${providerError}` : ". Check SKU mapping, wallet balance, and shipping details."}`,
      response.status,
    );
  }

  return {
    orderId: String(body.order_id),
    message: body.message ?? body.msg ?? "Order accepted by Qikink.",
  };
}

export async function createQikinkOrder(input: QikinkCreateOrderInput) {
  if (!/^[A-Za-z0-9_]{1,15}$/.test(input.order_number)) {
    throw new QikinkValidationError("Qikink order number must be 1–15 letters, digits, or underscores.");
  }
  if (!input.line_items.length) {
    throw new QikinkValidationError("At least one Qikink line item is required.");
  }

  const mode = getQikinkMode();
  let token = await getAccessToken(false, mode === "live");

  try {
    return await executeOrderRequest(input, token);
  } catch (error) {
    // If token expired, refresh once and retry
    if (error instanceof Error && /HTTP 401/i.test(error.message)) {
      token = await getAccessToken(true, mode === "live");
      return executeOrderRequest(input, token);
    }
    throw error;
  }
}
