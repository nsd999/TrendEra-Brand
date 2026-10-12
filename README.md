# TrendEra Storefront

Independent, GitHub-first Next.js storefront foundation for TrendEra Brand. This repository is not tied to Lovable or Shoopy. It uses Next.js App Router, TypeScript, and optional Supabase services.

## Status

This is a source-code starter with a responsive launch-mode storefront, contact form endpoint, Supabase client setup, database migration foundation, and documented integration boundaries. It is not yet a production-ready commerce system: payment processing, authenticated customer workflows, complete admin CRUD, inventory reservation, and end-to-end tests must be implemented and verified before accepting real orders. No payment is simulated.

## Run locally

Requirements: Node.js 20.9+, npm, and Git.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open http://localhost:3000. See `.env.example` and the full setup steps in this README.

## Brand assets

Place the supplied full logo at `public/brand/trendera-logo.png` and monogram at `public/brand/trendera-mark.jpg`. The header falls back to a text wordmark if the logo is missing.

## Supabase

Create a Supabase project, configure the environment variables, and run `supabase/migrations/0001_initial_schema.sql`. Review RLS before production use. This project does not create a public admin account or hardcode credentials.

## Checks

```bash
npm run typecheck
npm run lint
npm run build
```

## GitHub / Vercel

This project is intended to live in `https://github.com/nsd999/TrendEra-Brand`. Import that repository into Vercel after configuring environment variables. Never commit `.env.local`.

## Required before taking real orders

Implement and verify auth/session refresh, customer ownership policies, audited admin access, transactional order creation and stock reservation, payment order creation and signature/webhook verification, email delivery and abuse controls, cart/variant/coupon/shipping/tax validation, and automated tests. Do not trust client-supplied prices, roles, discounts, or payment success redirects. RLS does not replace server-side authorization.