import "server-only";
import type { QikinkCreateOrderInput, QikinkCreateOrderResult } from "@/lib/qikink/types";
import { validateQikinkOrderInput } from "@/lib/qikink/validation.mjs";

const QIKINK_CREATE_ORDER_URL = "https://qikink.com/erp2/index.php/api/createOrder";

export class QikinkApiError extends Error {
  constructor(message: string, public readonly retrySafe: boolean) {
    super(message);
    this.name = "QikinkApiError";
  }
}

/**
 * Server-only Qikink order client. Do not expose this function through a public
 * route until checkout authorization, payment verification, and idempotency exist.
 *
 * A timeout/network failure is ambiguous: Qikink may have accepted the order.
 * Reconcile against Qikink before any manual retry; never blindly resubmit.
 */
export async function createQikinkOrder(
  input: QikinkCreateOrderInput,
  fetchImpl: typeof fetch = fetch,
): Promise<QikinkCreateOrderResult> {
  const validationError = validateQikinkOrderInput(input);
  if (validationError) throw new QikinkApiError(validationError, true);

  const authToken = process.env.QIKINK_AUTH_TOKEN;
  if (!authToken) throw new QikinkApiError("Qikink API credentials are not configured.", true);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetchImpl(QIKINK_CREATE_ORDER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ...input, auth_token: authToken }),
      cache: "no-store",
      signal: controller.signal,
    });

    let result: unknown;
    try {
      result = await response.json();
    } catch {
      throw new QikinkApiError("Qikink returned an unreadable response.", false);
    }
    if (!response.ok) throw new QikinkApiError(`Qikink request failed with HTTP ${response.status}.`, false);
    if (!result || typeof result !== "object" || !("code" in result)) {
      throw new QikinkApiError("Qikink returned an unexpected response format.", false);
    }

    const typedResult = result as QikinkCreateOrderResult;
    if (typedResult.code !== 1 || typedResult.order_id === undefined || typedResult.order_id === null) {
      throw new QikinkApiError(
        typeof typedResult.msg === "string" ? typedResult.msg.slice(0, 240) : "Qikink did not confirm order creation.",
        true,
      );
    }
    return {
      code: typedResult.code,
      order_id: String(typedResult.order_id),
      msg: typeof typedResult.msg === "string" ? typedResult.msg.slice(0, 240) : undefined,
    };
  } catch (error) {
    if (error instanceof QikinkApiError) throw error;
    throw new QikinkApiError("Qikink did not return a definitive response. Reconcile the order before retrying.", false);
  } finally {
    clearTimeout(timeout);
  }
}
