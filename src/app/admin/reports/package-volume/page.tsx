import { getAdminDb } from '@/lib/admin'
import { requireAdmin } from '@/lib/auth'
import { DISTRIBUTOR_PROFILE } from '@/lib/constants'
import { inPaidWindow, partnerSearchHaystack, resolvePeriod } from '@/lib/admin-reports'
import { formatCurrency } from '@/lib/utils'
import type { Profile } from '@/lib/types'
import { FilterField, ReportFilters, SummaryCards } from '../report-ui'

export default async function PackageVolumeReportPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    from?: string
    to?: string
    period?: string
    package?: string
  }>
}) {
  await requireAdmin()
  const params = await searchParams
  const { fromIso, toIso, period, label } = resolvePeriod(params)
  const supabase = getAdminDb()

  const [{ data: packages }, { data: orders }] = await Promise.all([
    supabase
      .from('inventory_packages')
      .select('id, name, sku, unit_count, active')
      .order('unit_count', { ascending: true }),
    supabase
      .from('package_orders')
      .select(
        `id, paid_at, total_cents, quantity, unit_count_snapshot, name_snapshot, sku_snapshot, package_id, distributor_id, distributors(business_name, ${DISTRIBUTOR_PROFILE}(full_name, email))`,
      )
      .in('status', ['paid', 'fulfilled'])
      .limit(2000),
  ])

  const term = (params.q ?? '').trim().toLowerCase()
  const packageFilter = (params.package ?? '').trim()

  const filtered = (orders ?? []).filter((o) => {
    if (!inPaidWindow(o.paid_at, fromIso, toIso)) return false
    if (packageFilter) {
      if (packageFilter.startsWith('sku:')) {
        if (o.sku_snapshot !== packageFilter.slice(4)) return false
      } else if (o.package_id !== packageFilter && o.sku_snapshot !== packageFilter) {
        return false
      }
    }
    if (!term) return true
    const dist = o.distributors as {
      business_name?: string
      profiles?: Profile | Profile[]
    } | null
    const profile = Array.isArray(dist?.profiles) ? dist?.profiles[0] : dist?.profiles
    return partnerSearchHaystack([
      dist?.business_name,
      profile?.full_name,
      profile?.email,
      o.name_snapshot,
      o.sku_snapshot,
    ]).includes(term)
  })

  const bySku = new Map<
    string,
    { name: string; sku: string; units: number; orders: number; cents: number }
  >()
  for (const o of filtered) {
    const sku = o.sku_snapshot || 'unknown'
    const row = bySku.get(sku) ?? {
      name: o.name_snapshot || sku,
      sku,
      units: 0,
      orders: 0,
      cents: 0,
    }
    row.units += (o.unit_count_snapshot ?? 0) * (o.quantity ?? 1)
    row.orders += 1
    row.cents += o.total_cents ?? 0
    bySku.set(sku, row)
  }

  const packageRows = Array.from(bySku.values()).sort((a, b) => a.name.localeCompare(b.name))
  const totalUnits = packageRows.reduce((s, r) => s + r.units, 0)
  const totalCents = packageRows.reduce((s, r) => s + r.cents, 0)

  // Also compute month / YTD / lifetime cards from full paid set
  const monthFrom = resolvePeriod({ period: 'month' }).fromIso
  const ytdFrom = resolvePeriod({ period: 'ytd' }).fromIso
  const allPaid = orders ?? []
  const sumUnits = (list: typeof allPaid) =>
    list.reduce((s, o) => s + (o.unit_count_snapshot ?? 0) * (o.quantity ?? 1), 0)
  const monthUnits = sumUnits(allPaid.filter((o) => inPaidWindow(o.paid_at, monthFrom, null)))
  const ytdUnits = sumUnits(allPaid.filter((o) => inPaidWindow(o.paid_at, ytdFrom, null)))
  const lifetimeUnits = sumUnits(allPaid)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl">Company-wide package volume</h1>
        <p className="text-sm text-pe-brown mt-1">
          Inventory packages sold network-wide. New packages appear in the filter automatically.
        </p>
      </div>

      <SummaryCards
        items={[
          { label: 'This month (units)', value: String(monthUnits) },
          { label: 'YTD (units)', value: String(ytdUnits) },
          { label: 'Lifetime (units)', value: String(lifetimeUnits) },
        ]}
      />

      <ReportFilters action="/admin/reports/package-volume">
        <FilterField label="Period" name="period">
          <select id="period" name="period" defaultValue={period === 'custom' ? 'custom' : period}>
            <option value="month">Calendar month</option>
            <option value="ytd">Year to date</option>
            <option value="lifetime">Lifetime</option>
            <option value="custom">Custom dates</option>
          </select>
        </FilterField>
        <FilterField label="Partner" name="q">
          <input id="q" name="q" defaultValue={params.q ?? ''} placeholder="Name or email" />
        </FilterField>
        <FilterField label="Package" name="package">
          <select id="package" name="package" defaultValue={packageFilter}>
            <option value="">All packages</option>
            {(packages ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.unit_count} units){!p.active ? ' — inactive' : ''}
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

      <p className="text-sm text-pe-brown">
        Filtered view ({label}): {filtered.length} orders · {totalUnits} units ·{' '}
        {formatCurrency(totalCents)}
      </p>

      <div className="border border-pe-beige bg-white rounded-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-pe-cream text-left">
            <tr>
              <th className="p-3">Package</th>
              <th className="p-3">SKU</th>
              <th className="p-3">Orders</th>
              <th className="p-3">Units</th>
              <th className="p-3">Volume</th>
            </tr>
          </thead>
          <tbody>
            {packageRows.map((r) => (
              <tr key={r.sku} className="border-t border-pe-beige">
                <td className="p-3">{r.name}</td>
                <td className="p-3">{r.sku}</td>
                <td className="p-3">{r.orders}</td>
                <td className="p-3">{r.units}</td>
                <td className="p-3">{formatCurrency(r.cents)}</td>
              </tr>
            ))}
            {!packageRows.length && (
              <tr>
                <td colSpan={5} className="p-3 text-pe-brown">
                  No package sales in this range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
