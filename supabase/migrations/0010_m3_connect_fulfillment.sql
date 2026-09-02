-- Milestone 3: Stripe Connect, partner EasyPost, invoice labels + refunds

alter table distributors
  add column if not exists stripe_account_id text unique,
  add column if not exists stripe_charges_enabled boolean not null default false,
  add column if not exists stripe_payouts_enabled boolean not null default false,
  add column if not exists stripe_details_submitted boolean not null default false,
  add column if not exists stripe_onboarding_complete boolean not null default false,
  add column if not exists easypost_api_key_ciphertext text,
  add column if not exists easypost_api_key_last4 text;

comment on column distributors.stripe_account_id is
  'Stripe Connect Express account id (acct_...). Customer invoice charges go here.';
comment on column distributors.easypost_api_key_ciphertext is
  'Encrypted Partner EasyPost API key for customer shipping labels (Partner pays postage).';

alter table invoices
  add column if not exists label_url text not null default '',
  add column if not exists label_urls text[] not null default '{}',
  add column if not exists stripe_refund_id text,
  add column if not exists refunded_at timestamptz,
  add column if not exists inventory_restored_at timestamptz,
  add column if not exists cancel_reason text not null default '';

comment on column invoices.inventory_restored_at is
  'Set when stock is credited back after a paid invoice is refunded/cancelled.';

create index if not exists invoices_fulfillment_idx
  on invoices (distributor_id, status, fulfilled_at)
  where status = 'paid';
