import Link from 'next/link'
import { Badge } from '@/components/ui'
import { getAdminDb } from '@/lib/admin'
import { requireAdmin } from '@/lib/auth'
import { DISTRIBUTOR_PROFILE } from '@/lib/constants'
import { daysSince } from '@/lib/csv'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Profile } from '@/lib/types'
import { FilterField, ReportFilters, SummaryCards } from '../report-ui'

export default async function PackageSalesReportPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; from?: string; to?: string }>
}) {
  await requireAdmin()
  const { q, from, to } = await searchParams
  const supabase = getAdminDb()

  const [{ data: distributors }, ordersRes] = await Promise.all([
    supabase
      .from('distributors')
      .select(`id, business_name, application_status, ${DISTRIBUTOR_PROFILE}(full_name, email)`)
      .in('application_status', ['approved', 'suspended'])
      .order('business_name'),
    (() => {
      let query = supabase
        .from('package_orders')
        .select(
          `id, order_number, paid_at, created_at, total_cents, subtotal_cents, quantity, unit_count_snapshot, name_snapshot, sku_snapshot, status, distributor_id, distributors(business_name, ${DISTRIBUTOR_PROFILE}(full_name, email))`,
        )
        .in('status', ['paid', 'fulfilled'])
        .order('paid_at', { ascending: false })

      if (from) query = query.gte('paid_at', new Date(from).toISOString())
      if (to) {
        const end = new Date(to)
        end.setHours(23, 59, 59, 999)
        query = query.lte('paid_at', end.toISOString())
      }
      return query.limit(1000)
    })(),
  ])

  const { data: orders } = ordersRes

  // Last paid package per Partner (lifetime) for the 90-day flag
  const { data: lifetimeOrders } = await supabase
    .from('package_orders')
    .select('distributor_id, paid_at')
    .in('status', ['paid', 'fulfilled'])
    .not('paid_at', 'is', null)
    .order('paid_at', { ascending: false })
    .limit(3000)

  const lastPaidByPartner = new Map<string, string>()
  for (const o of lifetimeOrders ?? []) {
    if (!lastPaidByPartner.has(o.distributor_id) && o.paid_at) {
      lastPaidByPartner.set(o.distributor_id, o.paid_at)
    }
  }

  const term = (q ?? '').trim().toLowerCase()
  const filtered = (orders ?? []).filter((o) => {
    if (!term) return true
    const dist = o.distributors as {
      business_name?: string
      profiles?: Profile | Profile[]
    } | null
    const profile = Array.isArray(dist?.profiles) ? dist?.profiles[0] : dist?.profiles
    const hay = `${dist?.business_name ?? ''} ${profile?.full_name ?? ''} ${profile?.email ?? ''} ${o.name_snapshot} ${o.order_number}`.toLowerCase()
    return hay.includes(term)
  })

  const byPartner = new Map<
    string,
    {
      name: string
      email: string
      orderCount: number
      units: number
      totalCents: number
      lastPaidAt: string | null
      orders: typeof filtered
    }
  >()

  for (const d of distributors ?? []) {
    const profile = Array.isArray(d.profiles) ? d.profiles[0] : d.profiles
    const name = d.business_name?.trim() || (profile as Profile | undefined)?.full_name || 'Partner'
    const email = (profile as Profile | undefined)?.email || ''
    if (term && !`${name} ${email}`.toLowerCase().includes(term)) continue
    byPartner.set(d.id, {
      name,
      email,
      orderCount: 0,
      units: 0,
      totalCents: 0,
      lastPaidAt: lastPaidByPartner.get(d.id) ?? null,
      orders: [],
    })
  }

  for (const o of filtered) {
    const dist = o.distributors as {
      business_name?: string
      profiles?: Profile | Profile[]
    } | null
    const profile = (Array.isArray(dist?.profiles) ? dist?.profiles[0] : dist?.profiles) as
      | Profile
      | undefined
    const existing = byPartner.get(o.distributor_id) ?? {
      name: dist?.business_name?.trim() || profile?.full_name || 'Partner',
      email: profile?.email || '',
      orderCount: 0,
      units: 0,
      totalCents: 0,
      lastPaidAt: lastPaidByPartner.get(o.distributor_id) ?? null,
      orders: [] as typeof filtered,
    }
    existing.orderCount += 1
    existing.units += (o.unit_count_snapshot ?? 0) * (o.quantity ?? 1)
    existing.totalCents += o.total_cents ?? 0
    existing.orders.push(o)
    byPartner.set(o.distributor_id, existing)
  }

  const partnerRows = Array.from(byPartner.entries())
    .map(([id, row]) => ({ id, ...row }))
    .sort((a, b) => {
      const aIdle = daysSince(a.lastPaidAt)
      const bIdle = daysSince(b.lastPaidAt)
      const aFlag = aIdle == null || aIdle >= 90 ? 0 : 1
      const bFlag = bIdle == null || bIdle >= 90 ? 0 : 1
      if (aFlag !== bFlag) return aFlag - bFlag
      return a.name.localeCompare(b.name)
    })

  const totalCents = filtered.reduce((s, o) => s + (o.total_cents ?? 0), 0)
  const totalUnits = filtered.reduce(
    (s, o) => s + (o.unit_count_snapshot ?? 0) * (o.quantity ?? 1),
    0,
  )
  const inactive90 = partnerRows.filter((p) => {
    const d = daysSince(p.lastPaidAt)
    return d == null || d >= 90
  }).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl">Partner inventory package sales</h1>
        <p className="text-sm text-pe-brown mt-1">
          Paid package orders by Partner. Partners with no package order in 90 days are flagged.
        </p>
      </div>

      <ReportFilters action="/admin/reports/package-sales">
        <FilterField label="Partner name / email" name="q">
          <input id="q" name="q" defaultValue={q ?? ''} placeholder="Search" />
        </FilterField>
        <FilterField label="From" name="from">
          <input id="from" name="from" type="date" defaultValue={from ?? ''} />
        </FilterField>
        <FilterField label="To" name="to">
          <input id="to" name="to" type="date" defaultValue={to ?? ''} />
        </FilterField>
      </ReportFilters>

      <SummaryCards
        items={[
          { label: 'Orders (filtered)', value: String(filtered.length) },
          { label: 'Units', value: String(totalUnits) },
          { label: 'Volume', value: formatCurrency(totalCents) },
        ]}
      />
      {inactive90 > 0 && (
        <p className="text-sm text-pe-brown">
          {inactive90} Partner(s) have no paid package order in the last 90 days (listed first).
        </p>
      )}

      {partnerRows.map((p) => {
        const idleDays = daysSince(p.lastPaidAt)
        const inactive = idleDays == null || idleDays >= 90
        return (
          <div key={p.id} className="border border-pe-beige bg-white rounded-sm overflow-hidden">
            <div className="bg-pe-cream p-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-pe-brown">{p.email}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                {inactive && <Badge tone="gold">No order ≥ 90 days</Badge>}
                <span>{p.orderCount} orders in filter</span>
                <span>{p.units} units</span>
                <span className="font-serif">{formatCurrency(p.totalCents)}</span>
              </div>
            </div>
            {p.orders.length ? (
              <table className="w-full text-sm">
                <thead className="text-left">
                  <tr>
                    <th className="p-2">Date ordered</th>
                    <th className="p-2">Order</th>
                    <th className="p-2">Package</th>
                    <th className="p-2">Units</th>
                    <th className="p-2">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {p.orders.map((o) => (
                    <tr key={o.id} className="border-t border-pe-beige">
                      <td className="p-2">{formatDate(o.paid_at || o.created_at)}</td>
                      <td className="p-2">
                        <Link href={`/admin/orders?q=${encodeURIComponent(o.order_number)}`}>
                          {o.order_number}
                        </Link>
                      </td>
                      <td className="p-2">
                        {o.name_snapshot}
                        <span className="block text-xs text-pe-brown">{o.sku_snapshot}</span>
                      </td>
                      <td className="p-2">
                        {(o.unit_count_snapshot ?? 0) * (o.quantity ?? 1)}
                      </td>
                      <td className="p-2">{formatCurrency(o.total_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="p-3 text-sm text-pe-brown">No package orders in this date filter.</p>
            )}
          </div>
        )
      })}

      {!partnerRows.length && (
        <p className="text-sm text-pe-brown">No Partners match these filters.</p>
      )}
    </div>
  )
}
