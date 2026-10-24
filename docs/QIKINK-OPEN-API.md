# TrenderaBrand payment and fulfilment rollout

## Cashfree sandbox foundation

- `lib/cashfree/client.ts` is server-only and defaults to Cashfree sandbox mode.
- Uses Cashfree's Create Order API at `https://sandbox.cashfree.com/pg/orders` with API version `2025-01-01`; production endpoint is only selected by explicitly setting `CASHFREE_ENV=production`.
- Includes input validation, server-side order-status fetch, bounded request timeouts, and constant-time webhook signature comparison over the exact raw body.
- Configure `CASHFREE_APP_ID` and `CASHFREE_SECRET_KEY` as server-side environment variables only. Never add a `NEXT_PUBLIC_` prefix or commit values. Do not reuse keys displayed in screenshots or chat; rotate exposed keys.
- The client is a foundation only. It does not itself persist orders, verify that an internal cart amount is correct, or dispatch to Qikink.

## Required before checkout can be enabled

1. Rotate/regenerate any API credential exposed in screenshots, chats, logs, or other public locations. Use the replacement only in local environment/Vercel environment settings.
2. Confirm test credentials in Cashfree sandbox and configure `CASHFREE_ENV=sandbox` for Preview. Do not configure production keys yet.
3. Reconcile the actual Supabase schema before writing order mutations. The live project has `products`, `product_variants`, `store_orders`, and `store_order_items`; checked-in initial migrations do not represent every live commerce table. Do not blindly rerun migrations or create duplicate tables.
4. Build a server-side checkout route that reads product/variant prices and Qikink SKU from the database, calculates the total on the server, validates stock/variant availability, and creates a durable pending order before requesting a Cashfree payment session.
5. Add the Cashfree hosted checkout UI. The browser may receive a payment session ID, never the API secret. A browser redirect or client callback is not proof of payment.
6. Verify payment server-side by fetching Cashfree order/payment status and process signed webhooks using the exact raw request body plus `x-webhook-timestamp` and `x-webhook-signature`. Apply durable idempotency so a webhook/retry cannot fulfil twice.
7. Dispatch to Qikink only after verified successful payment and a durable state transition. Store Qikink order IDs, handle ambiguous timeouts by reconciliation, and never blindly retry an order submission.
8. Test sandbox success, failure, abandoned checkout, duplicate webhook, invalid signature, amount mismatch, retry, and Qikink timeout. Only enable live mode after merchant KYC approval, live credential setup, and explicit production review.

## Official references

- Cashfree hosted checkout / Create Order: https://www.cashfree.com/devstudio/preview/pg/web/checkout
- Cashfree webhook signature verification: https://www.cashfree.com/devstudio/preview/pg/tools/webhookVerification
- Cashfree Node SDK and API reference: https://github.com/cashfree/cashfree-pg-sdk-nodejs

## Qikink

The existing Qikink client remains server-only. Verify the current API contract and account permissions before live order submission. Qikink fulfilment charges are separate from the customer's Cashfree payment; ensure the Qikink account has sufficient credits.

## Status

This branch intentionally does not expose public checkout or submit live payment/fulfilment requests yet. The next implementation stage requires a reviewed schema and the checkout UI/route/webhook state machine. Existing production pages and database have not been modified by this foundation.
