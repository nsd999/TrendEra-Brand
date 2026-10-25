# Trendera Qikink MCP

## Current safety state

The MCP endpoint is implemented at `/api/mcp` using JSON-RPC over HTTP. It requires a bearer token from `QIKINK_MCP_ACCESS_TOKEN`.

Available tools:
- `qikink_integration_status` — read-only status; does not contact Qikink.
- `qikink_test_products` — returns the three store-owner-supplied variant SKUs. They are not verified against Qikink's catalogue.
- `qikink_create_sandbox_order` — intentionally refuses to submit orders until Qikink confirms sandbox support and the correct endpoint/credentials.

## Verified public Qikink API information

The public Qikink API documentation currently discoverable at https://admins.qikink.com/api-docs documents:
- Create order: `POST https://qikink.com/erp2/index.php/api/createOrder`
- JSON request body (not form-data)
- `auth_token` supplied by Qikink
- `order_number` alphanumeric, max 15 characters
- `qikink_shipping`, `gateway`, `total_order_value`, `line_items`, and optional `shipping_address`
- Success example: `code: 1`, `order_id`, and a success message

That documentation does not, in the accessible public content, establish a separate sandbox hostname or sandbox-mode flag. Therefore the standard endpoint must NOT be called for test orders until Qikink confirms whether a sandbox exists and supplies its exact endpoint and credentials.

## Vercel environment variable

Set `QIKINK_MCP_ACCESS_TOKEN` in Preview and Production only after generating a high-entropy secret. Never commit it, expose it as `NEXT_PUBLIC_*`, or include it in the URL. The same bearer token can be configured as a static bearer credential for ChatGPT and as the Authorization header credential in Composio Custom MCP, if those clients' current auth configuration supports it.

## ChatGPT

After deployment, connect through ChatGPT on the web: Plugins/Apps → Add custom MCP server → enter `https://trenderabrand.store/api/mcp` (or the Preview URL first), configure Bearer authentication, review permissions, and install. Availability depends on the ChatGPT workspace/account's custom MCP access.

## Composio

Composio's Custom MCP is experimental and currently API-only:
1. Register `https://trenderabrand.store/api/mcp` with `POST /api/v3.1/custom/toolkits/upsert` using the Composio project API key.
2. Configure its API-key authentication scheme to send the bearer token as the `Authorization` header.
3. Complete the connected-account flow and confirm initial tool sync.
4. Use the returned `CUSTOM_*` toolkit slug in a Composio session.
5. Verify `qikink_integration_status` before attempting anything else.

Official instructions: https://docs.composio.dev/docs/extending-sessions/custom-mcp

## Deployment and testing

- Deploy a Preview build first.
- Set `QIKINK_MCP_ACCESS_TOKEN` in Vercel Preview variables.
- Test unauthenticated POST returns 401.
- Test authenticated `initialize`, `tools/list`, and `qikink_integration_status`.
- Confirm `qikink_create_sandbox_order` refuses without sending any request to Qikink.
- Do not enable order creation until Qikink supplies written sandbox confirmation and its exact API contract.
