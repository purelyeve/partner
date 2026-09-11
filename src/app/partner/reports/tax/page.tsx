import Link from 'next/link'
import { Card } from '@/components/ui'
import { requireDistributor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { inPaidWindow, resolvePeriod } from '@/lib/admin-reports'
import { formatCurrency, formatDate } from '@/lib/utils'

export default async function PartnerTaxByStatePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>
}) {
  const { distributor } = await requireDistributor()
  const params = await searchParams
  const { fromIso, toIso, period, label } = resolvePeriod(params)
  const supabase = await createClient()

  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, tax_cents, paid_at, ship_to_state, customer_name_snapshot')
    .eq('distributor_id', distributor.id)
    .eq('status', 'paid')
    .is('refunded_at', null)
    .gt('tax_cents', 0)
    .order('paid_at', { ascending: false })
    .limit(2000)

  const filtered = (invoices ?? []).filter((i) => inPaidWindow(i.paid_at, fromIso, toIso))
  const byState = new Map<string, { tax: number; count: number }>()
  for (const inv of filtered) {
    const state = (inv.ship_to_state || '—').toUpperCase()
    const row = byState.get(state) ?? { tax: 0, count: 0 }
    row.tax += inv.tax_cents ?? 0
    row.count += 1
    byState.set(state, row)
  }
  const stateRows = Array.from(byState.entries())
    .map(([state, row]) => ({ state, ...row }))
    .sort((a, b) => a.state.localeCompare(b.state))
  const totalTax = stateRows.reduce((s, r) => s + r.tax, 0)

  const csvQ = new URLSearchParams()
  if (params.period) csvQ.set('period', params.period)
  if (params.from) csvQ.set('from', params.from)
  if (params.to) csvQ.set('to', params.to)
  csvQ.set('kind', 'tax-by-state')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/partner/reports" className="text-sm text-pe-brown">
            ← Reports
          </Link>
          <h1 className="text-3xl mt-2">Tax collected by state</h1>
          <p className="text-sm text-pe-brown mt-1">
            Your sales tax totals by ship-to state ({label}). States appear after you collect tax on
            an order to that state.
          </p>
        </div>
        <Link
          href={`/partner/reports/export?${csvQ.toString()}`}
          className="inline-flex items-center px-4 py-2 text-sm bg-pe-dark-brown text-pe-cream rounded-sm hover:bg-pe-brown"
        >
          Export report
        </Link>
      </div>

      <Card>
        <p className="text-xs uppercase tracking-wider text-pe-brown">Total tax ({label})</p>
        <p className="text-2xl font-serif mt-1">{formatCurrency(totalTax)}</p>
      </Card>

      <form
        method="get"
        className="border border-pe-beige bg-white rounded-sm p-4 grid sm:grid-cols-4 gap-3 items-end"
      >
        <div>
          <label htmlFor="period" className="text-xs uppercase tracking-wider text-pe-brown">
            Period
          </label>
          <select
            id="period"
            name="period"
            defaultValue={period === 'custom' ? 'custom' : period}
            className="mt-1 w-full"
          >
            <option value="month">Calendar month</option>
            <option value="ytd">Year to date</option>
            <option value="lifetime">Lifetime</option>
            <option value="custom">Custom dates</option>
          </select>
        </div>
        <div>
          <label htmlFor="from" className="text-xs uppercase tracking-wider text-pe-brown">
            From
          </label>
          <input
            id="from"
            name="from"
            type="date"
            defaultValue={params.from ?? ''}
            className="mt-1 w-full"
          />
        </div>
        <div>
          <label htmlFor="to" className="text-xs uppercase tracking-wider text-pe-brown">
            To
          </label>
          <input
            id="to"
            name="to"
            type="date"
            defaultValue={params.to ?? ''}
            className="mt-1 w-full"
          />
        </div>
        <button
          type="submit"
          className="inline-flex items-center justify-center px-4 py-2 text-sm bg-pe-gold text-white rounded-sm hover:bg-pe-brown"
        >
          Apply
        </button>
      </form>

      <div className="border border-pe-beige bg-white rounded-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-pe-cream text-left">
            <tr>
              <th className="p-3">State</th>
              <th className="p-3">Orders with tax</th>
              <th className="p-3">Tax collected</th>
            </tr>
          </thead>
          <tbody>
            {stateRows.map((r) => (
              <tr key={r.state} className="border-t border-pe-beige">
                <td className="p-3 font-medium">{r.state}</td>
                <td className="p-3">{r.count}</td>
                <td className="p-3">{formatCurrency(r.tax)}</td>
              </tr>
            ))}
            {!stateRows.length && (
              <tr>
                <td colSpan={3} className="p-3 text-pe-brown">
                  No tax collected in this range yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="border border-pe-beige bg-white rounded-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-pe-cream text-left">
            <tr>
              <th className="p-3">Paid</th>
              <th className="p-3">Invoice</th>
              <th className="p-3">Customer</th>
              <th className="p-3">State</th>
              <th className="p-3">Tax</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((inv) => (
              <tr key={inv.id} className="border-t border-pe-beige">
                <td className="p-3">{formatDate(inv.paid_at)}</td>
                <td className="p-3">
                  <Link href={`/partner/invoices/${inv.id}`} className="underline">
                    {inv.invoice_number}
                  </Link>
                </td>
                <td className="p-3">{inv.customer_name_snapshot}</td>
                <td className="p-3">{(inv.ship_to_state || '—').toUpperCase()}</td>
                <td className="p-3">{formatCurrency(inv.tax_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
