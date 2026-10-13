import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const sandbox = process.env.QIKINK_SANDBOX_MODE !== "false";
  const secret = sandbox ? process.env.QIKINK_SANDBOX_SECRET : process.env.QIKINK_CLIENT_SECRET;
  const configured = Boolean(process.env.QIKINK_CLIENT_ID?.trim() && secret?.trim());
  const liveEnabled = !sandbox && process.env.QIKINK_LIVE_ORDERS_ENABLED === "true";

  return NextResponse.json({
    provider: "qikink",
    integrationConfigured: configured,
    mode: sandbox ? "sandbox" : "live",
    liveOrderSubmissionEnabled: liveEnabled,
    capabilities: {
      orderSubmission: configured && (sandbox || liveEnabled),
      orderLookup: configured && !sandbox && Boolean(process.env.QIKINK_ADMIN_API_TOKEN?.trim()),
      catalogImport: false,
      liveInventorySync: false,
      trackingSync: false,
    },
    note: "Order lookup uses Qikink /api/order/list only with approved live credentials and QIKINK_ADMIN_API_TOKEN. Qikink documents order lookup as unavailable in sandbox. Catalog import, live inventory sync and tracking/webhook sync are not implemented.",
  });
}
