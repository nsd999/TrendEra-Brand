import { NextResponse } from "next/server";
import { getQikinkMode } from "@/lib/qikink/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const mode = getQikinkMode();
  const clientId = process.env.QIKINK_CLIENT_ID?.trim();
  const secret = (
    mode === "sandbox"
      ? (process.env.QIKINK_SANDBOX_SECRET ?? process.env.QIKINK_CLIENT_SECRET)
      : process.env.QIKINK_CLIENT_SECRET
  )?.trim();

  const configured = Boolean(clientId && secret);
  const liveEnabled = mode === "live" && process.env.QIKINK_LIVE_ORDERS_ENABLED === "true";

  return NextResponse.json({
    provider: "qikink",
    integrationConfigured: configured,
    mode,
    liveOrderSubmissionEnabled: liveEnabled,
    capabilities: {
      orderSubmission: configured && (mode === "sandbox" || liveEnabled),
      orderLookup: configured && mode === "live" && Boolean(process.env.QIKINK_ADMIN_API_TOKEN?.trim()),
      catalogImport: true, // Native Push to TrendEra with presets & CSV import
      liveInventorySync: false, // Not supported by Qikink Open API
      trackingSync: configured && mode === "live", // Pull sync using /api/order/list
    },
    note: "Qikink Live Open API integrated directly into TrendEra. Supports Live authentication, automated Cashfree-reconciled fulfillment order submission, order list lookup, tracking synchronization, and native Push to TrendEra catalogue management.",
  });
}
