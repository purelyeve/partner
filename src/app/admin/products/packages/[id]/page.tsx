import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getAdminDb } from '@/lib/admin'
import { requireAdmin } from '@/lib/auth'
import { DISTRIBUTOR_PROFILE } from '@/lib/constants'
import type { Profile } from '@/lib/types'
import PackageForm from '../../package-form'
import PackageAssignmentToggle from '../../package-assignment-toggle'

function asProfile(value: unknown): Profile {
  return value as Profile
}

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

  const { data: distributors } = await supabase
    .from('distributors')
    .select(`id, business_name, application_status, ${DISTRIBUTOR_PROFILE}(full_name, email)`)
    .eq('application_status', 'approved')
    .order('business_name')

  const { data: assignments } = await supabase
    .from('distributor_package_assignments')
    .select('distributor_id')
    .eq('package_id', id)

  const assignedIds = new Set((assignments ?? []).map((a) => a.distributor_id))
  const visibleToAll = pkg.visible_to_all !== false

  return (
    <div className="space-y-10">
      <div>
        <Link href="/admin/products" className="text-sm">
          ← Products
        </Link>
        <h1 className="text-3xl mt-2">{pkg.name}</h1>
        <p className="text-sm text-pe-brown font-mono">{pkg.sku}</p>
      </div>

      <PackageForm pkg={pkg} />

      <section className="space-y-4">
        <h2 className="text-xl">Partner visibility</h2>
        {visibleToAll ? (
          <p className="text-sm text-pe-brown">
            This package is visible to all Partners. Uncheck &quot;Visible to all Partners&quot; above
            and save to choose specific Partners.
          </p>
        ) : (
          <>
            <p className="text-sm text-pe-brown">
              Only assigned Partners see this package on their Packages page.
            </p>
            {!distributors?.length ? (
              <p className="text-sm text-pe-brown">No approved Partners yet.</p>
            ) : (
              <div className="border border-pe-beige bg-white rounded-sm overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-pe-cream text-left">
                    <tr>
                      <th className="p-3">Partner</th>
                      <th className="p-3">Contact</th>
                      <th className="p-3">Assigned</th>
                      <th className="p-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {distributors.map((d) => {
                      const p = asProfile(d.profiles)
                      const assigned = assignedIds.has(d.id)
                      return (
                        <tr key={d.id} className="border-t border-pe-beige">
                          <td className="p-3">{d.business_name?.trim() || 'Personal'}</td>
                          <td className="p-3">
                            {p.full_name}
                            <br />
                            <span className="text-pe-brown">{p.email}</span>
                          </td>
                          <td className="p-3">{assigned ? 'Yes' : 'No'}</td>
                          <td className="p-3 text-right">
                            <PackageAssignmentToggle
                              packageId={pkg.id}
                              distributorId={d.id}
                              assigned={assigned}
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
