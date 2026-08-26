-- Client-confirmed ship dims for inventory packages (Aug 2026):
-- Starter (20): one box 14 x 14 x 4 in, ~8–9 lb
-- Growth (40): two of the same boxes (rates quoted as 2× single-box)

alter table inventory_packages
  add column if not exists length_in numeric(6,2) not null default 14,
  add column if not exists width_in numeric(6,2) not null default 14,
  add column if not exists height_in numeric(6,2) not null default 4,
  add column if not exists box_count integer not null default 1 check (box_count > 0);

update inventory_packages
set
  weight_oz = 144,
  length_in = 14,
  width_in = 14,
  height_in = 4,
  box_count = 1,
  description = 'Purely Eve Partner starter inventory package contains 20 individually boxed Eve Origin Serums, 30 mL / 1 oz each. Ships in one 14×14×4 in box (~8–9 lb).'
where sku = 'PE-PKG-START';

update inventory_packages
set
  weight_oz = 144,
  length_in = 14,
  width_in = 14,
  height_in = 4,
  box_count = 2,
  description = 'Purely Eve Partner growth inventory package contains 40 individually boxed Eve Origin Serums, 30 mL / 1 oz each. Ships as two 14×14×4 in boxes (~8–9 lb each); shipping is quoted as two boxes.'
where sku = 'PE-PKG-GROWTH';
