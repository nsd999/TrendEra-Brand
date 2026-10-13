# Qikink Custom API setup for TrendEra

This integration targets the Qikink Custom API credentials shown in the Qikink dashboard. The credential exchange and /api/order/create request shape are based on a current third-party integration walkthrough; verify the exact endpoints and payload against your logged-in Qikink API documentation/support before production use. Qikink's public legacy docs also show a different auth_token / createOrder interface, so do not mix the two API styles.

## What is implemented on this branch

- Server-only Qikink token exchange using QIKINK_CLIENT_ID and the sandbox/live secret.
- One-hour token cache per warm server instance, with a refresh margin and one refresh on HTTP 401.
- Server-side checkout API that looks up product prices and Qikink SKUs from Supabase (never trusts prices from the browser).
- COD orders are submitted to Qikink after the customer confirms checkout.
- Online orders create a Razorpay order and are sent to Qikink only after a signed payment.captured webhook with a matching amount and currency.
- A database claim prevents concurrent webhook deliveries from submitting the same order twice.
- Qikink order IDs and safe error messages are saved to the private order table.
- GET /api/qikink/status reports configuration status without revealing credentials.

## Important current limitations

- Qikink product-catalogue import, live inventory sync and tracking sync are not implemented. The API documentation available to this implementation did not confirm supported catalogue/stock/tracking endpoints or webhook events. Check Qikink's current logged-in docs/support before promising real-time syncing.
- TrendEra still needs the customer-facing product listing, cart, Razorpay Checkout UI, order confirmation/tracking pages, secure admin product editor, rate limiting/abuse protection, and tests before accepting public orders. Keep NEXT_PUBLIC_STORE_MODE=coming-soon.
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
| NEXT_PUBLIC_SUPABASE_URL | Existing Supabase project URL. |
| SUPABASE_SERVICE_ROLE_KEY | Server-only Supabase service-role key. Never prefix it with NEXT_PUBLIC_. |
| RAZORPAY_KEY_ID | Razorpay key ID used to create online payment orders. |
| RAZORPAY_KEY_SECRET | Server-only Razorpay key secret. |
| RAZORPAY_WEBHOOK_SECRET | Server-only webhook secret configured in Razorpay. |
| NEXT_PUBLIC_SITE_URL | Exact production origin, e.g. https://trenderabrand.vercel.app. |

After adding or changing variables, redeploy the relevant Vercel environment.

## 2. Apply the database migration

Run supabase/migrations/0002_qikink_pod.sql after the existing 0001_initial_schema.sql in your Supabase SQL editor. Keep RLS enabled and do not add public policies for store_orders or store_order_items.

## 3. Create the designs and products

1. In Qikink, upload your print files/designs and prepare mockups.
2. For sandbox testing, copy the product/base SKU and use a public HTTPS design URL and mockup URL. Add one Supabase products row and a product_variants row per size/colour. Store the Qikink base SKU in qikink_sku, set design_code, design_link, mockup_link, width_inches, height_inches, and placement_sku (e.g. fr for front). Set the product status to draft until it has been checked.
3. For live fulfilment, create/publish each product in Qikink My Products, then map every size/colour to the exact Qikink SKU. Update the TrendEra variant's qikink_sku to that SKU. Publish the TrendEra product only after the variant mapping and price are reviewed.
4. Do not use live Qikink products as a guarantee of sandbox SKU availability: sandbox and live product catalogues are separate.

There is no public admin UI/importer yet, so this initial catalogue mapping is a controlled database task. Do not make variants active until their SKU and design mapping have been verified.

## 4. Configure Razorpay webhook

In Razorpay Dashboard → Webhooks, add:

https://trenderabrand.vercel.app/api/webhooks/razorpay

Subscribe to payment.captured and use the exact secret stored in RAZORPAY_WEBHOOK_SECRET. The webhook verifies the HMAC signature and amount/currency before marking the order paid and submitting it to Qikink.

## 5. Test before launch

1. Keep sandbox mode enabled and live orders disabled.
2. Check https://trenderabrand.vercel.app/api/qikink/status for configuration only; this endpoint does not call Qikink or expose secrets.
3. After checkout UI is completed, test both online and COD orders with sandbox credentials and public design/mockup URLs.
4. Confirm the Qikink order exists in the sandbox dashboard and that failed submissions are reviewed before retrying.
5. Ask Qikink to approve live API access. Add the live secret, set QIKINK_SANDBOX_MODE=false, and only then set QIKINK_LIVE_ORDERS_ENABLED=true.
6. Place a low-value controlled live test before opening the store to customers.

## API references

- Qikink dashboard API docs: https://admins.qikink.com/api-docs
- Qikink help centre: https://qikink.com/help/
- Third-party implementation reference for the Custom API token/order endpoints: https://anupamkushwaha.me/blog/integrating-qikink-pod-api-with-nodejs

If Qikink provides updated official endpoint details, prefer those over any third-party example and update lib/qikink/client.ts accordingly.
