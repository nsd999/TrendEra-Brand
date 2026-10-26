# Qikink Custom API setup for TrendEra

This integration follows the Qikink API Orders (List) documentation, version 08-25 supplied for this project: token exchange at POST /api/token, order creation at POST /api/order/create, and live order lookup at GET /api/order/list. Keep these endpoints and field names distinct from the older legacy auth_token / createOrder API.

## What is implemented on this branch

- Server-only Qikink token exchange using QIKINK_CLIENT_ID and the sandbox/live secret.
- One-hour token cache per warm server instance, with a refresh margin and one refresh on HTTP 401.
- Server-side checkout API that looks up product prices and Qikink SKUs from Supabase (never trusts prices from the browser).
- COD orders are submitted to Qikink after the customer confirms checkout.
- Online orders create a Cashfree payment order and are sent to Qikink only after a signed Cashfree webhook or verification request triggers server-side Cashfree status, amount, and currency validation.
- A database claim prevents concurrent webhook deliveries from submitting the same order twice.
- Qikink order IDs and safe error messages are saved to the private order table.
- GET /api/qikink/status reports configured capabilities without revealing credentials. It does not perform an authentication probe.
- GET /api/qikink/orders proxies the documented paginated /api/order/list endpoint only with a separate admin bearer token and approved live credentials; it is deliberately disabled in sandbox.

## Important current limitations

- Qikink product-catalogue import, live inventory sync and push-based tracking/webhook sync are not implemented because this API specification does not document those capabilities. The Order List endpoint is a live-only pull lookup, not an inventory or tracking webhook.
- TrendEra still needs the customer-facing product listing, cart, Cashfree Checkout UI, order confirmation/tracking pages, secure admin product editor, rate limiting/abuse protection, and tests before accepting public orders. Keep NEXT_PUBLIC_STORE_MODE=coming-soon.
- No stock is represented as live Qikink inventory. A null stock_quantity means unknown; do not show a fabricated stock count.
- A Qikink timeout may have an ambiguous outcome. The code marks the order for manual review instead of blindly resubmitting and risking duplicate production.
- Sandbox and live catalogues are separate. Sandbox custom-design orders use search_from_my_products: 0 and need real public design/mockup URLs plus placement metadata. Live orders use search_from_my_products: 1 and need the product/variant already configured in Qikink My Products.

## 1. Add Vercel environment variables

Set these under Vercel → trenderabrand → Settings → Environment Variables. Add secrets to Preview first, not Production.

| Variable | Purpose |
| --- | --- |
| QIKINK_SANDBOX_MODE=true | Sandbox by default. Set to false only after Qikink approves live credentials. |
| QIKINK_CLIENT_ID | Client ID from Qikink Custom API. |
| QIKINK_SANDBOX_SECRET | Sandbox client secret. Server-only. |
| QIKINK_CLIENT_SECRET | Live client secret; leave blank until live access is approved. |
| QIKINK_LIVE_ORDERS_ENABLED=false | Safety lock. Set to true only when intentionally enabling paid live fulfilment. |
| QIKINK_ADMIN_API_TOKEN | Optional, separate strong random bearer token protecting GET /api/qikink/orders. It does not enable live order submission. |
| NEXT_PUBLIC_SUPABASE_URL | Existing Supabase project URL. |
| SUPABASE_SERVICE_ROLE_KEY | Server-only Supabase service-role key. Never prefix it with NEXT_PUBLIC_. |
| RAZORPAY_KEY_ID | Razorpay key ID used to create online payment orders. |
| RAZORPAY_KEY_SECRET | Server-only Razorpay key secret. |
| RAZORPAY_WEBHOOK_SECRET | Server-only webhook secret configured in Razorpay. |
| NEXT_PUBLIC_SITE_URL | Exact production origin, e.g. https://trenderabrand.vercel.app. |\n| CHECKOUT_ALLOWED_ORIGINS | Optional comma-separated trusted checkout origins, used for branch aliases that do not match VERCEL_URL. |

After adding or changing variables, redeploy the relevant Vercel environment.

## 2. Apply the database migration

Run supabase/migrations/0002_qikink_pod.sql after the existing 0001_initial_schema.sql in your Supabase SQL editor. Keep RLS enabled and do not add public policies for store_orders or store_order_items.

## 3. Create the designs and products

1. In Qikink, upload your print files/designs and prepare mockups.
2. For sandbox testing, copy the product/base SKU and use a public HTTPS design URL and mockup URL. Add one Supabase products row and a product_variants row per size/colour. Store the Qikink base SKU in qikink_sku, set design_code, design_link, mockup_link, width_inches, height_inches, and placement_sku (e.g. fr for front). Set the product status to draft until it has been checked.
3. For live fulfilment, create/publish each product in Qikink My Products, then map every size/colour to the exact Qikink SKU. Update the TrendEra variant's qikink_sku to that SKU. Publish the TrendEra product only after the variant mapping and price are reviewed.
4. Do not use live Qikink products as a guarantee of sandbox SKU availability: sandbox and live product catalogues are separate.

There is no public admin UI/importer yet, so this initial catalogue mapping is a controlled database task. Do not make variants active until their SKU and design mapping have been verified.

## 4. Configure Cashfree webhook

In Razorpay Dashboard → Webhooks, add:

https://trenderabrand.vercel.app/api/webhooks/razorpay

Subscribe to payment.captured and use the exact secret stored in RAZORPAY_WEBHOOK_SECRET. The webhook verifies the HMAC signature and amount/currency before marking the order paid and submitting it to Qikink.

## 5. Test before launch

1. Keep sandbox mode enabled and live orders disabled.
2. Check https://trenderabrand.vercel.app/api/qikink/status for environment/capability flags only; this endpoint does not call Qikink or expose secrets.
3. Do not test order lookup in sandbox: the supplied Qikink specification states Get Order is unavailable there. After live API access is formally approved, configure QIKINK_ADMIN_API_TOKEN and call GET /api/qikink/orders with Authorization: Bearer <token>.
4. After checkout UI is completed, test both online and COD orders with sandbox credentials and public design/mockup URLs.
5. Confirm the Qikink order exists in the sandbox dashboard and that failed submissions are reviewed before retrying.
6. Ask Qikink to approve live API access. Add the live secret, set QIKINK_SANDBOX_MODE=false, and only then set QIKINK_LIVE_ORDERS_ENABLED=true when ready to permit production submission.
7. Place a low-value controlled live test before opening the store to customers.

## API specification used

- Qikink API Orders (List), version 08-25, supplied for this integration.
- Qikink dashboard API docs: https://admins.qikink.com/api-docs
- Qikink help centre: https://qikink.com/help/

If Qikink changes the Custom API contract, prefer its latest official docs and update lib/qikink/client.ts accordingly.
