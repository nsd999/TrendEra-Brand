import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const configured = Boolean(
    process.env.QIKINK_API_BASE_URL?.trim() &&
    process.env.QIKINK_AUTH_TOKEN?.trim()
  );

  return NextResponse.json({
    provider: "qikink",
    integrationConfigured: configured,
    mode: process.env.QIKINK_MODE === "live" ? "live" : "sandbox",
    capabilities: {
      orderSubmission: configured,
      catalogImport: false,
      liveInventorySync: false,
      trackingSync: false,
    },
    note: "Catalog, stock and tracking APIs must be confirmed with Qikink before enabling those capabilities.",
  });
}
