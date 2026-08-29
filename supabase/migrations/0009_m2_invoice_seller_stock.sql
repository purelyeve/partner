-- M2 follow-ups: seller contact on invoices; support stock deduct audit

alter table invoices
  add column if not exists seller_name_snapshot text not null default '',
  add column if not exists seller_email_snapshot text not null default '',
  add column if not exists seller_phone_snapshot text not null default '',
  add column if not exists inventory_deducted_at timestamptz;

comment on column invoices.inventory_deducted_at is
  'When line-item quantities were deducted from partner inventory (on payment).';
