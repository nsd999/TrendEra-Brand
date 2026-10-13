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
    integrationConfigured: configured && (sandbox || liveEnabled),
    mode: sandbox ? "sandbox" : "live",
    liveOrderSubmissionEnabled: liveEnabled,
    capabilities: {
      orderSubmission: configured && (sandbox || liveEnabled),
      catalogImport: false,
      liveInventorySync: false,
      trackingSync: false,
    },
    note: "Catalog import, live stock and tracking sync are not implemented because a confirmed supported endpoint/webhook is still needed.",
  });
}
