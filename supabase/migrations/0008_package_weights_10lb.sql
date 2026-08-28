-- Client update (Aug 2026): actual package box weights
-- Starter (20 serums): 10 lb per box
-- Growth (40 serums): two of the same boxes = 20 lb total (rates/labels already use box_count)

update inventory_packages
set weight_oz = 160  -- 10 lb
where sku = 'PE-PKG-START';

update inventory_packages
set weight_oz = 160  -- 10 lb per box; box_count = 2 → 20 lb package
where sku = 'PE-PKG-GROWTH';
