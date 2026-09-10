import Link from 'next/link'
import { Card } from '@/components/ui'
import { requireDistributor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { inPaidWindow, resolvePeriod } from '@/lib/admin-reports'
import { customerTypeLabel, formatCurrency, formatDate } from '@/lib/utils'

export default async function PartnerReportsPage({
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
    .select(
      'id, invoice_number, customer_type, customer_name_snapshot, total_cents, subtotal_cents, tax_cents, shipping_cents, paid_at, ship_to_state',
    )
    .eq('distributor_id', distributor.id)
    .eq('status', 'paid')
    .is('refunded_at', null)
    .order('paid_at', { ascending: false })
    .limit(2000)

  const all = invoices ?? []
  const filtered = all.filter((i) => inPaidWindow(i.paid_at, fromIso, toIso))
  const monthFrom = resolvePeriod({ period: 'month' }).fromIso
  const ytdFrom = resolvePeriod({ period: 'ytd' }).fromIso
  const sum = (list: typeof all, key: 'total_cents' | 'tax_cents' | 'shipping_cents') =>
    list.reduce((s, i) => s + (i[key] ?? 0), 0)

  const csvQ = new URLSearchParams()
  if (params.period) csvQ.set('period', params.period)
  if (params.from) csvQ.set('from', params.from)
  if (params.to) csvQ.set('to', params.to)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl">Reports</h1>
          <p className="text-sm text-pe-brown mt-1">
            Your customer sales, tax collected, and order history.
          </p>
        </div>
        <Link
          href={`/partner/reports/export?${csvQ.toString()}`}
          className="inline-flex items-center px-4 py-2 text-sm bg-pe-gold text-white rounded-sm hover:bg-pe-brown"
        >
          Download CSV
        </Link>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <Card>
          <p className="text-xs uppercase tracking-wider text-pe-brown">This month</p>
          <p className="text-2xl font-serif mt-1">
            {formatCurrency(
              sum(all.filter((i) => inPaidWindow(i.paid_at, monthFrom, null)), 'total_cents'),
            )}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wider text-pe-brown">YTD</p>
          <p className="text-2xl font-serif mt-1">
            {formatCurrency(
              sum(all.filter((i) => inPaidWindow(i.paid_at, ytdFrom, null)), 'total_cents'),
            )}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wider text-pe-brown">Lifetime</p>
          <p className="text-2xl font-serif mt-1">{formatCurrency(sum(all, 'total_cents'))}</p>
        </Card>
      </div>

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

      <div className="grid sm:grid-cols-2 gap-4">
        <Card>
          <p className="text-xs uppercase tracking-wider text-pe-brown">Tax collected ({label})</p>
          <p className="text-2xl font-serif mt-1">{formatCurrency(sum(filtered, 'tax_cents'))}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wider text-pe-brown">
            Shipping collected ({label})
          </p>
          <p className="text-2xl font-serif mt-1">
            {formatCurrency(sum(filtered, 'shipping_cents'))}
          </p>
        </Card>
      </div>

      <div className="border border-pe-beige bg-white rounded-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-pe-cream text-left">
            <tr>
              <th className="p-3">Paid</th>
              <th className="p-3">Invoice</th>
              <th className="p-3">Customer</th>
              <th className="p-3">Type</th>
              <th className="p-3">Tax</th>
              <th className="p-3">Total</th>
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
                <td className="p-3">{customerTypeLabel(inv.customer_type)}</td>
                <td className="p-3">{formatCurrency(inv.tax_cents)}</td>
                <td className="p-3">{formatCurrency(inv.total_cents)}</td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={6} className="p-3 text-pe-brown">
                  No paid invoices in this range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
