-- Temporary $1 test package for end-to-end Stripe + EasyPost label testing.
-- Deactivate (is_active = false) or delete after testing.

insert into inventory_packages (
  sku,
  name,
  description,
  unit_count,
  price_cents,
  weight_oz,
  length_in,
  width_in,
  height_in,
  box_count,
  sort_order,
  is_active
)
values (
  'PE-PKG-TEST',
  'Test Package ($1)',
  'Temporary $1 test package for Stripe and shipping-label testing. Credits 1 serum unit. Remove or deactivate after testing.',
  1,
  100,
  144,
  14,
  14,
  4,
  1,
  99,
  true
)
on conflict (sku) do update set
  name = excluded.name,
  description = excluded.description,
  unit_count = excluded.unit_count,
  price_cents = excluded.price_cents,
  weight_oz = excluded.weight_oz,
  length_in = excluded.length_in,
  width_in = excluded.width_in,
  height_in = excluded.height_in,
  box_count = excluded.box_count,
  sort_order = excluded.sort_order,
  is_active = true;
