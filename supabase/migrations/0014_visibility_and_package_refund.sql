-- Stop seeding assignment rows for "visible to all" products.
-- Visibility for those products is controlled only by visible_to_all = true.
-- When visible_to_all = false, only explicit assignment rows apply (default: nobody).

create or replace function public.assign_product_to_all_distributors()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No longer auto-insert assignment rows. visible_to_all covers "everyone".
  return new;
end;
$$;

create or replace function public.assign_all_products_to_distributor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No longer auto-assign every product. visible_to_all covers "everyone".
  return new;
end;
$$;

-- Clear leftover assignment rows for catalog items that are visible to all
-- (those rows were created by the old triggers and confuse the limited-visibility UI).
delete from distributor_product_assignments dpa
using products p
where dpa.product_id = p.id
  and p.visible_to_all = true;

delete from distributor_package_assignments dpa
using inventory_packages ip
where dpa.package_id = ip.id
  and ip.visible_to_all = true;

-- Package order refund tracking
alter table package_orders
  add column if not exists refunded_at timestamptz,
  add column if not exists stripe_refund_id text,
  add column if not exists cancel_reason text;

comment on column package_orders.refunded_at is
  'When set, a Stripe refund was issued for this inventory package order.';
