import Link from 'next/link'
import { Badge } from '@/components/ui'
import { getAdminDb } from '@/lib/admin'
import { requireAdmin } from '@/lib/auth'
import { applicationStatusLabel, formatDate } from '@/lib/utils'
import { DISTRIBUTOR_PROFILE } from '@/lib/constants'
import type { Profile } from '@/lib/types'

function asProfile(value: unknown): Profile {
  return value as Profile
}

export default async function AdminDistributorsPage() {
  await requireAdmin()
  const supabase = getAdminDb()

  const { data: distributors, error } = await supabase
    .from('distributors')
    .select(`id, business_name, application_status, application_submitted_at, resale_accepted_at, ${DISTRIBUTOR_PROFILE}(full_name, email, phone)`)
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <h1 className="text-3xl">Distributors</h1>

      {error && (
        <p className="text-sm text-red-600">Could not load distributors: {error.message}</p>
      )}

      {!error && (!distributors || distributors.length === 0) && (
        <p className="text-sm text-pe-brown">
          No partner applications yet. When someone registers at{' '}
          <Link href="/register">/register</Link>, they will appear here for review.
        </p>
      )}

      {distributors && distributors.length > 0 && (
        <div className="border border-pe-beige bg-white rounded-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-pe-cream text-left">
              <tr>
                <th className="p-3">Business</th>
                <th className="p-3">Contact</th>
                <th className="p-3">Status</th>
                <th className="p-3">Resale</th>
                <th className="p-3">Applied</th>
              </tr>
            </thead>
            <tbody>
              {distributors.map((d) => {
                const p = asProfile(d.profiles)
                const label = d.business_name?.trim() || 'Personal'
                return (
                  <tr key={d.id} className="border-t border-pe-beige">
                    <td className="p-3">
                      <Link href={`/admin/distributors/${d.id}`} className="hover:underline font-medium">
                        {label}
                      </Link>
                    </td>
                    <td className="p-3">
                      <Link href={`/admin/distributors/${d.id}`} className="hover:underline">
                        {p.full_name}
                      </Link>
                      <br />
                      <span className="text-pe-brown">{p.email}</span>
                    </td>
                    <td className="p-3">
                      <Badge tone={d.application_status === 'approved' ? 'success' : d.application_status === 'pending' ? 'warning' : 'error'}>
                        {applicationStatusLabel(d.application_status)}
                      </Badge>
                    </td>
                    <td className="p-3">
                      {d.resale_accepted_at
                        ? 'Accepted'
                        : d.application_status === 'pending'
                          ? 'Pending review'
                          : 'Awaiting acceptance'}
                    </td>
                    <td className="p-3">{formatDate(d.application_submitted_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
