# Qikink Open API: safe integration rollout

## What this change provides

- A server-only typed client for Qikink's documented `createOrder` endpoint.
- Validation for order number, payment gateway, item SKU, quantity, prices, designs, and shipping address.
- Unit tests and a CI test step.
- A server-only `QIKINK_AUTH_TOKEN` environment-variable placeholder.

This change deliberately does **not** add a public checkout/dispatch route, change the storefront pages, run database migrations, or send any real order to Qikink.

## Before enabling any order workflow

1. Sign in to the official Qikink dashboard and verify the currently supported Open API endpoint, credential/token format, sandbox support, and order response contract. The client currently follows the published `POST https://qikink.com/erp2/index.php/api/createOrder` documentation using `auth_token` in the JSON body. Do not assume that older API documentation matches every account's current API version.
2. Add `QIKINK_AUTH_TOKEN` to Vercel Preview only after receiving credentials. Never use a `NEXT_PUBLIC_` prefix or commit the value.
3. Reconcile the live Supabase schema with the checked-in migrations. The live project has `products`, `product_variants`, `store_orders`, and `store_order_items`; the checked-in initial migration does not currently create all of those tables. Do not blindly re-run the initial migration or create duplicate tables.
4. Implement customer authentication/session checks, admin authorization, server-side variant/SKU/price lookup, shipping and tax calculation, and transactional order creation.
5. Select and integrate the customer payment provider. The provider is not yet confirmed. Never trust a payment-success flag from the browser; verify payment server-side and through the provider's signed webhook.
6. Add durable idempotency and a reconciliation process before dispatch. A timeout does not prove Qikink failed to accept an order. Do not automatically retry ambiguous create-order requests.
7. Test the full flow in Qikink sandbox and a Vercel Preview. Only after a successful security review and sample orders should live fulfilment be enabled.

## Order gateway distinction

- `online`: use only after the customer payment has been verified successful by the payment provider.
- `cash_on_delivery`: use only if the store explicitly enables COD and has a validated COD workflow.

Qikink fulfilment charges are separate from the customer's payment to the store. Ensure the Qikink account has sufficient credits before accepting live orders.

## Local checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

The tests in `tests/qikink/validation.test.mjs` validate payload rules only. They do not prove that live Qikink credentials, account permissions, shipping settings, or production order submission work.
