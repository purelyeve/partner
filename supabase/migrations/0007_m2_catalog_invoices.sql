-- Milestone 2: consumer catalog, SKU assignments, customers, invoices.
-- Locked: PE-SERUM-1, 6.8 oz, $84 retail / $42 wholesale, 30-day invoice expiry,
-- low stock at 10, discount % or $, free shipping option, resale cert once per customer.

-- ---------------------------------------------------------------------
-- products (admin-managed consumer SKUs)
-- ---------------------------------------------------------------------

create table products (
  id                 uuid primary key default gen_random_uuid(),
  sku                text not null unique,
  name               text not null,
  description        text not null default '',
  retail_cents       integer not null check (retail_cents >= 0),
  wholesale_cents    integer not null check (wholesale_cents >= 0),
  weight_oz          numeric(8,2) not null check (weight_oz > 0),
  image_path         text not null default '',
  is_active          boolean not null default true,
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger products_set_updated_at
  before update on products
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- distributor_product_assignments (default: all products for all partners)
-- ---------------------------------------------------------------------

create table distributor_product_assignments (
  id              uuid primary key default gen_random_uuid(),
  distributor_id  uuid not null references distributors (id) on delete cascade,
  product_id      uuid not null references products (id) on delete cascade,
  created_at      timestamptz not null default now(),
  unique (distributor_id, product_id)
);

create index distributor_product_assignments_distributor_idx
  on distributor_product_assignments (distributor_id);

-- ---------------------------------------------------------------------
-- customers (per distributor)
-- ---------------------------------------------------------------------

create table customers (
  id                    uuid primary key default gen_random_uuid(),
  distributor_id        uuid not null references distributors (id) on delete cascade,
  full_name             text not null,
  email                 text not null,
  phone                 text not null default '',
  billing_line1         text not null default '',
  billing_line2         text not null default '',
  billing_city          text not null default '',
  billing_state         text not null default '',
  billing_postal_code   text not null default '',
  billing_country       text not null default 'US',
  shipping_same_as_billing boolean not null default true,
  shipping_line1        text not null default '',
  shipping_line2        text not null default '',
  shipping_city         text not null default '',
  shipping_state        text not null default '',
  shipping_postal_code  text not null default '',
  shipping_country      text not null default 'US',
  resale_certificate_number text not null default '',
  resale_document_path  text not null default '',
  resale_document_name  text not null default '',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index customers_distributor_idx on customers (distributor_id, created_at desc);
create index customers_distributor_email_idx on customers (distributor_id, email);

create trigger customers_set_updated_at
  before update on customers
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- invoices
-- ---------------------------------------------------------------------

create type invoice_customer_type as enum ('direct_to_customer', 'retail_wholesale');
create type invoice_status as enum ('draft', 'sent', 'paid', 'expired', 'cancelled');
create type invoice_discount_type as enum ('none', 'percent', 'amount');

create table invoices (
  id                       uuid primary key default gen_random_uuid(),
  invoice_number           text not null unique,
  distributor_id           uuid not null references distributors (id) on delete restrict,
  customer_id              uuid not null references customers (id) on delete restrict,
  customer_type            invoice_customer_type not null,
  status                   invoice_status not null default 'draft',
  public_token             text not null unique default encode(gen_random_bytes(24), 'hex'),

  customer_name_snapshot   text not null default '',
  customer_email_snapshot  text not null default '',
  customer_phone_snapshot  text not null default '',
  ship_to_line1            text not null default '',
  ship_to_line2            text not null default '',
  ship_to_city             text not null default '',
  ship_to_state            text not null default '',
  ship_to_postal_code      text not null default '',
  ship_to_country          text not null default 'US',
  bill_to_line1            text not null default '',
  bill_to_line2            text not null default '',
  bill_to_city             text not null default '',
  bill_to_state            text not null default '',
  bill_to_postal_code      text not null default '',
  bill_to_country          text not null default 'US',
  resale_certificate_number text not null default '',

  discount_type            invoice_discount_type not null default 'none',
  discount_value           numeric(10,2) not null default 0,
  discount_cents           integer not null default 0,
  subtotal_cents           integer not null default 0,
  shipping_cents           integer not null default 0,
  tax_cents                integer not null default 0,
  total_cents              integer not null default 0,
  free_shipping            boolean not null default false,
  shipping_carrier         text not null default '',
  shipping_service         text not null default '',
  easypost_shipment_id     text not null default '',
  easypost_rate_id         text not null default '',

  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  paid_at                  timestamptz,
  sent_at                  timestamptz,
  expires_at               timestamptz,
  tracking_code            text not null default '',
  fulfilled_at             timestamptz,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index invoices_distributor_idx on invoices (distributor_id, created_at desc);
create index invoices_status_idx on invoices (status);
create index invoices_customer_idx on invoices (customer_id);

create trigger invoices_set_updated_at
  before update on invoices
  for each row execute function set_updated_at();

create table invoice_line_items (
  id              uuid primary key default gen_random_uuid(),
  invoice_id      uuid not null references invoices (id) on delete cascade,
  product_id      uuid references products (id) on delete set null,
  sku_snapshot    text not null,
  name_snapshot   text not null,
  unit_price_cents integer not null,
  quantity        integer not null check (quantity > 0),
  line_total_cents integer not null,
  sort_order      integer not null default 0
);

create index invoice_line_items_invoice_idx on invoice_line_items (invoice_id);

-- ---------------------------------------------------------------------
-- Seed Eve Origin Serum + migrate inventory SKU
-- ---------------------------------------------------------------------

insert into products (sku, name, description, retail_cents, wholesale_cents, weight_oz, image_path, sort_order)
values (
  'PE-SERUM-1',
  'Eve Origin Serum, 30 mL / 1 oz',
  'Purely Eve Eve Origin Serum, 30 mL / 1 oz. Luxury botanical skincare for resale.',
  8400,
  4200,
  6.8,
  '/brand/serum-temp.png',
  1
)
on conflict (sku) do update set
  name = excluded.name,
  description = excluded.description,
  retail_cents = excluded.retail_cents,
  wholesale_cents = excluded.wholesale_cents,
  weight_oz = excluded.weight_oz,
  image_path = excluded.image_path,
  is_active = true;

-- Move any existing package-credited stock to the new SKU
update distributor_inventory
set sku = 'PE-SERUM-1', updated_at = now()
where sku = 'PE-SERUM-30';

update inventory_movements
set sku = 'PE-SERUM-1'
where sku = 'PE-SERUM-30';

alter table distributor_inventory
  alter column low_stock_threshold set default 10;

update distributor_inventory
set low_stock_threshold = 10
where low_stock_threshold = 5;

-- Assign all active products to every distributor
insert into distributor_product_assignments (distributor_id, product_id)
select d.id, p.id
from distributors d
cross join products p
where p.is_active = true
on conflict do nothing;

-- Package paid → credit PE-SERUM-1
create or replace function public.credit_inventory_on_package_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  units integer;
  serum_sku text := 'PE-SERUM-1';
begin
  if new.status = 'paid' and (old.status is distinct from 'paid') then
    units := new.unit_count_snapshot * new.quantity;

    insert into distributor_inventory (distributor_id, sku, quantity_on_hand, low_stock_threshold)
    values (new.distributor_id, serum_sku, units, 10)
    on conflict (distributor_id, sku) do update
      set quantity_on_hand = distributor_inventory.quantity_on_hand + excluded.quantity_on_hand,
          updated_at = now();

    insert into inventory_movements (distributor_id, sku, delta, reason, reference_id)
    values (new.distributor_id, serum_sku, units, 'package_purchase', new.id);

    update distributors
    set
      intro_started_at = coalesce(intro_started_at, new.paid_at),
      intro_expires_at = coalesce(intro_expires_at, new.paid_at + interval '30 days')
    where id = new.distributor_id and intro_started_at is null;
  end if;
  return new;
end;
$$;

-- When a new product is created, assign it to all distributors
create or replace function public.assign_product_to_all_distributors()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_active then
    insert into distributor_product_assignments (distributor_id, product_id)
    select d.id, new.id from distributors d
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger product_assign_all_distributors
  after insert on products
  for each row execute function assign_product_to_all_distributors();

-- When a distributor is created, assign all active products
create or replace function public.assign_all_products_to_distributor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into distributor_product_assignments (distributor_id, product_id)
  select new.id, p.id from products p where p.is_active = true
  on conflict do nothing;
  return new;
end;
$$;

create trigger distributor_assign_all_products
  after insert on distributors
  for each row execute function assign_all_products_to_distributor();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------

alter table products enable row level security;
alter table distributor_product_assignments enable row level security;
alter table customers enable row level security;
alter table invoices enable row level security;
alter table invoice_line_items enable row level security;

create policy products_select on products for select
  using (true);
create policy products_admin on products for all
  using (public.is_admin()) with check (public.is_admin());

create policy assignments_select on distributor_product_assignments for select
  using (public.is_admin() or distributor_id = public.my_distributor_id());
create policy assignments_admin on distributor_product_assignments for all
  using (public.is_admin()) with check (public.is_admin());

create policy customers_select on customers for select
  using (public.is_admin() or distributor_id = public.my_distributor_id());
create policy customers_insert on customers for insert
  with check (distributor_id = public.my_distributor_id() or public.is_admin());
create policy customers_update on customers for update
  using (distributor_id = public.my_distributor_id() or public.is_admin());
create policy customers_delete on customers for delete
  using (distributor_id = public.my_distributor_id() or public.is_admin());

create policy invoices_select on invoices for select
  using (public.is_admin() or distributor_id = public.my_distributor_id());
create policy invoices_insert on invoices for insert
  with check (distributor_id = public.my_distributor_id() or public.is_admin());
create policy invoices_update on invoices for update
  using (distributor_id = public.my_distributor_id() or public.is_admin());

create policy invoice_items_select on invoice_line_items for select
  using (
    public.is_admin()
    or exists (
      select 1 from invoices i
      where i.id = invoice_id and i.distributor_id = public.my_distributor_id()
    )
  );
create policy invoice_items_insert on invoice_line_items for insert
  with check (
    public.is_admin()
    or exists (
      select 1 from invoices i
      where i.id = invoice_id and i.distributor_id = public.my_distributor_id()
    )
  );
create policy invoice_items_delete on invoice_line_items for delete
  using (
    public.is_admin()
    or exists (
      select 1 from invoices i
      where i.id = invoice_id and i.distributor_id = public.my_distributor_id()
    )
  );

-- Partners may adjust their own on-hand quantities (M2)
create policy inventory_update_own on distributor_inventory for update
  using (distributor_id = public.my_distributor_id())
  with check (distributor_id = public.my_distributor_id());

create policy inventory_insert_own on distributor_inventory for insert
  with check (distributor_id = public.my_distributor_id());

create policy movements_insert_own on inventory_movements for insert
  with check (distributor_id = public.my_distributor_id());

-- Customer resale uploads share distributor-documents bucket paths under customers/
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;
