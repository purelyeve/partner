import Link from 'next/link'
import { Card } from '@/components/ui'
import { getAdminDb } from '@/lib/admin'
import { requireAdmin } from '@/lib/auth'
import { getPlatformBalanceSummary } from '@/lib/stripe-connect'
import { getStripe } from '@/lib/stripe'
import { inPaidWindow, resolvePeriod } from '@/lib/admin-reports'
import { formatCurrency, formatDate } from '@/lib/utils'
import { FilterField, ReportFilters, SummaryCards } from '../report-ui'

type FeeDetail = { type: string; amount: number; description: string | null }

export default async function CompanyStripeReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; period?: string }>
}) {
  await requireAdmin()
  const params = await searchParams
  const { fromIso, toIso, period, label } = resolvePeriod(params)
  const supabase = getAdminDb()
  const stripe = getStripe()

  const [balance, { data: invoices }, { data: packageOrders }] = await Promise.all([
    getPlatformBalanceSummary(),
    supabase
      .from('invoices')
      .select('id, invoice_number, shipping_cents, total_cents, paid_at, refunded_at, status')
      .eq('status', 'paid')
      .is('refunded_at', null)
      .limit(2000),
    supabase
      .from('package_orders')
      .select('id, order_number, total_cents, paid_at, status')
      .in('status', ['paid', 'fulfilled'])
      .limit(2000),
  ])

  const paidInvoices = (invoices ?? []).filter((i) => inPaidWindow(i.paid_at, fromIso, toIso))
  const paidPackages = (packageOrders ?? []).filter((o) => inPaidWindow(o.paid_at, fromIso, toIso))

  const shippingCollected = paidInvoices.reduce((s, i) => s + (i.shipping_cents ?? 0), 0)
  const packageVolume = paidPackages.reduce((s, o) => s + (o.total_cents ?? 0), 0)

  let applicationFeeCents = 0
  let stripeFeeOnPlatform = 0
  let balanceTx: Array<{
    id: string
    type: string
    amount: number
    fee: number
    net: number
    description: string | null
    created: number
  }> = []
  let payouts: Array<{
    id: string
    amount: number
    status: string
    arrival_date: number
    created: number
  }> = []

  try {
    const txs = await stripe.balanceTransactions.list({ limit: 50 })
    balanceTx = txs.data.map((t) => {
      const details = (t.fee_details ?? []) as FeeDetail[]
      const appFee = details
        .filter((d) => d.type === 'application_fee')
        .reduce((sum, d) => sum + d.amount, 0)
      // Application fee credit to platform shows as type application_fee with positive amount
      if (t.type === 'application_fee') applicationFeeCents += t.amount
      stripeFeeOnPlatform += details
        .filter((d) => d.type === 'stripe_fee')
        .reduce((sum, d) => sum + d.amount, 0)
      void appFee
      return {
        id: t.id,
        type: t.type,
        amount: t.amount,
        fee: t.fee,
        net: t.net,
        description: t.description,
        created: t.created,
      }
    })
    const po = await stripe.payouts.list({ limit: 10 })
    payouts = po.data.map((p) => ({
      id: p.id,
      amount: p.amount,
      status: p.status,
      arrival_date: p.arrival_date,
      created: p.created,
    }))
  } catch (err) {
    console.error('[admin stripe report]', err)
  }

  // Prefer DB shipping sum for the period (authoritative for "shipping collected")
  const shippingDisplay = shippingCollected

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl">Company Stripe</h1>
        <p className="text-sm text-pe-brown mt-1">
          Platform account balance, shipping application fees from Partner checkouts, inventory
          package sales on the company account, and recent payouts.
        </p>
      </div>

      <SummaryCards
        items={[
          {
            label: 'Available',
            value: balance ? formatCurrency(balance.availableCents) : '—',
          },
          {
            label: 'Pending',
            value: balance ? formatCurrency(balance.pendingCents) : '—',
          },
          {
            label: `Shipping collected (${label})`,
            value: formatCurrency(shippingDisplay),
          },
        ]}
      />

      <div className="grid sm:grid-cols-2 gap-4">
        <Card className="space-y-1">
          <p className="text-xs uppercase tracking-wider text-pe-brown">
            Inventory packages ({label})
          </p>
          <p className="text-2xl font-serif">{formatCurrency(packageVolume)}</p>
          <p className="text-sm text-pe-brown">{paidPackages.length} paid orders</p>
        </Card>
        <Card className="space-y-1">
          <p className="text-xs uppercase tracking-wider text-pe-brown">
            App fees in recent Stripe txs
          </p>
          <p className="text-2xl font-serif">{formatCurrency(applicationFeeCents)}</p>
          <p className="text-sm text-pe-brown">
            Platform Stripe fees in those txs: {formatCurrency(stripeFeeOnPlatform)}
          </p>
        </Card>
      </div>

      <ReportFilters action="/admin/reports/stripe">
        <FilterField label="Period" name="period">
          <select id="period" name="period" defaultValue={period === 'custom' ? 'custom' : period}>
            <option value="month">Calendar month</option>
            <option value="ytd">Year to date</option>
            <option value="lifetime">Lifetime</option>
            <option value="custom">Custom dates</option>
          </select>
        </FilterField>
        <FilterField label="From" name="from">
          <input id="from" name="from" type="date" defaultValue={params.from ?? ''} />
        </FilterField>
        <FilterField label="To" name="to">
          <input id="to" name="to" type="date" defaultValue={params.to ?? ''} />
        </FilterField>
      </ReportFilters>

      <Card className="space-y-3">
        <h2 className="text-lg">Recent platform balance transactions</h2>
        {!balanceTx.length ? (
          <p className="text-sm text-pe-brown">No transactions loaded (check Stripe keys).</p>
        ) : (
          <div className="overflow-x-auto border border-pe-beige rounded-sm">
            <table className="w-full text-sm">
              <thead className="bg-pe-cream text-left">
                <tr>
                  <th className="p-2">Date</th>
                  <th className="p-2">Type</th>
                  <th className="p-2">Amount</th>
                  <th className="p-2">Fee</th>
                  <th className="p-2">Net</th>
                  <th className="p-2">Description</th>
                </tr>
              </thead>
              <tbody>
                {balanceTx.map((t) => (
                  <tr key={t.id} className="border-t border-pe-beige">
                    <td className="p-2">{formatDate(new Date(t.created * 1000).toISOString())}</td>
                    <td className="p-2">{t.type}</td>
                    <td className="p-2">{formatCurrency(t.amount)}</td>
                    <td className="p-2">{formatCurrency(t.fee)}</td>
                    <td className="p-2">{formatCurrency(t.net)}</td>
                    <td className="p-2">{t.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg">Recent platform payouts</h2>
        {!payouts.length ? (
          <p className="text-sm text-pe-brown">No payouts yet.</p>
        ) : (
          <div className="overflow-x-auto border border-pe-beige rounded-sm">
            <table className="w-full text-sm">
              <thead className="bg-pe-cream text-left">
                <tr>
                  <th className="p-2">Created</th>
                  <th className="p-2">Amount</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Arrival</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p.id} className="border-t border-pe-beige">
                    <td className="p-2">{formatDate(new Date(p.created * 1000).toISOString())}</td>
                    <td className="p-2">{formatCurrency(p.amount)}</td>
                    <td className="p-2">{p.status}</td>
                    <td className="p-2">
                      {formatDate(new Date(p.arrival_date * 1000).toISOString())}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-pe-brown">
          Full ledger detail also lives in your{' '}
          <Link
            href="https://dashboard.stripe.com"
            className="underline"
            target="_blank"
            rel="noreferrer"
          >
            Stripe Dashboard
          </Link>
          .
        </p>
      </Card>
    </div>
  )
}
