# TrendEra Storefront

Next.js App Router storefront foundation for TrendEra Brand, with Vercel deployment configuration and a Qikink Custom API integration foundation.

## Current state

The website intentionally defaults to NEXT_PUBLIC_STORE_MODE=coming-soon. The product catalogue, customer-facing cart/checkout UI, order tracking pages and secure admin catalogue editor are not complete. Do not enable public orders or switch the storefront live yet.

## Run locally

Requirements: Node.js 20.9+ and npm.

1. Copy .env.example to .env.local and fill in local values.
2. Run npm install.
3. Run npm run dev and open http://localhost:3000.

## Vercel deployment

1. Import nsd999/TrendEra-Brand into Vercel, using the Next.js preset and root directory ./.
2. Set NEXT_PUBLIC_SITE_URL=https://trenderabrand.store in the Production Vercel environment. Keep preview URLs in Preview environments as needed.
3. Keep NEXT_PUBLIC_STORE_MODE=coming-soon while the store is being completed.
4. Add server-only credentials through Vercel Environment Variables. Never commit .env.local or expose server secrets with a NEXT_PUBLIC_ prefix.
5. Run a Preview deployment and review the build logs before production.

## Environment variables

See .env.example for the full list. Qikink and Razorpay credentials must be configured only in server-side environment variables. The Supabase service-role key must never be exposed to the browser.

## Qikink integration

See docs/qikink-setup.md for database setup, sandbox/live configuration, SKU mapping, payment webhook configuration and launch blockers.

Implemented on the Qikink feature branch:
- Server-side Qikink Custom API authentication and order submission.
- Supabase schema for variants, order snapshots and fulfilment status.
- Checkout API foundation for online payments (Razorpay order creation) and COD.
- Signed Razorpay payment.captured webhook that validates amount/currency before Qikink submission.
- A non-secret Qikink capability status endpoint.
- An admin-token-protected Qikink Order List API proxy for approved live credentials; sandbox lookup is disabled per the supplied API docs.

Not yet implemented:
- Qikink catalogue import, live inventory sync or tracking sync; endpoint/webhook support needs confirmation with Qikink.
- Customer-facing product/variant listing, cart, Razorpay Checkout UI, account/order pages and secure admin tools.
- Production rate limiting, inventory reservation, order cancellation/refund flows, monitoring and end-to-end tests.

## Brand assets

Brand image assets are stored under public/brand/ and public/; see those folders for available files.

## Checks

Run npm run typecheck, npm run lint and npm run build. GitHub Actions is configured to run checks on pushes and pull requests to main.
