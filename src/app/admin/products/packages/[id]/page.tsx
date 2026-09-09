import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getAdminDb } from '@/lib/admin'
import { requireAdmin } from '@/lib/auth'
import PackageForm from '../../package-form'

export default async function AdminPackageDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdmin()
  const { id } = await params
  const supabase = getAdminDb()

  const { data: pkg } = await supabase.from('inventory_packages').select('*').eq('id', id).single()
  if (!pkg) notFound()

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/products" className="text-sm">
          ← Products
        </Link>
        <h1 className="text-3xl mt-2">{pkg.name}</h1>
        <p className="text-sm text-pe-brown font-mono">{pkg.sku}</p>
      </div>
      <PackageForm pkg={pkg} />
    </div>
  )
}
