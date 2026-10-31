-- TrendEra x Qikink Consolidated Migration & RLS Repair
-- Idempotent, safe, and non-destructive.
-- Run this in your Supabase SQL Editor if tables/columns or RLS policies are pending.

-- 1. Enable pgcrypto extension
create extension if not exists pgcrypto;

-- 2. Create product_status enum if not existing
do $$ begin
  create type public.product_status as enum ('draft', 'published', 'archived');
exception when duplicate_object then null;
end $$;

-- 3. Products table and columns
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

alter table public.products add column if not exists qikink_product_id text;
alter table public.products add column if not exists category text;
alter table public.products add column if not exists image_url text;

create index if not exists products_status_idx on public.products(status);
create index if not exists products_qikink_product_id_idx on public.products(qikink_product_id) where qikink_product_id is not null;
create index if not exists products_category_idx on public.products(category) where category is not null;

-- 4. Product Variants table and columns
create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  label text not null,
  size text,
  colour text,
  sku text not null unique,
  qikink_sku text not null,
  price numeric(12,2) not null check (price >= 0),
  compare_at_price numeric(12,2) check (compare_at_price is null or compare_at_price >= price),
  stock_quantity integer check (stock_quantity is null or stock_quantity >= 0),
  is_active boolean not null default false,
  design_code text,
  design_link text,
  mockup_link text,
  width_inches numeric(6,2),
  height_inches numeric(6,2),
  placement_sku text,
  print_type_id integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.product_variants add column if not exists cost_price numeric(12,2) check (cost_price is null or cost_price >= 0);
alter table public.product_variants add column if not exists width_inches numeric(6,2);
alter table public.product_variants add column if not exists height_inches numeric(6,2);

create index if not exists product_variants_product_idx on public.product_variants(product_id);
create index if not exists product_variants_active_idx on public.product_variants(is_active);
create index if not exists product_variants_qikink_sku_idx on public.product_variants(qikink_sku);

-- 5. Store Orders table and columns
create table if not exists public.store_orders (
  id uuid primary key default gen_random_uuid(),
  order_number varchar(15) not null unique check (order_number ~ '^[A-Za-z0-9]{1,15}$'),
  status text not null default 'pending' check (status in ('pending','confirmed','cancelled','fulfilled')),
  payment_method text not null check (payment_method in ('online','cod')),
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','cod_due','failed','refunded')),
  total_amount numeric(12,2) not null check (total_amount >= 0),
  currency char(3) not null default 'INR',
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  shipping_address jsonb not null,
  cashfree_order_id text unique,
  qikink_order_id text unique,
  qikink_submission_status text not null default 'pending'
    check (qikink_submission_status in ('pending','processing','submitted','failed','not_required')),
  qikink_last_error text,
  qikink_status text,
  qikink_awb text,
  qikink_courier text,
  qikink_tracking_url text,
  qikink_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists store_orders_status_idx on public.store_orders(status, created_at desc);
create index if not exists store_orders_qikink_status_idx on public.store_orders(qikink_submission_status);
create index if not exists store_orders_qikink_order_id_idx on public.store_orders(qikink_order_id) where qikink_order_id is not null;
create index if not exists store_orders_cashfree_order_id_idx on public.store_orders(cashfree_order_id) where cashfree_order_id is not null;

-- 6. Store Order Items table
create table if not exists public.store_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.store_orders(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete set null,
  product_name text not null,
  variant_label text not null,
  qikink_sku text not null,
  quantity integer not null check (quantity > 0 and quantity <= 20),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  design_code text,
  design_link text,
  mockup_link text,
  width_inches numeric(6,2),
  height_inches numeric(6,2),
  placement_sku text,
  print_type_id integer not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists store_order_items_order_idx on public.store_order_items(order_id);

-- 7. Qikink Sync Logs audit table
create table if not exists public.qikink_sync_logs (
  id uuid primary key default gen_random_uuid(),
  sync_type text not null check (sync_type in ('products', 'variants', 'categories', 'images', 'orders', 'tracking')),
  status text not null check (status in ('success', 'failed', 'partial')),
  items_count integer not null default 0,
  details jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists qikink_sync_logs_type_created_idx on public.qikink_sync_logs(sync_type, created_at desc);

-- 8. Row Level Security & Public Storefront Read Policies
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.store_orders enable row level security;
alter table public.store_order_items enable row level security;
alter table public.qikink_sync_logs enable row level security;

-- Public can read published products
drop policy if exists "published products readable" on public.products;
create policy "published products readable" on public.products
  for select to anon, authenticated
  using (status = 'published');

-- Public can read active variants of published products (CRITICAL FOR /shop)
drop policy if exists "active variants of published products readable" on public.product_variants;
create policy "active variants of published products readable" on public.product_variants
  for select to anon, authenticated
  using (
    is_active = true and
    exists (
      select 1 from public.products
      where products.id = product_variants.product_id
        and products.status = 'published'
    )
  );

-- All mutations and order records remain strictly service-role authorized (server only).

