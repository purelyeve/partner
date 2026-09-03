-- M3 follow-ups: EasyPost child user + company fallback

alter table distributors
  add column if not exists easypost_user_id text,
  add column if not exists easypost_use_company boolean not null default false;

comment on column distributors.easypost_user_id is
  'EasyPost child user id created from the portal under the company parent account.';
comment on column distributors.easypost_use_company is
  'When true (or no partner key), customer rates/labels use the company EasyPost API key.';
