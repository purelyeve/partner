import { getAdminDb } from '@/lib/admin'
import { requireAdmin } from '@/lib/auth'
import { inPaidWindow, resolvePeriod } from '@/lib/admin-reports'
import { formatCurrency } from '@/lib/utils'
import { FilterField, ReportFilters, SummaryCards } from '../report-ui'

export default async function CustomerVolumeReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; period?: string; type?: string }>
}) {
  await requireAdmin()
  const params = await searchParams
  const { fromIso, toIso, period, label } = resolvePeriod(params)
  const typeFilter = (params.type ?? 'all').toLowerCase()
  const supabase = getAdminDb()

  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, customer_type, total_cents, subtotal_cents, paid_at, status, refunded_at')
    .eq('status', 'paid')
    .is('refunded_at', null)
    .limit(5000)

  const all = invoices ?? []
  const monthFrom = resolvePeriod({ period: 'month' }).fromIso
  const ytdFrom = resolvePeriod({ period: 'ytd' }).fromIso
  const sum = (list: typeof all) => list.reduce((s, i) => s + (i.total_cents ?? 0), 0)
  const sumSub = (list: typeof all) => list.reduce((s, i) => s + (i.subtotal_cents ?? 0), 0)

  const filtered = all.filter((inv) => {
    if (!inPaidWindow(inv.paid_at, fromIso, toIso)) return false
    if (typeFilter === 'retail' && inv.customer_type !== 'direct_to_customer') return false
    if (typeFilter === 'wholesale' && inv.customer_type !== 'retail_wholesale') return false
    return true
  })

  const retail = filtered.filter((i) => i.customer_type === 'direct_to_customer')
  const wholesale = filtered.filter((i) => i.customer_type === 'retail_wholesale')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl">Company-wide customer volume</h1>
        <p className="text-sm text-pe-brown mt-1">
          All Partner customer sales. Inventory package purchases are excluded.
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

      <ReportFilters action="/admin/reports/customer-volume">
        <FilterField label="Period" name="period">
          <select id="period" name="period" defaultValue={period === 'custom' ? 'custom' : period}>
            <option value="month">Calendar month</option>
            <option value="ytd">Year to date</option>
            <option value="lifetime">Lifetime</option>
            <option value="custom">Custom dates</option>
          </select>
        </FilterField>
        <FilterField label="Type" name="type">
          <select id="type" name="type" defaultValue={typeFilter}>
            <option value="all">All</option>
            <option value="retail">Retail (DTC)</option>
            <option value="wholesale">Wholesale</option>
          </select>
        </FilterField>
        <FilterField label="From" name="from">
          <input id="from" name="from" type="date" defaultValue={params.from ?? ''} />
        </FilterField>
        <FilterField label="To" name="to">
          <input id="to" name="to" type="date" defaultValue={params.to ?? ''} />
        </FilterField>
      </ReportFilters>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="border border-pe-beige bg-white rounded-sm p-4">
          <p className="text-xs uppercase tracking-wider text-pe-brown">Retail ({label})</p>
          <p className="text-2xl font-serif mt-1">{formatCurrency(sum(retail))}</p>
          <p className="text-sm text-pe-brown mt-1">
            {retail.length} orders · product {formatCurrency(sumSub(retail))}
          </p>
        </div>
        <div className="border border-pe-beige bg-white rounded-sm p-4">
          <p className="text-xs uppercase tracking-wider text-pe-brown">Wholesale ({label})</p>
          <p className="text-2xl font-serif mt-1">{formatCurrency(sum(wholesale))}</p>
          <p className="text-sm text-pe-brown mt-1">
            {wholesale.length} orders · product {formatCurrency(sumSub(wholesale))}
          </p>
        </div>
      </div>
    </div>
  )
}
