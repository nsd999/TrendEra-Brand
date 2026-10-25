import "server-only";
import type { QikinkCreateOrderInput, QikinkCreateOrderResult } from "@/lib/qikink/types";
import { validateQikinkOrderInput } from "@/lib/qikink/validation.mjs";

export class QikinkApiError extends Error {
  constructor(message: string, public readonly retrySafe: boolean) {
    super(message);
    this.name = "QikinkApiError";
  }
}

const SANDBOX_BASE_URL = "https://sandbox.qikink.com";
const TOKEN_TIMEOUT_MS = 12_000;
const ORDER_TIMEOUT_MS = 15_000;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new QikinkApiError(`${name} is not configured.`, true);
  return value;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, fetchImpl: typeof fetch): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

async function getSandboxAccessToken(fetchImpl: typeof fetch): Promise<{ token: string; clientId: string }> {
  if (process.env.QIKINK_SANDBOX_MODE?.trim().toLowerCase() !== "true") {
    throw new QikinkApiError("QIKINK_SANDBOX_MODE must be set to true. Live mode is deliberately disabled in this integration.", true);
  }
  const clientId = requiredEnv("QIKINK_CLIENT_ID");
  const clientSecret = requiredEnv("QIKINK_SANDBOX_SECRET");
  const form = new URLSearchParams({ ClientId: clientId, client_secret: clientSecret });

  let response: Response;
  try {
    response = await fetchWithTimeout(`${SANDBOX_BASE_URL}/api/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: form.toString(),
    }, TOKEN_TIMEOUT_MS, fetchImpl);
  } catch {
    throw new QikinkApiError("Could not reach Qikink sandbox token service. No order was submitted.", true);
  }

  let payload: unknown;
  try { payload = await response.json(); } catch {
    throw new QikinkApiError("Qikink sandbox token service returned an unreadable response. No order was submitted.", true);
  }
  if (!response.ok) throw new QikinkApiError(`Qikink sandbox authentication failed (HTTP ${response.status}). Check the sandbox Client ID/Secret and dashboard access.`, true);
  if (!payload || typeof payload !== "object") throw new QikinkApiError("Qikink sandbox token response had an unexpected format. No order was submitted.", true);

  const data = payload as { Accesstoken?: unknown; access_token?: unknown; accessToken?: unknown };
  const token = [data.Accesstoken, data.access_token, data.accessToken].find(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  if (!token) throw new QikinkApiError("Qikink authentication response did not contain an access token. No order was submitted.", true);
  return { token, clientId };
}

export async function verifyQikinkSandboxAuth(fetchImpl: typeof fetch = fetch): Promise<{ authenticated: true }> {
  await getSandboxAccessToken(fetchImpl);
  // Never return or log the access token or Client ID.
  return { authenticated: true };
}

export async function createQikinkOrder(input: QikinkCreateOrderInput, fetchImpl: typeof fetch = fetch): Promise<QikinkCreateOrderResult> {
  const validationError = validateQikinkOrderInput(input);
  if (validationError) throw new QikinkApiError(validationError, true);
  if (process.env.QIKINK_SANDBOX_MODE?.trim().toLowerCase() !== "true") {
    throw new QikinkApiError("QIKINK_SANDBOX_MODE must be true. Live order submission is disabled.", true);
  }

  const { token, clientId } = await getSandboxAccessToken(fetchImpl);
  let response: Response;
  try {
    response = await fetchWithTimeout(`${SANDBOX_BASE_URL}/api/order/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", ClientId: clientId, Accesstoken: token },
      body: JSON.stringify({
        ...input,
        line_items: input.line_items.map((item) => ({ ...item, search_from_my_products: false })),
      }),
    }, ORDER_TIMEOUT_MS, fetchImpl);
  } catch {
    throw new QikinkApiError("Qikink sandbox order request did not return a definitive response. Check the Qikink dashboard before retrying.", false);
  }

  let payload: unknown;
  try { payload = await response.json(); } catch {
    throw new QikinkApiError("Qikink sandbox returned an unreadable order response. Check the Qikink dashboard before retrying.", false);
  }
  if (!response.ok) throw new QikinkApiError(`Qikink sandbox order request failed (HTTP ${response.status}). Review the sandbox request details before retrying.`, response.status >= 400 && response.status < 500);
  if (!payload || typeof payload !== "object") throw new QikinkApiError("Qikink sandbox returned an unexpected order response. Check the Qikink dashboard before retrying.", false);

  const data = payload as { status_code?: string | number; code?: number; order_id?: string | number; message?: string; msg?: string };
  const success = data.code === 1 || data.status_code === "200" || data.status_code === 200;
  if (!success || data.order_id === undefined || data.order_id === null) {
    const message = typeof data.msg === "string" ? data.msg : typeof data.message === "string" ? data.message : "Qikink did not confirm order creation.";
    throw new QikinkApiError(message.slice(0, 240), true);
  }
  return { code: 1, order_id: String(data.order_id), msg: typeof data.msg === "string" ? data.msg.slice(0, 240) : typeof data.message === "string" ? data.message.slice(0, 240) : "Sandbox order created." };
}
