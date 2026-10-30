-- TrendEra x Qikink Direct Integration Schema Enhancements
-- Safe, non-destructive migration preserving all existing tables and data.

-- 1. Extend store_orders with Qikink live tracking and status columns
alter table public.store_orders add column if not exists qikink_status text;
alter table public.store_orders add column if not exists qikink_awb text;
alter table public.store_orders add column if not exists qikink_courier text;
alter table public.store_orders add column if not exists qikink_tracking_url text;
alter table public.store_orders add column if not exists qikink_synced_at timestamptz;

create index if not exists store_orders_qikink_order_id_idx on public.store_orders(qikink_order_id) where qikink_order_id is not null;
create index if not exists store_orders_qikink_status_idx2 on public.store_orders(qikink_status) where qikink_status is not null;

-- 2. Extend products table with Qikink external identifier, category and image URL
alter table public.products add column if not exists qikink_product_id text;
alter table public.products add column if not exists category text;
alter table public.products add column if not exists image_url text;

create index if not exists products_qikink_product_id_idx on public.products(qikink_product_id) where qikink_product_id is not null;
create index if not exists products_category_idx on public.products(category) where category is not null;

-- 3. Extend product_variants with fulfillment cost price for margin calculation and price protection
alter table public.product_variants add column if not exists cost_price numeric(12,2) check (cost_price is null or cost_price >= 0);

-- 4. Create synchronization log table for auditability and synchronization history
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

-- 5. Enable RLS on qikink_sync_logs (server-authorized service role only)
alter table public.qikink_sync_logs enable row level security;
