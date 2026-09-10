import Link from 'next/link'
import { getAdminDb } from '@/lib/admin'
import { requireAdmin } from '@/lib/auth'
import { DISTRIBUTOR_PROFILE } from '@/lib/constants'
import { inPaidWindow, partnerSearchHaystack, resolvePeriod } from '@/lib/admin-reports'
import { customerTypeLabel, formatCurrency, formatDate } from '@/lib/utils'
import type { Profile } from '@/lib/types'
import { FilterField, ReportFilters, SummaryCards } from '../report-ui'

export default async function CustomerOrdersReportPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    from?: string
    to?: string
    period?: string
    type?: string
    partner?: string
  }>
}) {
  await requireAdmin()
  const params = await searchParams
  const { fromIso, toIso, period, label } = resolvePeriod(params)
  const typeFilter = (params.type ?? 'all').toLowerCase()
  const supabase = getAdminDb()

  const [{ data: distributors }, { data: invoices }] = await Promise.all([
    supabase
      .from('distributors')
      .select(`id, business_name, ${DISTRIBUTOR_PROFILE}(full_name, email)`)
      .order('business_name'),
    supabase
      .from('invoices')
      .select(
        `id, invoice_number, customer_type, customer_name_snapshot, customer_email_snapshot, total_cents, subtotal_cents, tax_cents, shipping_cents, paid_at, status, distributor_id, ship_to_state, distributors(business_name, ${DISTRIBUTOR_PROFILE}(full_name, email))`,
      )
      .eq('status', 'paid')
      .is('refunded_at', null)
      .order('paid_at', { ascending: false })
      .limit(2000),
  ])

  const term = (params.q ?? '').trim().toLowerCase()
  const partnerId = (params.partner ?? '').trim()

  const filtered = (invoices ?? []).filter((inv) => {
    if (!inPaidWindow(inv.paid_at, fromIso, toIso)) return false
    if (partnerId && inv.distributor_id !== partnerId) return false
    if (typeFilter === 'retail' && inv.customer_type !== 'direct_to_customer') return false
    if (typeFilter === 'wholesale' && inv.customer_type !== 'retail_wholesale') return false
    if (!term) return true
    const dist = inv.distributors as {
      business_name?: string
      profiles?: Profile | Profile[]
    } | null
    const profile = Array.isArray(dist?.profiles) ? dist?.profiles[0] : dist?.profiles
    return partnerSearchHaystack([
      dist?.business_name,
      profile?.full_name,
      profile?.email,
      inv.customer_name_snapshot,
      inv.invoice_number,
    ]).includes(term)
  })

  const byPartner = new Map<
    string,
    {
      name: string
      retailCents: number
      wholesaleCents: number
      retailCount: number
      wholesaleCount: number
      invoices: typeof filtered
    }
  >()

  for (const inv of filtered) {
    const dist = inv.distributors as {
      business_name?: string
      profiles?: Profile | Profile[]
    } | null
    const profile = Array.isArray(dist?.profiles) ? dist?.profiles[0] : dist?.profiles
    const row = byPartner.get(inv.distributor_id) ?? {
      name: dist?.business_name?.trim() || profile?.full_name || 'Partner',
      retailCents: 0,
      wholesaleCents: 0,
      retailCount: 0,
      wholesaleCount: 0,
      invoices: [] as typeof filtered,
    }
    if (inv.customer_type === 'retail_wholesale') {
      row.wholesaleCents += inv.total_cents ?? 0
      row.wholesaleCount += 1
    } else {
      row.retailCents += inv.total_cents ?? 0
      row.retailCount += 1
    }
    row.invoices.push(inv)
    byPartner.set(inv.distributor_id, row)
  }

  const partnerRows = Array.from(byPartner.entries())
    .map(([id, row]) => ({ id, ...row }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const all = invoices ?? []
  const monthFrom = resolvePeriod({ period: 'month' }).fromIso
  const ytdFrom = resolvePeriod({ period: 'ytd' }).fromIso
  const sum = (list: typeof all) => list.reduce((s, i) => s + (i.total_cents ?? 0), 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl">Partner customer orders</h1>
        <p className="text-sm text-pe-brown mt-1">
          Paid customer invoices by Partner, split retail vs wholesale. Click an invoice for full
          detail.
        </p>
      </div>

      <SummaryCards
        items={[
          {
            label: 'This month',
            value: formatCurrency(sum(all.filter((i) => inPaidWindow(i.paid_at, monthFrom, null)))),
          },
          {
            label: 'YTD',
            value: formatCurrency(sum(all.filter((i) => inPaidWindow(i.paid_at, ytdFrom, null)))),
          },
          { label: 'Lifetime', value: formatCurrency(sum(all)) },
        ]}
      />

      <ReportFilters action="/admin/reports/customer-orders">
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
              const labelName =
                d.business_name?.trim() ||
                (profile as Profile | undefined)?.full_name ||
                'Partner'
              return (
                <option key={d.id} value={d.id}>
                  {labelName}
                </option>
              )
            })}
          </select>
        </FilterField>
        <FilterField label="Order type" name="type">
          <select id="type" name="type" defaultValue={typeFilter}>
            <option value="all">All</option>
            <option value="retail">Retail (DTC)</option>
            <option value="wholesale">Wholesale</option>
          </select>
        </FilterField>
        <FilterField label="Search" name="q">
          <input id="q" name="q" defaultValue={params.q ?? ''} placeholder="Customer or invoice #" />
        </FilterField>
        <FilterField label="From" name="from">
          <input id="from" name="from" type="date" defaultValue={params.from ?? ''} />
        </FilterField>
        <FilterField label="To" name="to">
          <input id="to" name="to" type="date" defaultValue={params.to ?? ''} />
        </FilterField>
      </ReportFilters>

      <p className="text-sm text-pe-brown">
        Filtered ({label}): {filtered.length} invoices ·{' '}
        {formatCurrency(filtered.reduce((s, i) => s + (i.total_cents ?? 0), 0))}
      </p>

      {partnerRows.map((p) => (
        <div key={p.id} className="border border-pe-beige bg-white rounded-sm overflow-hidden">
          <div className="bg-pe-cream p-3 flex flex-wrap gap-4 justify-between text-sm">
            <p className="font-medium">{p.name}</p>
            <div className="flex flex-wrap gap-4">
              <span>
                Retail: {p.retailCount} · {formatCurrency(p.retailCents)}
              </span>
              <span>
                Wholesale: {p.wholesaleCount} · {formatCurrency(p.wholesaleCents)}
              </span>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="text-left">
              <tr>
                <th className="p-2">Paid</th>
                <th className="p-2">Invoice</th>
                <th className="p-2">Customer</th>
                <th className="p-2">Type</th>
                <th className="p-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {p.invoices.map((inv) => (
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
                  <td className="p-2">{customerTypeLabel(inv.customer_type)}</td>
                  <td className="p-2">{formatCurrency(inv.total_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {!partnerRows.length && (
        <p className="text-sm text-pe-brown">No paid customer invoices match these filters.</p>
      )}
    </div>
  )
}
