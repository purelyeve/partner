import { getAdminDb } from '@/lib/admin'
import { requireAdmin } from '@/lib/auth'
import { DISTRIBUTOR_PROFILE } from '@/lib/constants'
import { inPaidWindow, resolvePeriod } from '@/lib/admin-reports'
import { formatCurrency } from '@/lib/utils'
import type { Profile } from '@/lib/types'
import { FilterField, ReportFilters, SummaryCards } from '../report-ui'

export default async function TaxReportPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string
    to?: string
    period?: string
    partner?: string
    state?: string
  }>
}) {
  await requireAdmin()
  const params = await searchParams
  const { fromIso, toIso, period, label } = resolvePeriod(params)
  const partnerId = (params.partner ?? '').trim()
  const stateFilter = (params.state ?? '').trim().toUpperCase()
  const supabase = getAdminDb()

  const [{ data: distributors }, { data: invoices }] = await Promise.all([
    supabase
      .from('distributors')
      .select(`id, business_name, ${DISTRIBUTOR_PROFILE}(full_name)`)
      .order('business_name'),
    supabase
      .from('invoices')
      .select(
        `id, tax_cents, paid_at, ship_to_state, distributor_id, customer_type, distributors(business_name, ${DISTRIBUTOR_PROFILE}(full_name))`,
      )
      .eq('status', 'paid')
      .is('refunded_at', null)
      .gt('tax_cents', 0)
      .limit(5000),
  ])

  const all = invoices ?? []
  const monthFrom = resolvePeriod({ period: 'month' }).fromIso
  const ytdFrom = resolvePeriod({ period: 'ytd' }).fromIso
  const sumTax = (list: typeof all) => list.reduce((s, i) => s + (i.tax_cents ?? 0), 0)

  const filtered = all.filter((inv) => {
    if (!inPaidWindow(inv.paid_at, fromIso, toIso)) return false
    if (partnerId && inv.distributor_id !== partnerId) return false
    if (stateFilter && (inv.ship_to_state || '').toUpperCase() !== stateFilter) return false
    return true
  })

  const states = Array.from(
    new Set(all.map((i) => (i.ship_to_state || '').toUpperCase()).filter(Boolean)),
  ).sort()

  type Cell = { tax: number; count: number }
  const matrix = new Map<string, Map<string, Cell>>()
  const partnerNames = new Map<string, string>()

  for (const inv of filtered) {
    const dist = inv.distributors as {
      business_name?: string
      profiles?: Profile | Profile[]
    } | null
    const profile = Array.isArray(dist?.profiles) ? dist?.profiles[0] : dist?.profiles
    const name = dist?.business_name?.trim() || profile?.full_name || 'Partner'
    partnerNames.set(inv.distributor_id, name)
    const state = (inv.ship_to_state || '—').toUpperCase()
    if (!matrix.has(inv.distributor_id)) matrix.set(inv.distributor_id, new Map())
    const byState = matrix.get(inv.distributor_id)!
    const cell = byState.get(state) ?? { tax: 0, count: 0 }
    cell.tax += inv.tax_cents ?? 0
    cell.count += 1
    byState.set(state, cell)
  }

  const partnerIds = Array.from(matrix.keys()).sort((a, b) =>
    (partnerNames.get(a) || '').localeCompare(partnerNames.get(b) || ''),
  )
  const colStates = Array.from(
    new Set(
      filtered.map((i) => (i.ship_to_state || '—').toUpperCase()).filter(Boolean),
    ),
  ).sort()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl">Tax collected</h1>
        <p className="text-sm text-pe-brown mt-1">
          Sales tax on paid customer invoices, by Partner and ship-to state.
        </p>
      </div>

      <SummaryCards
        items={[
          {
            label: 'This month',
            value: formatCurrency(
              sumTax(all.filter((i) => inPaidWindow(i.paid_at, monthFrom, null))),
            ),
          },
          {
            label: 'YTD',
            value: formatCurrency(sumTax(all.filter((i) => inPaidWindow(i.paid_at, ytdFrom, null)))),
          },
          {
            label: `Filtered (${label})`,
            value: formatCurrency(sumTax(filtered)),
          },
        ]}
      />

      <ReportFilters action="/admin/reports/tax">
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
        <FilterField label="State" name="state">
          <select id="state" name="state" defaultValue={stateFilter}>
            <option value="">All states</option>
            {states.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="From" name="from">
          <input id="from" name="from" type="date" defaultValue={params.from ?? ''} />
        </FilterField>
        <FilterField label="To" name="to">
          <input id="to" name="to" type="date" defaultValue={params.to ?? ''} />
        </FilterField>
      </ReportFilters>

      <div className="border border-pe-beige bg-white rounded-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-pe-cream text-left">
            <tr>
              <th className="p-3">Partner</th>
              {colStates.map((s) => (
                <th key={s} className="p-3">
                  {s}
                </th>
              ))}
              <th className="p-3">Total</th>
            </tr>
          </thead>
          <tbody>
            {partnerIds.map((pid) => {
              const byState = matrix.get(pid)!
              const total = Array.from(byState.values()).reduce((s, c) => s + c.tax, 0)
              return (
                <tr key={pid} className="border-t border-pe-beige">
                  <td className="p-3 font-medium">{partnerNames.get(pid)}</td>
                  {colStates.map((s) => (
                    <td key={s} className="p-3">
                      {byState.get(s) ? formatCurrency(byState.get(s)!.tax) : '—'}
                    </td>
                  ))}
                  <td className="p-3">{formatCurrency(total)}</td>
                </tr>
              )
            })}
            {!partnerIds.length && (
              <tr>
                <td colSpan={colStates.length + 2} className="p-3 text-pe-brown">
                  No tax collected in this range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
