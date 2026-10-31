import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const SESSION_COOKIE_NAME = "trendera_admin_session";
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// In-memory rate limiter for failed login attempts: IP -> [timestamp, timestamp, ...]
const failedAttemptsMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILED_ATTEMPTS = 5;

export function getAdminSecret(): string | null {
  const secret = process.env.QIKINK_ADMIN_API_TOKEN?.trim() || process.env.ADMIN_SECRET_KEY?.trim();
  return secret || null;
}

export function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const attempts = (failedAttemptsMap.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  failedAttemptsMap.set(ip, attempts);
  return attempts.length >= MAX_FAILED_ATTEMPTS;
}

export function recordFailedAttempt(ip: string): void {
  const now = Date.now();
  const attempts = (failedAttemptsMap.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  attempts.push(now);
  failedAttemptsMap.set(ip, attempts);
}

export function clearFailedAttempts(ip: string): void {
  failedAttemptsMap.delete(ip);
}

function signSession(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}

export function createAdminSessionToken(secret: string): string {
  const payload = JSON.stringify({ admin: true, iat: Date.now() });
  const b64 = Buffer.from(payload).toString("base64url");
  const signature = signSession(b64, secret);
  return `${b64}.${signature}`;
}

export function verifyAdminSessionToken(token: string, secret: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const [b64, signature] = parts;
    const expectedSig = signSession(b64, secret);

    const sigBuf = Buffer.from(signature, "hex");
    const expBuf = Buffer.from(expectedSig, "hex");
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return false;
    }

    const payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
    if (!payload.admin || typeof payload.iat !== "number") return false;
    if (Date.now() - payload.iat > SESSION_MAX_AGE_MS) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Validates admin authorization from:
 * 1. Secure HttpOnly session cookie (trendera_admin_session)
 * 2. Or explicit Bearer / x-admin-token header
 * Uses constant-time comparisons to prevent timing attacks.
 */
export async function isAuthorizedAdmin(request?: Request): Promise<boolean> {
  const adminSecret = getAdminSecret();
  // If no admin token is configured, reject all admin actions. Never allow default passwords.
  if (!adminSecret) {
    return false;
  }

  // 1. Check Bearer or x-admin-token in request headers
  let bearer = "";
  if (request) {
    const authHeader = request.headers.get("authorization") || request.headers.get("x-admin-token") || "";
    if (authHeader.startsWith("Bearer ")) {
      bearer = authHeader.slice(7).trim();
    } else {
      bearer = authHeader.trim();
    }
  }

  if (bearer) {
    const received = Buffer.from(bearer, "utf8");
    const expected = Buffer.from(adminSecret, "utf8");
    if (received.length === expected.length && timingSafeEqual(received, expected)) {
      return true;
    }
  }

  // 2. Check HttpOnly session cookie
  try {
    let cookieVal: string | undefined;
    if (request) {
      const cookieHeader = request.headers.get("cookie") || "";
      const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`));
      if (match) cookieVal = decodeURIComponent(match[1]);
    } else {
      const { cookies } = await import("next/headers");
      const cookieStore = await cookies();
      cookieVal = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    }

    if (cookieVal && verifyAdminSessionToken(cookieVal, adminSecret)) {
      return true;
    }
  } catch {
    // Cookie reading fallback failed
  }

  return false;
}
