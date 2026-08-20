import { getAdminDb } from '@/lib/admin'
import { requireAdmin } from '@/lib/auth'
import { formatCurrency, formatDate } from '@/lib/utils'
import { FulfillOrderForm } from './fulfill-form'
import { DISTRIBUTOR_PROFILE } from '@/lib/constants'
import type { Profile } from '@/lib/types'

function asProfile(value: unknown): Profile {
  return value as Profile
}

export default async function AdminOrdersPage() {
  await requireAdmin()
  const supabase = getAdminDb()

  const { data: orders, error } = await supabase
    .from('package_orders')
    .select(`*, distributors(business_name, ${DISTRIBUTOR_PROFILE}(full_name, email))`)
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <h1 className="text-3xl">Inventory orders</h1>

      {error && (
        <p className="text-sm text-red-600">Could not load orders: {error.message}</p>
      )}

      {!error && (!orders || orders.length === 0) && (
        <p className="text-sm text-pe-brown">No inventory orders yet.</p>
      )}

      {orders && orders.length > 0 && (
        <div className="border border-pe-beige bg-white rounded-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-pe-cream text-left">
              <tr>
                <th className="p-3">Order</th>
                <th className="p-3">Partner</th>
                <th className="p-3">Package</th>
                <th className="p-3">Status</th>
                <th className="p-3">Total</th>
                <th className="p-3">Paid</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const dist = o.distributors as { business_name: string; profiles: unknown }
                const profile = asProfile(dist.profiles)
                return (
                  <tr key={o.id} className="border-t border-pe-beige align-top">
                    <td className="p-3">{o.order_number}</td>
                    <td className="p-3">
                      {dist.business_name}<br />
                      <span className="text-pe-brown">{profile.email}</span>
                    </td>
                    <td className="p-3">{o.name_snapshot}</td>
                    <td className="p-3 capitalize">{o.status.replace('_', ' ')}</td>
                    <td className="p-3">{formatCurrency(o.total_cents)}</td>
                    <td className="p-3">{formatDate(o.paid_at)}</td>
                    <td className="p-3">
                      {o.status === 'paid' && <FulfillOrderForm orderId={o.id} />}
                      {o.tracking_code && (
                        <p className="text-xs mt-1">Tracking: {o.tracking_code}</p>
                      )}
                    </td>
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
