import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import PackageForm from '../../package-form'

export default async function AdminNewPackagePage() {
  await requireAdmin()

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/products" className="text-sm">
          ← Products
        </Link>
        <h1 className="text-3xl mt-2">Add inventory package</h1>
        <p className="text-sm text-pe-brown mt-1">
          Packages Partners buy from Purely Eve. Untaxed resale purchase; shipping added at checkout.
        </p>
      </div>
      <PackageForm />
    </div>
  )
}
