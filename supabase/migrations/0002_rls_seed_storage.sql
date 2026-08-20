-- RLS policies, storage buckets, seed packages, inventory credit on payment.

-- ---------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'distributor-documents',
  'distributor-documents',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Seed inventory packages (from Purely Eve Partner Packages doc)
-- ---------------------------------------------------------------------

insert into inventory_packages (sku, name, description, unit_count, price_cents, weight_oz, sort_order)
values
  (
    'PE-PKG-START',
    'Partner Starter Package',
    'Purely Eve Partner starter inventory package contains 20 individually boxed Eve Origin Serums, 30 mL / 1 oz each.',
    20,
    56000,
    80,
    1
  ),
  (
    'PE-PKG-GROWTH',
    'Partner Growth Package',
    'Purely Eve Partner growth inventory package contains 40 individually boxed Eve Origin Serums, 30 mL / 1 oz each.',
    40,
    112000,
    160,
    2
  )
on conflict (sku) do update set
  name = excluded.name,
  description = excluded.description,
  unit_count = excluded.unit_count,
  price_cents = excluded.price_cents,
  weight_oz = excluded.weight_oz,
  sort_order = excluded.sort_order;

-- Consumer serum SKU used when crediting inventory from package purchases.
-- Per-unit weight ~4 oz (0.25 lb) reserved for Milestone 2 invoicing.

-- ---------------------------------------------------------------------
-- Helper: is the current user an admin?
-- ---------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------
-- Helper: distributor id for current user
-- ---------------------------------------------------------------------

create or replace function public.my_distributor_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from distributors where profile_id = auth.uid() limit 1;
$$;

-- ---------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------

alter table profiles enable row level security;
alter table distributors enable row level security;
alter table distributor_documents enable row level security;
alter table agreement_acceptances enable row level security;
alter table inventory_packages enable row level security;
alter table package_orders enable row level security;
alter table distributor_inventory enable row level security;
alter table inventory_movements enable row level security;
alter table audit_log enable row level security;

-- profiles
create policy profiles_select_own on profiles for select
  using (id = auth.uid() or is_admin());
create policy profiles_update_own on profiles for update
  using (id = auth.uid() or is_admin());

-- distributors
create policy distributors_select on distributors for select
  using (profile_id = auth.uid() or is_admin());
create policy distributors_insert on distributors for insert
  with check (profile_id = auth.uid());
create policy distributors_update on distributors for update
  using (profile_id = auth.uid() or is_admin());

-- documents
create policy documents_select on distributor_documents for select
  using (
    distributor_id = my_distributor_id() or is_admin()
  );
create policy documents_insert on distributor_documents for insert
  with check (distributor_id = my_distributor_id());
create policy documents_update on distributor_documents for update
  using (is_admin());

-- agreement acceptances
create policy agreement_select on agreement_acceptances for select
  using (distributor_id = my_distributor_id() or is_admin());
create policy agreement_insert on agreement_acceptances for insert
  with check (distributor_id = my_distributor_id());

-- packages (read-only for distributors)
create policy packages_select on inventory_packages for select
  using (is_active = true or is_admin());
create policy packages_admin on inventory_packages for all
  using (is_admin());

-- package orders
create policy package_orders_select on package_orders for select
  using (distributor_id = my_distributor_id() or is_admin());
create policy package_orders_insert on package_orders for insert
  with check (distributor_id = my_distributor_id());
create policy package_orders_update on package_orders for update
  using (distributor_id = my_distributor_id() or is_admin());

-- inventory
create policy inventory_select on distributor_inventory for select
  using (distributor_id = my_distributor_id() or is_admin());
create policy inventory_admin on distributor_inventory for all
  using (is_admin());

create policy movements_select on inventory_movements for select
  using (distributor_id = my_distributor_id() or is_admin());
create policy movements_admin on inventory_movements for all
  using (is_admin());

-- audit log (admin only)
create policy audit_admin on audit_log for all
  using (is_admin());

-- Storage policies
create policy storage_docs_select on storage.objects for select
  using (
    bucket_id = 'distributor-documents'
    and (
      is_admin()
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );

create policy storage_docs_insert on storage.objects for insert
  with check (
    bucket_id = 'distributor-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------
-- Credit inventory when a package order is paid
-- ---------------------------------------------------------------------

create or replace function public.credit_inventory_on_package_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  units integer;
  serum_sku text := 'PE-SERUM-30';
begin
  if new.status = 'paid' and (old.status is distinct from 'paid') then
    units := new.unit_count_snapshot * new.quantity;

    insert into distributor_inventory (distributor_id, sku, quantity_on_hand)
    values (new.distributor_id, serum_sku, units)
    on conflict (distributor_id, sku) do update
      set quantity_on_hand = distributor_inventory.quantity_on_hand + excluded.quantity_on_hand,
          updated_at = now();

    insert into inventory_movements (distributor_id, sku, delta, reason, reference_id)
    values (new.distributor_id, serum_sku, units, 'package_purchase', new.id);

    -- Intro promo window starts on first inventory order (client chat default).
    update distributors
    set
      intro_started_at = coalesce(intro_started_at, new.paid_at),
      intro_expires_at = coalesce(intro_expires_at, new.paid_at + interval '30 days')
    where id = new.distributor_id and intro_started_at is null;

    -- Mark resale accepted timestamp when admin accepted doc (already set separately)
  end if;
  return new;
end;
$$;

create trigger package_order_paid_inventory
  after update of status on package_orders
  for each row execute function credit_inventory_on_package_paid();
