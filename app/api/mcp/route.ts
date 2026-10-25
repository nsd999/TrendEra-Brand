import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SERVER = { name: "trendera-qikink-mcp", version: "0.1.0" };
const PRODUCT_SKUS = [
  { name: "Acrylic Poster", variant: "White - 16x24 In", sku: "UAcryPos-Wh-16x24Inches", product_id: "64938236" },
  { name: "BaseBall Ottoman Cap", variant: "Black - Standard", sku: "UOtmcap-Bk-NA", product_id: "64938232" },
  { name: "Unisex Oversized Jersey", variant: "White - XS", sku: "UOsJsRnHs-Wh-XS", product_id: "64938230" },
] as const;

function equalSecret(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function result(id: unknown, value: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result: value }, { headers: { "Cache-Control": "no-store" } });
}
function error(id: unknown, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } }, { headers: { "Cache-Control": "no-store" } });
}
const tools = [
  {
    name: "qikink_integration_status",
    description: "Read-only status of the Trendera Qikink integration. Does not call Qikink or expose secrets.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "qikink_test_products",
    description: "Return the three Trendera variant SKUs supplied by the store owner. These are not verified against a live Qikink catalogue.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "qikink_create_sandbox_order",
    description: "Create one Qikink sandbox test order. Currently blocked until Qikink confirms a separate sandbox endpoint and sandbox credentials. This tool must not submit a live order.",
    inputSchema: {
      type: "object",
      properties: {
        product_sku: { type: "string", enum: PRODUCT_SKUS.map((p) => p.sku) },
        order_number: { type: "string", description: "Unique alphanumeric order reference, max 15 characters." },
      },
      required: ["product_sku", "order_number"],
      additionalProperties: false,
    },
  },
];

export async function GET() {
  return NextResponse.json({
    name: SERVER.name,
    version: SERVER.version,
    transport: "Streamable HTTP",
    endpoint: "/api/mcp",
    note: "POST JSON-RPC requests here. Bearer authentication is required.",
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const expected = process.env.QIKINK_MCP_ACCESS_TOKEN;
  const authorization = request.headers.get("authorization") ?? "";
  if (!expected || !authorization.startsWith("Bearer ") || !equalSecret(authorization.slice(7), expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "WWW-Authenticate": "Bearer", "Cache-Control": "no-store" } });
  }

  let body: unknown;
  try { body = await request.json(); } catch { return error(null, -32700, "Parse error"); }
  if (!body || typeof body !== "object") return error(null, -32600, "Invalid Request");
  const rpc = body as { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> };
  if (rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string") return error(rpc.id ?? null, -32600, "Invalid Request");

  if (rpc.method === "notifications/initialized" || rpc.method === "notifications/cancelled") {
    return new Response(null, { status: 202, headers: { "Cache-Control": "no-store" } });
  }
  if (rpc.method === "initialize") {
    return result(rpc.id ?? null, {
      protocolVersion: typeof rpc.params?.protocolVersion === "string" ? rpc.params.protocolVersion : "2025-03-26",
      capabilities: { tools: {} },
      serverInfo: SERVER,
      instructions: "Qikink write operations are disabled until Qikink confirms sandbox endpoint and sandbox credentials. Never submit a live order through this server.",
    });
  }
  if (rpc.method === "ping") return result(rpc.id ?? null, {});
  if (rpc.method === "tools/list") return result(rpc.id ?? null, { tools });
  if (rpc.method === "tools/call") {
    const params = rpc.params ?? {};
    const name = params.name;
    const args = params.arguments && typeof params.arguments === "object" ? params.arguments as Record<string, unknown> : {};
    if (name === "qikink_integration_status") {
      return result(rpc.id ?? null, {
        content: [{ type: "text", text: JSON.stringify({
          server: "available",
          qikink_official_create_order_endpoint_documented: "https://qikink.com/erp2/index.php/api/createOrder",
          authentication: "Qikink docs say auth_token is supplied by Qikink.",
          sandbox_endpoint_verified: false,
          sandbox_credentials_verified: false,
          order_submission_enabled: false,
          reason: "The public documentation found documents the standard createOrder endpoint, but does not establish a separate sandbox endpoint or sandbox mode. No Qikink request has been made.",
        }, null, 2) }],
      });
    }
    if (name === "qikink_test_products") {
      return result(rpc.id ?? null, { content: [{ type: "text", text: JSON.stringify(PRODUCT_SKUS, null, 2) }] });
    }
    if (name === "qikink_create_sandbox_order") {
      const sku = args.product_sku;
      const orderNumber = args.order_number;
      if (typeof sku !== "string" || !PRODUCT_SKUS.some((p) => p.sku === sku)) {
        return result(rpc.id ?? null, { isError: true, content: [{ type: "text", text: "Rejected: product_sku must be one of the three configured Trendera test SKUs." }] });
      }
      if (typeof orderNumber !== "string" || !/^[A-Za-z0-9]{1,15}$/.test(orderNumber)) {
        return result(rpc.id ?? null, { isError: true, content: [{ type: "text", text: "Rejected: order_number must be 1–15 alphanumeric characters." }] });
      }
      return result(rpc.id ?? null, {
        isError: true,
        content: [{ type: "text", text: "Order NOT submitted. Sandbox creation is deliberately disabled because Qikink's separate sandbox endpoint and sandbox credentials have not been verified. The documented standard endpoint is not safe to assume is a sandbox. Obtain written confirmation from Qikink support before enabling this tool." }],
      });
    }
    return error(rpc.id ?? null, -32601, "Method or tool not found");
  }
  if (rpc.method.startsWith("notifications/")) return new Response(null, { status: 202, headers: { "Cache-Control": "no-store" } });
  return error(rpc.id ?? null, -32601, "Method not found");
}
