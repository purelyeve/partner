import { getAdminDb } from '@/lib/admin'
import { requireAdmin } from '@/lib/auth'
import { formatCurrency, formatDate } from '@/lib/utils'
import { FulfillOrderForm } from './fulfill-form'
import { DISTRIBUTOR_PROFILE } from '@/lib/constants'
import type { Profile } from '@/lib/types'

function asProfile(value: unknown): Profile {
  return value as Profile
}

const STATUSES = ['all', 'awaiting_payment', 'paid', 'fulfilled', 'cancelled'] as const

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; from?: string; to?: string; q?: string }>
}) {
  await requireAdmin()
  const params = await searchParams
  const status = (params.status ?? 'all').toLowerCase()
  const from = params.from?.trim() ?? ''
  const to = params.to?.trim() ?? ''
  const q = params.q?.trim() ?? ''

  const supabase = getAdminDb()

  let query = supabase
    .from('package_orders')
    .select(`*, distributors(business_name, ${DISTRIBUTOR_PROFILE}(full_name, email))`)
    .order('created_at', { ascending: false })

  if (status !== 'all' && STATUSES.includes(status as (typeof STATUSES)[number])) {
    query = query.eq('status', status)
  }
  if (from) query = query.gte('created_at', `${from}T00:00:00.000Z`)
  if (to) query = query.lte('created_at', `${to}T23:59:59.999Z`)

  const { data: orders, error } = await query

  const filtered = (orders ?? []).filter((o) => {
    if (!q) return true
    const dist = o.distributors as { business_name: string; profiles: unknown } | null
    const profile = dist ? asProfile(dist.profiles) : null
    const hay = [
      o.order_number,
      o.name_snapshot,
      dist?.business_name,
      profile?.email,
      profile?.full_name,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return hay.includes(q.toLowerCase())
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl">Inventory orders</h1>
        <p className="text-sm text-pe-brown mt-2 max-w-3xl leading-relaxed">
          Paid Partner inventory packages are fulfilled here (not in Shopify). For each paid order:
          buy and print the label in your company EasyPost account (using the ship-to address and
          service the Partner selected), then paste the tracking number below and mark fulfilled.
          Growth packages ship as two boxes of 20.
        </p>
      </div>

      <form className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 text-sm" method="get">
        <label className="block">
          <span className="block text-xs uppercase tracking-wider text-pe-brown mb-1">Partner</span>
          <input name="q" defaultValue={q} placeholder="Name, email, or order #" />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wider text-pe-brown mb-1">Status</span>
          <select name="status" defaultValue={status}>
            <option value="all">All statuses</option>
            <option value="awaiting_payment">Awaiting payment</option>
            <option value="paid">Paid</option>
            <option value="fulfilled">Fulfilled</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wider text-pe-brown mb-1">From</span>
          <input type="date" name="from" defaultValue={from} />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wider text-pe-brown mb-1">To</span>
          <input type="date" name="to" defaultValue={to} />
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="h-10 px-4 bg-pe-dark-brown text-pe-cream rounded-sm cursor-pointer hover:bg-pe-brown transition-colors">
            Filter
          </button>
          <a href="/admin/orders" className="h-10 px-3 inline-flex items-center text-pe-brown cursor-pointer hover:text-pe-gold hover:underline underline-offset-4">
            Reset
          </a>
        </div>
      </form>

      {error && (
        <p className="text-sm text-red-600">Could not load orders: {error.message}</p>
      )}

      {!error && filtered.length === 0 && (
        <p className="text-sm text-pe-brown">No inventory orders match these filters.</p>
      )}

      {filtered.length > 0 && (
        <div className="border border-pe-beige bg-white rounded-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-pe-cream text-left">
              <tr>
                <th className="p-3">Order</th>
                <th className="p-3">Partner</th>
                <th className="p-3">Package</th>
                <th className="p-3">Ship to</th>
                <th className="p-3">Status</th>
                <th className="p-3">Total</th>
                <th className="p-3">Paid</th>
                <th className="p-3">Fulfill</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => {
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
                    <td className="p-3 text-xs leading-relaxed">
                      <p>{o.ship_to_name}</p>
                      <p>{o.ship_to_line1}</p>
                      {o.ship_to_line2 ? <p>{o.ship_to_line2}</p> : null}
                      <p>
                        {o.ship_to_city}, {o.ship_to_state} {o.ship_to_postal_code}
                      </p>
                      {(o.shipping_carrier || o.shipping_service) && (
                        <p className="text-pe-brown mt-1">
                          Label: {[o.shipping_carrier, o.shipping_service].filter(Boolean).join(' ')}
                        </p>
                      )}
                    </td>
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
