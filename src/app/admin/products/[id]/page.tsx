import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getAdminDb } from '@/lib/admin'
import { requireAdmin } from '@/lib/auth'
import { DISTRIBUTOR_PROFILE } from '@/lib/constants'
import type { Profile } from '@/lib/types'
import ProductForm from '../product-form'
import PartnerAssignmentPanel from '../partner-assignment-panel'

function asProfile(value: unknown): Profile {
  return value as Profile
}

export default async function AdminProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdmin()
  const { id } = await params
  const supabase = getAdminDb()

  const { data: product } = await supabase.from('products').select('*').eq('id', id).single()
  if (!product) notFound()

  const { data: distributors } = await supabase
    .from('distributors')
    .select(`id, business_name, application_status, ${DISTRIBUTOR_PROFILE}(full_name, email)`)
    .eq('application_status', 'approved')
    .order('business_name')

  const { data: assignments } = await supabase
    .from('distributor_product_assignments')
    .select('distributor_id')
    .eq('product_id', id)

  const assignedIds = new Set((assignments ?? []).map((a) => a.distributor_id))
  const visibleToAll = product.visible_to_all !== false

  const partnerRows = (distributors ?? []).map((d) => {
    const p = asProfile(d.profiles)
    return {
      id: d.id,
      businessName: d.business_name?.trim() || 'Personal',
      contactName: p.full_name || '',
      email: p.email || '',
      assigned: assignedIds.has(d.id),
    }
  })

  return (
    <div className="space-y-10">
      <div>
        <Link href="/admin/products" className="text-sm">
          ← Products
        </Link>
        <h1 className="text-3xl mt-2">{product.name}</h1>
        <p className="text-sm text-pe-brown font-mono">{product.sku}</p>
      </div>

      <ProductForm product={product} />

      <section className="space-y-4">
        <h2 className="text-xl">Partner visibility</h2>
        {visibleToAll ? (
          <p className="text-sm text-pe-brown">
            This product is visible to all Partners. Uncheck &quot;Visible to all Partners&quot; above
            and save to choose specific Partners. After you uncheck it, no Partners are selected until
            you assign them.
          </p>
        ) : (
          <PartnerAssignmentPanel
            partners={partnerRows}
            entityLabel="product"
            entityType="product"
            entityId={product.id}
          />
        )}
      </section>
    </div>
  )
}
