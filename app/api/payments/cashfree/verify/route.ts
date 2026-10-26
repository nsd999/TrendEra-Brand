import { NextResponse } from "next/server";
import { z } from "zod";
import { reconcileCashfreeOrder } from "@/lib/cashfree/reconcile-order";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ orderId: z.string().regex(/^[A-Za-z0-9_-]{3,50}$/) });

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid order reference." }, { status: 400 });

  try {
    const result = await reconcileCashfreeOrder(parsed.data.orderId);
    return NextResponse.json(result, { status: result.status === "pending" ? 202 : 200 });
  } catch {
    return NextResponse.json({ error: "Payment status could not be verified. Please wait and check again." }, { status: 503 });
  }
}
