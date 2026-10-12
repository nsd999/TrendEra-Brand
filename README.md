# TrendEra Storefront

A GitHub-first Next.js storefront foundation for TrendEra Brand. Built with Next.js App Router, TypeScript, responsive CSS, an optional Supabase database foundation, and Vercel deployment configuration.

## Run locally

Requirements: Node.js 20.9+ and npm.

1. Copy `.env.example` to `.env.local` and fill in the values you have.
2. Run `npm install`.
3. Run `npm run dev` and open http://localhost:3000.

The site defaults to `NEXT_PUBLIC_STORE_MODE=coming-soon`. Set it to `live` to show the shop shell; it will not invent product listings or stock. Until the catalogue and checkout are implemented, do not accept live orders.

## Vercel deployment

1. Open Vercel and choose **Add New → Project**.
2. Import `nsd999/TrendEra-Brand` from GitHub.
3. Keep Framework Preset as **Next.js** and Root Directory as `./`.
4. Use Build Command `npm run build` and Install Command `npm install`. These are also recorded in `vercel.json`.
5. Add required variables from `.env.example` in Project Settings → Environment Variables. Add public values to Preview and Production as appropriate. Add `RESEND_API_KEY`, `CONTACT_TO_EMAIL` and `CONTACT_FROM_EMAIL` only as server-side variables.
6. Deploy a Preview first; test mobile navigation and the contact flow. Then assign the production domain and set `NEXT_PUBLIC_SITE_URL` to its absolute HTTPS origin.

Vercel detects Next.js automatically; no custom server or output directory is required.

## Environment variables

- `NEXT_PUBLIC_SITE_URL`: public canonical site origin.
- `NEXT_PUBLIC_STORE_MODE`: `coming-soon` or `live`.
- `NEXT_PUBLIC_WHATSAPP_NUMBER`: WhatsApp number in international digits, without `+`.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: optional browser-safe Supabase configuration.
- `RESEND_API_KEY` and `CONTACT_TO_EMAIL` / `CONTACT_FROM_EMAIL`: server-side email delivery for the contact form. Without these, the API returns a configuration error instead of pretending to send a message.

Never put service-role or payment secrets under a `NEXT_PUBLIC_` variable. Never commit `.env.local`.

## Brand logo assets

The supplied logo files were not included in this repository upload, so the header currently uses a typographic wordmark. Add the full logo at `public/brand/trendera-logo.png` and update `components/site-header.tsx` to use it. Add favicon derivatives only after verifying the source logo proportions.

## Checks

Run `npm run typecheck`, `npm run lint`, and `npm run build`. GitHub Actions runs these checks on pushes and pull requests to `main`.

## Current scope and production blockers

This is a deployment-ready starter, not a complete commerce implementation. The shop intentionally displays no fictional products. Before taking real orders, implement and security-test sign-in/session refresh, customer profile/address/order ownership, admin authorization and audit logs, product/variant CRUD, a persistent cart, server-calculated prices and shipping/tax, transactional stock reservation, Razorpay order creation/signature verification/webhook idempotency/refunds, and automated tests. Apply and review the Supabase migration and all RLS policies before storing customer data.

Contact form delivery uses Resend from a server-only route. Configure the sender domain with Resend before production. The endpoint validates inputs and includes a honeypot, but before public launch add robust rate limiting (for example, a hosted rate-limit service) and abuse monitoring; serverless in-memory rate limiting would not be sufficient.
