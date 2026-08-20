-- =====================================================================
-- Purely Eve Distributor Portal - Milestone 1 schema
-- Distributor accounts, onboarding gates, inventory packages, admin.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------

create type user_role as enum ('admin', 'distributor');

-- Lifecycle of a distributor application, in the order the gates unlock.
create type application_status as enum (
  'pending',    -- submitted, waiting on admin
  'approved',   -- admin approved the application
  'declined',   -- admin declined
  'suspended',  -- previously approved, ordering privileges paused
  'removed'     -- soft-deleted by admin
);

create type document_status as enum ('pending', 'accepted', 'rejected');

create type document_kind as enum ('signed_agreement', 'resale_certificate');

create type package_order_status as enum (
  'draft',
  'awaiting_payment',
  'paid',
  'fulfilled',
  'cancelled'
);

create type business_structure as enum (
  'sole_proprietor', 'llc', 'corporation', 'other'
);

-- ---------------------------------------------------------------------
-- profiles: one row per auth user, carries the role
-- ---------------------------------------------------------------------

create table profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  role         user_role   not null default 'distributor',
  email        text        not null,
  full_name    text        not null default '',
  phone        text        not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table profiles is
  'Role carrier for every authenticated user. Admins are created by an existing admin or by the bootstrap script.';

-- ---------------------------------------------------------------------
-- distributors: the Partner record and its onboarding state
-- ---------------------------------------------------------------------

create table distributors (
  id                        uuid primary key default gen_random_uuid(),
  profile_id                uuid not null unique references profiles (id) on delete cascade,

  -- Business identity (Partner Agreement signature block)
  business_name             text not null default '',
  business_structure        business_structure not null default 'sole_proprietor',
  business_structure_other  text not null default '',

  -- Mailing address (billing / correspondence)
  mailing_line1             text not null default '',
  mailing_line2             text not null default '',
  mailing_city              text not null default '',
  mailing_state             text not null default '',
  mailing_postal_code       text not null default '',
  mailing_country           text not null default 'US',

  -- Fulfillment address: where the distributor ships FROM and receives
  -- inventory. Drives EasyPost rating and origin-side tax logic.
  fulfillment_same_as_mailing boolean not null default true,
  fulfillment_line1         text not null default '',
  fulfillment_line2         text not null default '',
  fulfillment_city          text not null default '',
  fulfillment_state         text not null default '',
  fulfillment_postal_code   text not null default '',
  fulfillment_country       text not null default 'US',

  -- Tax ID / SSN. Ciphertext only; the last 4 is the only thing ever
  -- rendered back to a human. See src/lib/crypto.ts (AES-256-GCM).
  tax_id_ciphertext         text,
  tax_id_last4              text,

  -- Resale registration, from Partner Agreement Section 2
  resale_certificate_number text not null default '',
  resale_state              text not null default '',

  -- Onboarding gates. Package purchase requires ALL of:
  --   application_status = 'approved'
  --   agreement_signed_at is not null
  --   resale_accepted_at  is not null
  application_status        application_status not null default 'pending',
  application_submitted_at  timestamptz,
  application_decided_at    timestamptz,
  application_decided_by    uuid references profiles (id) on delete set null,
  application_decision_note text not null default '',

  agreement_signed_at       timestamptz,
  resale_accepted_at        timestamptz,

  -- Introductory promotion window. The start trigger is CONFIGURABLE
  -- because the client chat (order date) and Partner Agreement Section 3
  -- (approval date) disagree; see CLAUDE.md Section 6. Whichever trigger
  -- is authoritative writes intro_started_at, and expiry is derived.
  intro_started_at          timestamptz,
  intro_expires_at          timestamptz,

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index distributors_application_status_idx on distributors (application_status);

comment on column distributors.tax_id_ciphertext is
  'AES-256-GCM ciphertext. Never decrypted for display; decryption is admin-export only.';
comment on column distributors.intro_started_at is
  'Set by whichever trigger the client confirms: inventory order date (current default) or application approval date.';

-- ---------------------------------------------------------------------
-- distributor_documents: signed agreement + resale certificate uploads
-- ---------------------------------------------------------------------

create table distributor_documents (
  id             uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references distributors (id) on delete cascade,
  kind           document_kind not null,
  storage_path   text not null,
  file_name      text not null,
  mime_type      text not null default '',
  size_bytes     bigint not null default 0,
  status         document_status not null default 'pending',
  review_note    text not null default '',
  reviewed_at    timestamptz,
  reviewed_by    uuid references profiles (id) on delete set null,
  uploaded_at    timestamptz not null default now()
);

create index distributor_documents_lookup_idx
  on distributor_documents (distributor_id, kind, uploaded_at desc);

-- ---------------------------------------------------------------------
-- agreement_acceptances: audit trail of who accepted which version
-- ---------------------------------------------------------------------

create table agreement_acceptances (
  id                uuid primary key default gen_random_uuid(),
  distributor_id    uuid not null references distributors (id) on delete cascade,
  agreement_version text not null,
  full_name_typed   text not null,
  accepted_at       timestamptz not null default now(),
  ip_address        text not null default '',
  user_agent        text not null default ''
);

-- ---------------------------------------------------------------------
-- inventory_packages: what a distributor buys FROM the company
-- ---------------------------------------------------------------------

create table inventory_packages (
  id              uuid primary key default gen_random_uuid(),
  sku             text not null unique,
  name            text not null,
  description     text not null default '',
  unit_count      integer not null check (unit_count > 0),
  price_cents     integer not null check (price_cents >= 0),
  weight_oz       integer not null check (weight_oz > 0),
  image_path      text not null default '',
  is_active       boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table inventory_packages is
  'Company-to-distributor wholesale packages. Never taxed: resale purchase per CLAUDE.md Section 6.';

-- ---------------------------------------------------------------------
-- package_orders: a distributor buying a package (prepaid)
-- ---------------------------------------------------------------------

create table package_orders (
  id                       uuid primary key default gen_random_uuid(),
  order_number             text not null unique,
  distributor_id           uuid not null references distributors (id) on delete restrict,
  package_id               uuid not null references inventory_packages (id) on delete restrict,

  -- Snapshot so historical orders survive catalog edits
  sku_snapshot             text not null,
  name_snapshot            text not null,
  unit_count_snapshot      integer not null,
  unit_price_cents         integer not null,

  quantity                 integer not null default 1 check (quantity > 0),
  subtotal_cents           integer not null,
  shipping_cents           integer not null default 0,
  tax_cents                integer not null default 0,  -- always 0: resale purchase
  total_cents              integer not null,

  -- Ship-to snapshot (distributor fulfillment address at time of order)
  ship_to_name             text not null default '',
  ship_to_line1            text not null default '',
  ship_to_line2            text not null default '',
  ship_to_city             text not null default '',
  ship_to_state            text not null default '',
  ship_to_postal_code      text not null default '',
  ship_to_country          text not null default 'US',

  -- EasyPost rate selected at checkout
  shipping_carrier         text not null default '',
  shipping_service         text not null default '',
  easypost_shipment_id     text not null default '',
  easypost_rate_id         text not null default '',

  status                   package_order_status not null default 'draft',
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  paid_at                  timestamptz,
  fulfilled_at             timestamptz,
  tracking_code            text not null default '',

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index package_orders_distributor_idx on package_orders (distributor_id, created_at desc);
create index package_orders_status_idx on package_orders (status);

-- ---------------------------------------------------------------------
-- distributor_inventory: stock on hand, per distributor per SKU
-- Milestone 1 tracks package-derived serum stock; Milestone 2 extends
-- this to the full consumer catalog.
-- ---------------------------------------------------------------------

create table distributor_inventory (
  id                  uuid primary key default gen_random_uuid(),
  distributor_id      uuid not null references distributors (id) on delete cascade,
  sku                 text not null,
  quantity_on_hand    integer not null default 0 check (quantity_on_hand >= 0),
  low_stock_threshold integer not null default 5,
  updated_at          timestamptz not null default now(),
  unique (distributor_id, sku)
);

-- ---------------------------------------------------------------------
-- inventory_movements: append-only ledger behind quantity_on_hand
-- ---------------------------------------------------------------------

create table inventory_movements (
  id             uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references distributors (id) on delete cascade,
  sku            text not null,
  delta          integer not null,
  reason         text not null,
  reference_id   uuid,
  created_by     uuid references profiles (id) on delete set null,
  created_at     timestamptz not null default now()
);

create index inventory_movements_lookup_idx
  on inventory_movements (distributor_id, sku, created_at desc);

-- ---------------------------------------------------------------------
-- audit_log: admin actions worth keeping a record of
-- ---------------------------------------------------------------------

create table audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references profiles (id) on delete set null,
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index audit_log_entity_idx on audit_log (entity_type, entity_id, created_at desc);

-- ---------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

create trigger distributors_set_updated_at
  before update on distributors
  for each row execute function set_updated_at();

create trigger inventory_packages_set_updated_at
  before update on inventory_packages
  for each row execute function set_updated_at();

create trigger package_orders_set_updated_at
  before update on package_orders
  for each row execute function set_updated_at();

create trigger distributor_inventory_set_updated_at
  before update on distributor_inventory
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- New auth user -> profile row
-- Registration passes full_name / phone / role through user metadata.
-- ---------------------------------------------------------------------

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, phone, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    -- Role is never taken from user-supplied metadata: self-service signup
    -- is always a distributor. Admins are promoted out of band.
    'distributor'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
