import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

const API_VERSION = "2025-01-01";
const SANDBOX_BASE_URL = "https://sandbox.cashfree.com/pg";
const LIVE_BASE_URL = "https://api.cashfree.com/pg";

export type CashfreeCustomer = {
  customer_id: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone: string;
};

export type CashfreeCreateOrderInput = {
  order_id: string;
  order_amount: number;
  order_currency: "INR";
  customer_details: CashfreeCustomer;
  order_meta: { return_url: string; notify_url?: string };
};

export type CashfreeCreateOrderResult = {
  order_id: string;
  order_status: string;
  payment_session_id: string;
  order_amount: number;
  order_currency: string;
};

export class CashfreeApiError extends Error {
  constructor(message: string, public readonly retrySafe: boolean) {
    super(message);
    this.name = "CashfreeApiError";
  }
}

function config() {
  const appId = process.env.CASHFREE_APP_ID;
  const secret = process.env.CASHFREE_SECRET_KEY;
  const mode = process.env.CASHFREE_ENV ?? "sandbox";
  if (!appId || !secret) throw new CashfreeApiError("Cashfree server credentials are not configured.", true);
  if (mode !== "sandbox" && mode !== "production") throw new CashfreeApiError("CASHFREE_ENV must be sandbox or production.", true);
  return { appId, secret, baseUrl: mode === "production" ? LIVE_BASE_URL : SANDBOX_BASE_URL };
}

async function cashfreeFetch<T>(path: string, init: RequestInit = {}, fetchImpl: typeof fetch = fetch): Promise<T> {
  const { appId, secret, baseUrl } = config();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-client-id": appId,
        "x-client-secret": secret,
        "x-api-version": API_VERSION,
        ...(init.headers ?? {}),
      },
      cache: "no-store",
      signal: controller.signal,
    });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      // Do not leak provider response bodies or secrets to callers/logs.
      throw new CashfreeApiError(`Cashfree request failed (HTTP ${response.status}).`, response.status >= 500 || response.status === 429);
    }
    if (!data || typeof data !== "object") throw new CashfreeApiError("Cashfree returned an invalid response.", false);
    return data as T;
  } catch (error) {
    if (error instanceof CashfreeApiError) throw error;
    // For order creation, an unknown network result is not safe to blindly retry.
    throw new CashfreeApiError("Cashfree response was inconclusive; reconcile the order before retrying.", false);
  } finally {
    clearTimeout(timeout);
  }
}

/** Server-only. The caller must calculate amount and persist an internal order before calling. */
export async function createCashfreeOrder(
  input: CashfreeCreateOrderInput,
  fetchImpl: typeof fetch = fetch,
): Promise<CashfreeCreateOrderResult> {
  if (!/^[A-Za-z0-9_-]{3,50}$/.test(input.order_id)) throw new CashfreeApiError("Invalid order ID.", true);
  if (!Number.isFinite(input.order_amount) || input.order_amount <= 0 || Math.round(input.order_amount * 100) !== input.order_amount * 100) {
    throw new CashfreeApiError("Invalid order amount.", true);
  }
  if (input.order_currency !== "INR") throw new CashfreeApiError("Only INR is currently supported.", true);
  if (!input.customer_details.customer_id || !/^\d{10}$/.test(input.customer_details.customer_phone)) {
    throw new CashfreeApiError("Valid customer ID and 10-digit phone are required.", true);
  }
  const result = await cashfreeFetch<CashfreeCreateOrderResult>("/orders", {
    method: "POST",
    body: JSON.stringify(input),
  }, fetchImpl);
  if (!result.payment_session_id || result.order_id !== input.order_id) {
    throw new CashfreeApiError("Cashfree did not return a matching payment session.", false);
  }
  return result;
}

export type CashfreeOrderStatus = {
  order_id: string;
  order_status: string;
  order_amount: number;
  order_currency: string;
};

export async function fetchCashfreeOrderStatus(orderId: string, fetchImpl: typeof fetch = fetch): Promise<CashfreeOrderStatus> {
  if (!/^[A-Za-z0-9_-]{3,50}$/.test(orderId)) throw new CashfreeApiError("Invalid order ID.", true);
  return cashfreeFetch<CashfreeOrderStatus>(`/orders/${encodeURIComponent(orderId)}`, { method: "GET" }, fetchImpl);
}

/** Cashfree webhook signature = Base64(HMAC-SHA256(timestamp + raw request body, client secret)). */
export function verifyCashfreeWebhookSignature(signature: string, timestamp: string, rawBody: string, secret = process.env.CASHFREE_SECRET_KEY): boolean {
  if (!signature || !timestamp || !rawBody || !secret || !/^\d{10,13}$/.test(timestamp)) return false;
  const expected = createHmac("sha256", secret).update(timestamp + rawBody, "utf8").digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, "base64");
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
