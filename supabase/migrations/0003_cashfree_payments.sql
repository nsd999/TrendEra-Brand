-- Rename the gateway reference without dropping historical payment identifiers.
-- Existing Razorpay order IDs remain in the same column data for old orders; new code uses Cashfree only.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'store_orders' and column_name = 'razorpay_order_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'store_orders' and column_name = 'cashfree_order_id'
  ) then
    alter table public.store_orders rename column razorpay_order_id to cashfree_order_id;
  elsif not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'store_orders' and column_name = 'cashfree_order_id'
  ) then
    alter table public.store_orders add column cashfree_order_id text unique;
  end if;
end $$;

create unique index if not exists store_orders_cashfree_order_id_unique
  on public.store_orders(cashfree_order_id)
  where cashfree_order_id is not null;
