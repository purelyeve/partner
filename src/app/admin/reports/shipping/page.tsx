import Link from 'next/link'
import { Badge } from '@/components/ui'
import { getAdminDb } from '@/lib/admin'
import { requireAdmin } from '@/lib/auth'
import { DISTRIBUTOR_PROFILE } from '@/lib/constants'
import { inPaidWindow, resolvePeriod } from '@/lib/admin-reports'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Profile } from '@/lib/types'
import { ExportReportButton, FilterField, ReportFilters, SummaryCards } from '../report-ui'

export default async function ShippingReportPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string
    to?: string
    period?: string
    partner?: string
    status?: string
  }>
}) {
  await requireAdmin()
  const params = await searchParams
  const { fromIso, toIso, period, label } = resolvePeriod(params)
  const partnerId = (params.partner ?? '').trim()
  const statusFilter = (params.status ?? 'all').toLowerCase()
  const supabase = getAdminDb()

  const [{ data: distributors }, { data: invoices }] = await Promise.all([
    supabase
      .from('distributors')
      .select(`id, business_name, ${DISTRIBUTOR_PROFILE}(full_name)`)
      .order('business_name'),
    supabase
      .from('invoices')
      .select(
        `id, invoice_number, shipping_cents, paid_at, fulfilled_at, tracking_code, free_shipping, distributor_id, customer_name_snapshot, distributors(business_name, ${DISTRIBUTOR_PROFILE}(full_name))`,
      )
      .eq('status', 'paid')
      .is('refunded_at', null)
      .gt('shipping_cents', 0)
      .order('paid_at', { ascending: false })
      .limit(5000),
  ])

  const all = invoices ?? []
  const monthFrom = resolvePeriod({ period: 'month' }).fromIso
  const ytdFrom = resolvePeriod({ period: 'ytd' }).fromIso
  const sumShip = (list: typeof all) => list.reduce((s, i) => s + (i.shipping_cents ?? 0), 0)

  const filtered = all.filter((inv) => {
    if (!inPaidWindow(inv.paid_at, fromIso, toIso)) return false
    if (partnerId && inv.distributor_id !== partnerId) return false
    const fulfilled = Boolean(inv.fulfilled_at)
    if (statusFilter === 'fulfilled' && !fulfilled) return false
    if (statusFilter === 'pending' && fulfilled) return false
    return true
  })

  const byPartner = new Map<
    string,
    { name: string; collected: number; fulfilled: number; pending: number; rows: typeof filtered }
  >()

  for (const inv of filtered) {
    const dist = inv.distributors as {
      business_name?: string
      profiles?: Profile | Profile[]
    } | null
    const profile = Array.isArray(dist?.profiles) ? dist?.profiles[0] : dist?.profiles
    const row = byPartner.get(inv.distributor_id) ?? {
      name: dist?.business_name?.trim() || profile?.full_name || 'Partner',
      collected: 0,
      fulfilled: 0,
      pending: 0,
      rows: [] as typeof filtered,
    }
    row.collected += inv.shipping_cents ?? 0
    if (inv.fulfilled_at) row.fulfilled += 1
    else row.pending += 1
    row.rows.push(inv)
    byPartner.set(inv.distributor_id, row)
  }

  const partnerRows = Array.from(byPartner.entries())
    .map(([id, row]) => ({ id, ...row }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl">Shipping collected</h1>
          <p className="text-sm text-pe-brown mt-1">
            Customer shipping charged on invoices (company share for postage). Shows whether the label
            was purchased yet.
          </p>
        </div>
        <ExportReportButton
          report="shipping"
          searchParams={{
            from: params.from,
            to: params.to,
            period: params.period,
            partner: params.partner,
            status: params.status,
          }}
        />
      </div>

      <SummaryCards
        items={[
          {
            label: 'This month',
            value: formatCurrency(
              sumShip(all.filter((i) => inPaidWindow(i.paid_at, monthFrom, null))),
            ),
          },
          {
            label: 'YTD',
            value: formatCurrency(
              sumShip(all.filter((i) => inPaidWindow(i.paid_at, ytdFrom, null))),
            ),
          },
          { label: 'Lifetime', value: formatCurrency(sumShip(all)) },
        ]}
      />

      <ReportFilters action="/admin/reports/shipping">
        <FilterField label="Period" name="period">
          <select id="period" name="period" defaultValue={period === 'custom' ? 'custom' : period}>
            <option value="month">Calendar month</option>
            <option value="ytd">Year to date</option>
            <option value="lifetime">Lifetime</option>
            <option value="custom">Custom dates</option>
          </select>
        </FilterField>
        <FilterField label="Partner" name="partner">
          <select id="partner" name="partner" defaultValue={partnerId}>
            <option value="">All Partners</option>
            {(distributors ?? []).map((d) => {
              const profile = Array.isArray(d.profiles) ? d.profiles[0] : d.profiles
              return (
                <option key={d.id} value={d.id}>
                  {d.business_name?.trim() ||
                    (profile as Profile | undefined)?.full_name ||
                    'Partner'}
                </option>
              )
            })}
          </select>
        </FilterField>
        <FilterField label="Label status" name="status">
          <select id="status" name="status" defaultValue={statusFilter}>
            <option value="all">All</option>
            <option value="fulfilled">Fulfilled</option>
            <option value="pending">Pending</option>
          </select>
        </FilterField>
        <FilterField label="From" name="from">
          <input id="from" name="from" type="date" defaultValue={params.from ?? ''} />
        </FilterField>
        <FilterField label="To" name="to">
          <input id="to" name="to" type="date" defaultValue={params.to ?? ''} />
        </FilterField>
      </ReportFilters>

      <p className="text-sm text-pe-brown">
        Filtered ({label}): {formatCurrency(sumShip(filtered))} across {filtered.length} invoices
      </p>

      {partnerRows.map((p) => (
        <div key={p.id} className="border border-pe-beige bg-white rounded-sm overflow-hidden">
          <div className="bg-pe-cream p-3 flex flex-wrap gap-4 justify-between text-sm">
            <p className="font-medium">{p.name}</p>
            <div className="flex flex-wrap gap-3">
              <span>Collected {formatCurrency(p.collected)}</span>
              <span>{p.fulfilled} fulfilled</span>
              <span>{p.pending} pending</span>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="text-left">
              <tr>
                <th className="p-2">Paid</th>
                <th className="p-2">Invoice</th>
                <th className="p-2">Customer</th>
                <th className="p-2">Shipping</th>
                <th className="p-2">Label</th>
              </tr>
            </thead>
            <tbody>
              {p.rows.map((inv) => (
                <tr key={inv.id} className="border-t border-pe-beige">
                  <td className="p-2">{formatDate(inv.paid_at)}</td>
                  <td className="p-2">
                    <Link
                      className="underline"
                      href={`/admin/reports/customer-orders/${inv.id}`}
                    >
                      {inv.invoice_number}
                    </Link>
                  </td>
                  <td className="p-2">{inv.customer_name_snapshot}</td>
                  <td className="p-2">{formatCurrency(inv.shipping_cents)}</td>
                  <td className="p-2">
                    {inv.fulfilled_at ? (
                      <Badge tone="success">Fulfilled</Badge>
                    ) : (
                      <Badge tone="gold">Pending</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {!partnerRows.length && (
        <p className="text-sm text-pe-brown">No shipping collected in this range.</p>
      )}
    </div>
  )
}
