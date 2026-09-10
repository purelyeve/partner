-- Per-partner visibility: "all Partners" vs "selected Partners" for products and packages.

alter table products
  add column if not exists visible_to_all boolean not null default true;

alter table inventory_packages
  add column if not exists visible_to_all boolean not null default true;

comment on column products.visible_to_all is
  'When true, every Partner can see the product (if active). When false, only rows in distributor_product_assignments apply.';

comment on column inventory_packages.visible_to_all is
  'When true, every Partner can see the package (if active). When false, only rows in distributor_package_assignments apply.';

create table if not exists distributor_package_assignments (
  id              uuid primary key default gen_random_uuid(),
  distributor_id  uuid not null references distributors (id) on delete cascade,
  package_id      uuid not null references inventory_packages (id) on delete cascade,
  created_at      timestamptz not null default now(),
  unique (distributor_id, package_id)
);

create index if not exists distributor_package_assignments_distributor_idx
  on distributor_package_assignments (distributor_id);

alter table distributor_package_assignments enable row level security;

create policy package_assignments_select on distributor_package_assignments for select
  using (public.is_admin() or distributor_id = public.my_distributor_id());

create policy package_assignments_admin on distributor_package_assignments for all
  using (public.is_admin());

-- Only auto-assign on create when the product is "visible to all".
create or replace function public.assign_product_to_all_distributors()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_active and new.visible_to_all then
    insert into distributor_product_assignments (distributor_id, product_id)
    select d.id, new.id from distributors d
    on conflict do nothing;
  end if;
  return new;
end;
$$;

-- New distributors only get products marked visible to all.
create or replace function public.assign_all_products_to_distributor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into distributor_product_assignments (distributor_id, product_id)
  select new.id, p.id
  from products p
  where p.is_active = true and p.visible_to_all = true
  on conflict do nothing;
  return new;
end;
$$;
