-- Agreement acceptance audit fields for Partner Terms Version 1.0
-- (full legal name, business, email, checkbox confirmation beyond version/IP)

alter table agreement_acceptances
  add column if not exists business_name text not null default '',
  add column if not exists email text not null default '',
  add column if not exists account_id uuid,
  add column if not exists checkbox_accepted boolean not null default false;

comment on table agreement_acceptances is
  'Audit trail for electronic acceptance of Partner Terms & Wholesale Agreement.';
