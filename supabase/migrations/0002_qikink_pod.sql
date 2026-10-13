-- TrendEra POD catalogue and fulfilment records.
-- Product and order tables are private by default; use server-authorized admin/checkout code only.
create extension if not exists pgcrypto;

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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists product_variants_product_idx on public.product_variants(product_id);
create index if not exists product_variants_active_idx on public.product_variants(is_active);

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
  razorpay_order_id text unique,
  qikink_order_id text unique,
  qikink_submission_status text not null default 'pending'
    check (qikink_submission_status in ('pending','processing','submitted','failed','not_required')),
  qikink_last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists store_orders_status_idx on public.store_orders(status, created_at desc);
create index if not exists store_orders_qikink_status_idx on public.store_orders(qikink_submission_status);

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
  created_at timestamptz not null default now()
);
create index if not exists store_order_items_order_idx on public.store_order_items(order_id);

alter table public.product_variants enable row level security;
alter table public.store_orders enable row level security;
alter table public.store_order_items enable row level security;
-- Intentionally no anon/authenticated policies on fulfilment records.
-- Use a server-only Supabase service role key after validating the caller and payment.
