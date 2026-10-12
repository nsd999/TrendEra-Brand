create extension if not exists pgcrypto;
do $$ begin
  create type public.product_status as enum ('draft','published','archived');
exception when duplicate_object then null;
end $$;
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text not null default '',
  price numeric(12,2) not null check (price >= 0),
  compare_at_price numeric(12,2) check (compare_at_price is null or compare_at_price >= price),
  currency char(3) not null default 'INR',
  status public.product_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_status_idx on public.products(status);
alter table public.products enable row level security;
drop policy if exists "published products readable" on public.products;
create policy "published products readable" on public.products for select to anon, authenticated using (status = 'published');
-- Mutations must use authenticated, server-authorized admin workflows.
-- Never expose the Supabase service-role key in frontend code.
