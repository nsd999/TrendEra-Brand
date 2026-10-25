import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createQikinkOrder, QikinkApiError } from "@/lib/qikink/client";
import type { QikinkCreateOrderInput } from "@/lib/qikink/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const allowedSkus = new Set(["UAcryPos-Wh-16x24Inches", "UOtmcap-Bk-NA", "UOsJsRnHs-Wh-XS"]);

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  const secret = process.env.QIKINK_TEST_ENDPOINT_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  if (!secret || !authorization.startsWith("Bearer ") || !safeEqual(authorization.slice(7), secret)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (process.env.QIKINK_SANDBOX_MODE?.trim().toLowerCase() !== "true") {
    return NextResponse.json({ ok: false, error: "QIKINK_SANDBOX_MODE must be true." }, { status: 503 });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ ok: false, error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || !("order" in body)) {
    return NextResponse.json({ ok: false, error: "Provide an order object." }, { status: 400 });
  }
  const order = (body as { order: QikinkCreateOrderInput }).order;
  if (!order || !Array.isArray(order.line_items) || order.line_items.length !== 1 || order.line_items.some((item) => !allowedSkus.has(item?.sku))) {
    return NextResponse.json({ ok: false, error: "Each request must contain exactly one approved Trendera test SKU." }, { status: 400 });
  }
  if (!/^[A-Za-z0-9]{1,15}$/.test(order.order_number ?? "")) {
    return NextResponse.json({ ok: false, error: "order_number must be 1–15 alphanumeric characters." }, { status: 400 });
  }

  try {
    const result = await createQikinkOrder(order);
    return NextResponse.json({ ok: true, sandbox: true, order_id: result.order_id, message: result.msg ?? "Sandbox order created." }, { status: 201 });
  } catch (error) {
    const message = error instanceof QikinkApiError ? error.message : "Sandbox order request failed.";
    const retrySafe = error instanceof QikinkApiError ? error.retrySafe : false;
    return NextResponse.json({ ok: false, sandbox: true, error: message, retry_safe: retrySafe }, { status: retrySafe ? 400 : 502 });
  }
}
