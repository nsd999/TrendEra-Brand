import { NextResponse } from "next/server";
import { verifyWooCommerceConnectivity, getWooCommerceConfig } from "@/lib/woocommerce/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { baseUrl, isConfigured } = getWooCommerceConfig();

  // Run the safe connectivity test with bounded timeout
  const result = await verifyWooCommerceConnectivity();

  return NextResponse.json({
    provider: "woocommerce",
    host: baseUrl,
    isConfigured,
    reachable: result.reachable,
    authenticated: result.authenticated,
    isChallengeBlocked: result.isChallengeBlocked,
    catalogueCount: result.catalogueCount,
    statusMessage: result.statusMessage,
    httpStatus: result.httpStatus,
  });
}
