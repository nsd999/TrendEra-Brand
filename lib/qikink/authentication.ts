import "server-only";

import { QikinkAuthError } from "./errors.ts";
import type { QikinkConnectionStatus, QikinkMode, QikinkTokenResponse } from "./types.ts";

let cachedToken: string | null = null;
let cachedTokenMode: QikinkMode | null = null;
let tokenExpiresAt = 0;

export function getQikinkMode(): QikinkMode {
  // Support both QIKINK_ENVIRONMENT=live and legacy QIKINK_SANDBOX_MODE=false
  const env = (process.env.QIKINK_ENVIRONMENT ?? "").toLowerCase().trim();
  if (env === "live" || env === "production") return "live";
  if (process.env.QIKINK_SANDBOX_MODE === "false") return "live";
  return "sandbox";
}

export function getQikinkBaseUrl(mode: QikinkMode = getQikinkMode()): string {
  return mode === "sandbox" ? "https://sandbox.qikink.com" : "https://api.qikink.com";
}

export function getQikinkCredentials(mode: QikinkMode = getQikinkMode()): { clientId: string; clientSecret: string } {
  const clientId = process.env.QIKINK_CLIENT_ID?.trim();
  const clientSecret = (
    mode === "sandbox"
      ? (process.env.QIKINK_SANDBOX_SECRET ?? process.env.QIKINK_CLIENT_SECRET)
      : process.env.QIKINK_CLIENT_SECRET
  )?.trim();

  if (!clientId || !clientSecret) {
    throw new QikinkAuthError(
      mode === "sandbox"
        ? "Qikink sandbox credentials are not configured. Set QIKINK_CLIENT_ID and QIKINK_SANDBOX_SECRET or QIKINK_CLIENT_SECRET."
        : "Qikink live credentials are not configured. Set QIKINK_CLIENT_ID and QIKINK_CLIENT_SECRET.",
      401,
    );
  }

  return { clientId, clientSecret };
}

export async function getAccessToken(
  forceRefresh = false,
  requireLiveOrderSubmission = false,
): Promise<string> {
  const mode = getQikinkMode();
  const { clientId, clientSecret } = getQikinkCredentials(mode);

  if (requireLiveOrderSubmission && mode === "live" && process.env.QIKINK_LIVE_ORDERS_ENABLED !== "true") {
    throw new QikinkAuthError(
      "Live Qikink order submission is locked. Set QIKINK_LIVE_ORDERS_ENABLED=true in server configuration after verification.",
      403,
    );
  }

  // Reuse cached token if valid and margin > 30s
  if (!forceRefresh && cachedToken && cachedTokenMode === mode && Date.now() < tokenExpiresAt - 30_000) {
    return cachedToken;
  }

  const form = new URLSearchParams();
  form.set("ClientId", clientId);
  form.set("client_secret", clientSecret);

  let response: Response;
  try {
    response = await fetch(`${getQikinkBaseUrl(mode)}/api/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: form.toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new QikinkAuthError(
      `Could not connect to Qikink authentication service: ${error instanceof Error ? error.message : "Network error"}`,
      504,
    );
  }

  const body = (await response.json().catch(() => null)) as QikinkTokenResponse | null;
  if (!response.ok || !body?.Accesstoken) {
    const errorDetail = body?.message ? `: ${body.message}` : "";
    throw new QikinkAuthError(
      `Qikink authentication failed (HTTP ${response.status})${errorDetail}. Verify your Client ID, Secret, and environment mode.`,
      response.status,
    );
  }

  cachedToken = body.Accesstoken;
  cachedTokenMode = mode;
  const lifetimeSeconds = Math.max(60, Math.min(Number(body.expires_in) || 3600, 3600));
  tokenExpiresAt = Date.now() + (lifetimeSeconds - 60) * 1000;
  return cachedToken;
}

/**
 * Diagnostic tool for testing Qikink connection and API availability.
 * Never leaks token or credentials in output.
 */
export async function testQikinkConnection(): Promise<QikinkConnectionStatus> {
  const mode = getQikinkMode();
  const startTime = Date.now();
  const status: QikinkConnectionStatus = {
    connected: false,
    mode,
    liveApiUrl: "https://api.qikink.com",
    sandboxApiUrl: "https://sandbox.qikink.com",
    authenticated: false,
    lastChecked: new Date().toISOString(),
  };

  try {
    const token = await getAccessToken(true, false);
    status.authenticated = Boolean(token);
    status.tokenExpiresInSeconds = Math.max(0, Math.round((tokenExpiresAt - Date.now()) / 1000));
    status.connected = true;
    status.latencyMs = Date.now() - startTime;
  } catch (error) {
    status.connected = false;
    status.authenticated = false;
    status.error = error instanceof Error ? error.message : "Connection failed";
    status.latencyMs = Date.now() - startTime;
  }

  return status;
}
