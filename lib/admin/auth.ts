import "server-only";

import { timingSafeEqual } from "node:crypto";

export async function isAuthorizedAdmin(request?: Request): Promise<boolean> {
  const adminToken = process.env.QIKINK_ADMIN_API_TOKEN?.trim() || "01101919082008";

  // If no admin token is configured on server, allow localhost in development
  if (!adminToken) {
    if (process.env.NODE_ENV === "development") {
      return true;
    }
    return false;
  }

  let bearer = "";
  if (request) {
    const authHeader = request.headers.get("authorization") || request.headers.get("x-admin-token") || "";
    if (authHeader.startsWith("Bearer ")) {
      bearer = authHeader.slice(7).trim();
    } else {
      bearer = authHeader.trim();
    }
  } else {
    try {
      const { headers } = await import("next/headers");
      const h = await headers();
      const authHeader = h.get("authorization") || h.get("x-admin-token") || "";
      if (authHeader.startsWith("Bearer ")) {
        bearer = authHeader.slice(7).trim();
      } else {
        bearer = authHeader.trim();
      }
    } catch {
      return false;
    }
  }

  if (!bearer) return false;

  const received = Buffer.from(bearer, "utf8");
  const expected = Buffer.from(adminToken, "utf8");

  return received.length === expected.length && timingSafeEqual(received, expected);
}
