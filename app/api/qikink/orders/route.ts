import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getQikinkOrderList, type QikinkOrderListQuery } from "@/lib/qikink/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hasValidAdminToken(request: Request, expectedToken: string) {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  const received = Buffer.from(header.slice(7), "utf8");
  const expected = Buffer.from(expectedToken, "utf8");
  return received.length > 0 && received.length === expected.length && timingSafeEqual(received, expected);
}

/**
 * Admin-only proxy for Qikink's documented Order List endpoint.
 * Never expose Qikink order/customer data through a public storefront route.
 * Set QIKINK_ADMIN_API_TOKEN to a strong, separate random secret.
 */
export async function GET(request: Request) {
  const adminToken = process.env.QIKINK_ADMIN_API_TOKEN;
  if (!adminToken) {
    return NextResponse.json(
      { error: "Qikink order lookup is not enabled. Configure QIKINK_ADMIN_API_TOKEN." },
      { status: 503 },
    );
  }
  if (!hasValidAdminToken(request, adminToken)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (process.env.QIKINK_SANDBOX_MODE !== "false") {
    return NextResponse.json(
      { error: "Qikink documents order lookup as unavailable in sandbox. Switch only to approved live credentials to use this endpoint." },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const params = url.searchParams;
  const pageRaw = params.get("page_no");
  const query: QikinkOrderListQuery = {};
  const reference = params.get("order_reference_no");
  const status = params.get("status");
  const id = params.get("id");
  const ids = params.get("ids");
  const fields = params.get("params");
  const dateMin = params.get("live_date_min");
  const dateMax = params.get("live_date_max");

  if (reference !== null) query.order_reference_no = reference;
  if (status !== null) query.status = status;
  if (id !== null) query.id = id;
  if (ids !== null) query.ids = ids;
  if (fields !== null) query.params = fields;
  if (dateMin !== null) query.live_date_min = dateMin;
  if (dateMax !== null) query.live_date_max = dateMax;
  if (pageRaw !== null) query.page_no = Number(pageRaw);

  const allowedQueryKeys = new Set([
    "order_reference_no", "status", "id", "ids", "params", "live_date_min", "live_date_max", "page_no",
  ]);
  for (const key of params.keys()) {
    if (!allowedQueryKeys.has(key)) {
      return NextResponse.json({ error: `Unsupported query parameter: ${key}` }, { status: 400 });
    }
  }

  try {
    const result = await getQikinkOrderList(query);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Qikink order lookup failed.";
    const badInput = /must be|unsupported|numeric|YYYY-MM-DD|positive integer/i.test(message);
    return NextResponse.json(
      { error: message },
      { status: badInput ? 400 : 502, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
