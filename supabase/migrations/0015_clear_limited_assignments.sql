-- Reset limited-visibility catalogs to empty assignment lists.
-- "Visible to all" products/packages do not use these rows.
-- Leftover rows came from the old auto-seed triggers.

delete from distributor_product_assignments dpa
using products p
where dpa.product_id = p.id
  and p.visible_to_all = false;

delete from distributor_package_assignments dpa
using inventory_packages ip
where dpa.package_id = ip.id
  and ip.visible_to_all = false;
