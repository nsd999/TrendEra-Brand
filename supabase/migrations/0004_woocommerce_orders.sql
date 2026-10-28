-- Add woocommerce_order_id to store_orders for bidirectional reconciliation
-- Safe and non-destructive: only adds column if it does not already exist.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'store_orders' and column_name = 'woocommerce_order_id'
  ) then
    alter table public.store_orders add column woocommerce_order_id text;
  end if;
end $$;

create index if not exists store_orders_woocommerce_order_id_idx
  on public.store_orders(woocommerce_order_id)
  where woocommerce_order_id is not null;
