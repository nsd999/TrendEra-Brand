import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { verifyQikinkSandboxAuth, QikinkApiError } from "@/lib/qikink/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  const secret = process.env.QIKINK_TEST_ENDPOINT_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  if (!secret || !authorization.startsWith("Bearer ") || !safeEqual(authorization.slice(7), secret)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  try {
    await verifyQikinkSandboxAuth();
    return NextResponse.json({ ok: true, sandbox: true, authenticated: true, order_submitted: false, message: "Qikink sandbox authentication succeeded. No order was submitted." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof QikinkApiError ? error.message : "Sandbox authentication test failed. No order was submitted.";
    return NextResponse.json({ ok: false, sandbox: true, authenticated: false, order_submitted: false, error: message }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
