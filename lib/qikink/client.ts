import "server-only";
import type { QikinkCreateOrderInput, QikinkCreateOrderResult } from "@/lib/qikink/types";
import { validateQikinkOrderInput } from "@/lib/qikink/validation.mjs";

export class QikinkApiError extends Error {
  constructor(message: string, public readonly retrySafe: boolean) { super(message); this.name = "QikinkApiError"; }
}
export async function createQikinkOrder(input: QikinkCreateOrderInput, fetchImpl: typeof fetch = fetch): Promise<QikinkCreateOrderResult> {
  const validationError = validateQikinkOrderInput(input);
  if (validationError) throw new QikinkApiError(validationError, true);
  if (process.env.QIKINK_ENV !== "sandbox") throw new QikinkApiError("Qikink sandbox mode is not enabled.", true);
  const endpoint = process.env.QIKINK_CREATE_ORDER_URL;
  if (!endpoint) throw new QikinkApiError("QIKINK_CREATE_ORDER_URL is not configured.", true);
  let parsedEndpoint: URL;
  try { parsedEndpoint = new URL(endpoint); } catch { throw new QikinkApiError("QIKINK_CREATE_ORDER_URL is invalid.", true); }
  if (parsedEndpoint.protocol !== "https:" || !/sandbox/i.test(parsedEndpoint.hostname)) throw new QikinkApiError("Refusing to submit: configured Qikink endpoint is not an HTTPS sandbox host.", true);
  const authToken = process.env.QIKINK_AUTH_TOKEN;
  if (!authToken) throw new QikinkApiError("Qikink sandbox credentials are not configured.", true);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetchImpl(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ ...input, auth_token: authToken }), cache: "no-store", signal: controller.signal });
    let result: unknown;
    try { result = await response.json(); } catch { throw new QikinkApiError("Qikink returned an unreadable response.", false); }
    if (!response.ok) throw new QikinkApiError(`Qikink sandbox request failed with HTTP ${response.status}.`, false);
    if (!result || typeof result !== "object" || !("code" in result)) throw new QikinkApiError("Qikink returned an unexpected response format.", false);
    const typedResult = result as QikinkCreateOrderResult;
    if (typedResult.code !== 1 || typedResult.order_id === undefined || typedResult.order_id === null) throw new QikinkApiError(typeof typedResult.msg === "string" ? typedResult.msg.slice(0, 240) : "Qikink did not confirm order creation.", true);
    return { code: typedResult.code, order_id: String(typedResult.order_id), msg: typeof typedResult.msg === "string" ? typedResult.msg.slice(0, 240) : undefined };
  } catch (error) {
    if (error instanceof QikinkApiError) throw error;
    throw new QikinkApiError("Qikink did not return a definitive response. Reconcile before retrying.", false);
  } finally { clearTimeout(timeout); }
}
