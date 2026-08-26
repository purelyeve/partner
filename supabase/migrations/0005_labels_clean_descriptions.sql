-- Clean package descriptions (box dims are backend-only notes).
-- Add label fields for in-dashboard EasyPost purchase/print.

update inventory_packages
set description = 'Purely Eve Partner starter inventory package contains 20 individually boxed Eve Origin Serums, 30 mL / 1 oz each.'
where sku = 'PE-PKG-START';

update inventory_packages
set description = 'Purely Eve Partner growth inventory package contains 40 individually boxed Eve Origin Serums, 30 mL / 1 oz each.'
where sku = 'PE-PKG-GROWTH';

alter table package_orders
  add column if not exists label_url text not null default '',
  add column if not exists label_urls text[] not null default '{}';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'shipping-labels',
  'shipping-labels',
  false,
  10485760,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/gif']
)
on conflict (id) do nothing;
