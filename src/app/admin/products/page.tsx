import Link from 'next/link'
import Image from 'next/image'
import { Badge, Button } from '@/components/ui'
import { getAdminDb } from '@/lib/admin'
import { requireAdmin } from '@/lib/auth'
import { formatCurrency } from '@/lib/utils'

export default async function AdminProductsPage() {
  await requireAdmin()
  const supabase = getAdminDb()

  const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .order('sort_order')
    .order('name')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl">Products</h1>
          <p className="text-sm text-pe-brown mt-1">
            Consumer SKUs Partners sell on invoices. Prices are locked on the Partner side.
          </p>
        </div>
        <Link href="/admin/products/new">
          <Button>Add product</Button>
        </Link>
      </div>

      {error && (
        <p className="text-sm text-red-600">Could not load products: {error.message}</p>
      )}

      {!error && (!products || products.length === 0) && (
        <p className="text-sm text-pe-brown">
          No products yet. Run migration 0007 or add the Eve Origin Serum SKU.
        </p>
      )}

      {products && products.length > 0 && (
        <div className="border border-pe-beige bg-white rounded-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-pe-cream text-left">
              <tr>
                <th className="p-3">Product</th>
                <th className="p-3">SKU</th>
                <th className="p-3">Retail</th>
                <th className="p-3">Wholesale</th>
                <th className="p-3">Weight</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-t border-pe-beige">
                  <td className="p-3">
                    <Link
                      href={`/admin/products/${p.id}`}
                      className="flex items-center gap-3 hover:underline font-medium"
                    >
                      {p.image_path ? (
                        <Image
                          src={p.image_path}
                          alt=""
                          width={40}
                          height={40}
                          className="rounded-sm object-cover bg-pe-cream"
                          unoptimized={p.image_path.startsWith('http')}
                        />
                      ) : null}
                      <span>{p.name}</span>
                    </Link>
                  </td>
                  <td className="p-3 font-mono text-xs">{p.sku}</td>
                  <td className="p-3">{formatCurrency(p.retail_cents)}</td>
                  <td className="p-3">{formatCurrency(p.wholesale_cents)}</td>
                  <td className="p-3">{p.weight_oz} oz</td>
                  <td className="p-3">
                    <Badge tone={p.is_active ? 'success' : 'neutral'}>
                      {p.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
