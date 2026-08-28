import Link from 'next/link'
import { requireDistributor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { LOW_STOCK_THRESHOLD } from '@/lib/constants'
import type { Product } from '@/lib/types'
import InventoryClient from './inventory-client'

export default async function PartnerInventoryPage() {
  const { distributor } = await requireDistributor()
  const supabase = await createClient()

  const { data: assignments } = await supabase
    .from('distributor_product_assignments')
    .select('product_id, products(*)')
    .eq('distributor_id', distributor.id)

  const { data: inventory } = await supabase
    .from('distributor_inventory')
    .select('sku, quantity_on_hand, low_stock_threshold')
    .eq('distributor_id', distributor.id)

  const invBySku = new Map(
    (inventory ?? []).map((i) => [
      i.sku,
      {
        quantity: i.quantity_on_hand as number,
        threshold: (i.low_stock_threshold as number) ?? LOW_STOCK_THRESHOLD,
      },
    ]),
  )

  const rows = (assignments ?? [])
    .map((a) => {
      const raw = a.products as unknown
      const product = (Array.isArray(raw) ? raw[0] : raw) as Product | null
      if (!product || !product.is_active) return null
      const inv = invBySku.get(product.sku)
      return {
        product,
        quantity: inv?.quantity ?? 0,
        threshold: inv?.threshold ?? LOW_STOCK_THRESHOLD,
      }
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => (a.product.sort_order ?? 0) - (b.product.sort_order ?? 0))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/partner" className="text-sm">
            ← Dashboard
          </Link>
          <h1 className="text-3xl mt-2">Inventory</h1>
          <p className="text-sm text-pe-brown mt-1">
            Stock for products assigned to you. Buying a package credits units automatically.
          </p>
        </div>
        <Link href="/partner/packages" className="text-sm text-pe-gold">
          Order packages →
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-pe-brown">No products assigned yet.</p>
      ) : (
        <InventoryClient rows={rows} />
      )}
    </div>
  )
}
