import { Badge, Card } from '@/components/ui'
import { getAdminDb } from '@/lib/admin'
import { requireAdmin } from '@/lib/auth'
import { applicationStatusLabel, formatDate } from '@/lib/utils'
import { DISTRIBUTOR_PROFILE } from '@/lib/constants'
import type { Profile } from '@/lib/types'

function asProfile(value: unknown): Profile {
  return value as Profile
}

export default async function AdminDashboardPage() {
  await requireAdmin()
  const supabase = getAdminDb()

  const { count: pendingApps } = await supabase
    .from('distributors')
    .select('*', { count: 'exact', head: true })
    .eq('application_status', 'pending')

  const { count: pendingDocs } = await supabase
    .from('distributor_documents')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')

  const { count: paidOrders } = await supabase
    .from('package_orders')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'paid')

  const { data: recentDistributors } = await supabase
    .from('distributors')
    .select(`id, business_name, application_status, application_submitted_at, ${DISTRIBUTOR_PROFILE}(full_name, email)`)
    .order('application_submitted_at', { ascending: false })
    .limit(5)

  return (
      <div className="space-y-8">
      <div>
        <h1 className="text-3xl">Admin overview</h1>
        <p className="text-sm text-pe-brown mt-2 max-w-2xl">
          Inventory package orders and fulfillment live under{' '}
          <a href="/admin/orders" className="underline underline-offset-2 hover:text-pe-gold">
            Inventory orders
          </a>
          . Buy labels in EasyPost, then paste tracking there to mark shipped.
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <Card>
          <p className="text-xs uppercase tracking-wider text-pe-brown">Pending applications</p>
          <p className="text-3xl font-serif mt-1">{pendingApps ?? 0}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wider text-pe-brown">Documents to review</p>
          <p className="text-3xl font-serif mt-1">{pendingDocs ?? 0}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wider text-pe-brown">Orders awaiting fulfillment</p>
          <p className="text-3xl font-serif mt-1">{paidOrders ?? 0}</p>
        </Card>
      </div>

      <section>
        <h2 className="text-xl mb-4">Recent applications</h2>
        {!recentDistributors?.length ? (
          <p className="text-sm text-pe-brown">No applications yet.</p>
        ) : (
          <div className="border border-pe-beige bg-white rounded-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-pe-cream text-left">
                <tr>
                  <th className="p-3">Business</th>
                  <th className="p-3">Contact</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {recentDistributors.map((d) => {
                  const p = asProfile(d.profiles)
                  const label = d.business_name?.trim() || 'Personal'
                  return (
                    <tr key={d.id} className="border-t border-pe-beige">
                      <td className="p-3">
                        <a href={`/admin/distributors/${d.id}`} className="hover:underline">
                          {label}
                        </a>
                      </td>
                      <td className="p-3">{p.full_name}<br /><span className="text-pe-brown">{p.email}</span></td>
                      <td className="p-3">
                        <Badge tone={d.application_status === 'approved' ? 'success' : 'warning'}>
                          {applicationStatusLabel(d.application_status)}
                        </Badge>
                      </td>
                      <td className="p-3">{formatDate(d.application_submitted_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
