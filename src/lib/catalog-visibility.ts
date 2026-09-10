import { createClient } from '@/lib/supabase/server'
import type { InventoryPackage, Product } from '@/lib/types'

type Supabase = Awaited<ReturnType<typeof createClient>>

/**
 * Active products this Partner may sell: visible_to_all, or explicitly assigned.
 */
export async function getPartnerVisibleProducts(
  supabase: Supabase,
  distributorId: string,
): Promise<Product[]> {
  const [{ data: allVisible }, { data: assignments }] = await Promise.all([
    supabase.from('products').select('*').eq('is_active', true).eq('visible_to_all', true),
    supabase
      .from('distributor_product_assignments')
      .select('products(*)')
      .eq('distributor_id', distributorId),
  ])

  const byId = new Map<string, Product>()
  for (const p of allVisible ?? []) {
    byId.set(p.id, p as Product)
  }
  for (const row of assignments ?? []) {
    const raw = row.products as unknown
    const product = (Array.isArray(raw) ? raw[0] : raw) as Product | null
    if (product?.is_active && !product.visible_to_all) {
      byId.set(product.id, product)
    }
  }

  return Array.from(byId.values()).sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name),
  )
}

/**
 * Active inventory packages this Partner may buy.
 */
export async function getPartnerVisiblePackages(
  supabase: Supabase,
  distributorId: string,
): Promise<InventoryPackage[]> {
  const [{ data: allVisible }, { data: assignments }] = await Promise.all([
    supabase
      .from('inventory_packages')
      .select('*')
      .eq('is_active', true)
      .eq('visible_to_all', true),
    supabase
      .from('distributor_package_assignments')
      .select('package_id, inventory_packages(*)')
      .eq('distributor_id', distributorId),
  ])

  const byId = new Map<string, InventoryPackage>()
  for (const pkg of allVisible ?? []) {
    byId.set(pkg.id, pkg as InventoryPackage)
  }
  for (const row of assignments ?? []) {
    const raw = row.inventory_packages as unknown
    const pkg = (Array.isArray(raw) ? raw[0] : raw) as InventoryPackage | null
    if (pkg?.is_active && !pkg.visible_to_all) {
      byId.set(pkg.id, pkg)
    }
  }

  return Array.from(byId.values()).sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name),
  )
}

export async function partnerCanAccessProduct(
  supabase: Supabase,
  distributorId: string,
  productId: string,
): Promise<boolean> {
  const { data: product } = await supabase
    .from('products')
    .select('id, is_active, visible_to_all')
    .eq('id', productId)
    .maybeSingle()
  if (!product?.is_active) return false
  if (product.visible_to_all) return true
  const { count } = await supabase
    .from('distributor_product_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('distributor_id', distributorId)
    .eq('product_id', productId)
  return (count ?? 0) > 0
}

export async function partnerCanAccessPackage(
  supabase: Supabase,
  distributorId: string,
  packageId: string,
): Promise<boolean> {
  const { data: pkg } = await supabase
    .from('inventory_packages')
    .select('id, is_active, visible_to_all')
    .eq('id', packageId)
    .maybeSingle()
  if (!pkg?.is_active) return false
  if (pkg.visible_to_all) return true
  const { count } = await supabase
    .from('distributor_package_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('distributor_id', distributorId)
    .eq('package_id', packageId)
  return (count ?? 0) > 0
}
