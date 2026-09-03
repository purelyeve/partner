import Link from 'next/link'
import { requireDistributor } from '@/lib/auth'
import { getStripe } from '@/lib/stripe'
import { formatCurrency } from '@/lib/utils'
import { Card } from '@/components/ui'
import { createClient } from '@/lib/supabase/server'

export default async function PayoutReportPage() {
  const { distributor } = await requireDistributor()

  if (!distributor.stripe_account_id || !distributor.stripe_charges_enabled) {
    return (
      <div className="space-y-4 max-w-2xl">
        <Link href="/partner/payments" className="text-sm">
          ← Payments
        </Link>
        <h1 className="text-3xl">Payout report</h1>
        <p className="text-sm text-pe-brown">
          Connect Stripe and accept a payment first to see payout and fee detail.
        </p>
      </div>
    )
  }

  const stripe = getStripe()
  const supabase = await createClient()

  const { data: paidInvoices } = await supabase
    .from('invoices')
    .select(
      'id, invoice_number, total_cents, shipping_cents, tax_cents, paid_at, stripe_payment_intent_id, customer_name_snapshot, refunded_at',
    )
    .eq('distributor_id', distributor.id)
    .eq('status', 'paid')
    .order('paid_at', { ascending: false })
    .limit(50)

  let balanceTx: Array<{
    id: string
    type: string
    amount: number
    fee: number
    net: number
    description: string | null
    created: number
    source: string | null
  }> = []

  try {
    const txs = await stripe.balanceTransactions.list(
      { limit: 40 },
      { stripeAccount: distributor.stripe_account_id },
    )
    balanceTx = txs.data.map((t) => ({
      id: t.id,
      type: t.type,
      amount: t.amount,
      fee: t.fee,
      net: t.net,
      description: t.description,
      created: t.created,
      source: typeof t.source === 'string' ? t.source : t.source?.id ?? null,
    }))
  } catch (err) {
    console.error('[payout report]', err)
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/partner/payments" className="text-sm">
          ← Payments
        </Link>
        <h1 className="text-3xl mt-2">Payout &amp; fee breakdown</h1>
        <p className="text-sm text-pe-brown mt-1">
          Paid customer invoices plus Stripe balance activity (fees, payouts). The shipping your
          customer paid goes to Purely Eve to cover the postage on your label, so your share of each
          invoice is the product and tax total, less Stripe&apos;s processing fee.
        </p>
      </div>

      <Card className="space-y-3">
        <h2 className="text-lg">Paid invoices</h2>
        {!paidInvoices?.length ? (
          <p className="text-sm text-pe-brown">No paid invoices yet.</p>
        ) : (
          <div className="border border-pe-beige rounded-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-pe-cream text-left">
                <tr>
                  <th className="p-2">Invoice</th>
                  <th className="p-2">Customer</th>
                  <th className="p-2">Customer paid</th>
                  <th className="p-2">Shipping (covers postage)</th>
                  <th className="p-2">Tax</th>
                  <th className="p-2">Your share</th>
                  <th className="p-2">Paid</th>
                </tr>
              </thead>
              <tbody>
                {paidInvoices.map((inv) => (
                  <tr key={inv.id} className="border-t border-pe-beige">
                    <td className="p-2">
                      <Link href={`/partner/fulfillments/${inv.id}`}>{inv.invoice_number}</Link>
                    </td>
                    <td className="p-2">{inv.customer_name_snapshot}</td>
                    <td className="p-2">{formatCurrency(inv.total_cents)}</td>
                    <td className="p-2">−{formatCurrency(inv.shipping_cents)}</td>
                    <td className="p-2">{formatCurrency(inv.tax_cents)}</td>
                    <td className="p-2">
                      {formatCurrency(inv.total_cents - inv.shipping_cents)}
                    </td>
                    <td className="p-2">
                      {inv.paid_at ? new Date(inv.paid_at).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg">Stripe balance activity</h2>
        <p className="text-xs text-pe-brown">
          Charge rows show Stripe processing fees. Payout rows are transfers to your bank.
        </p>
        {!balanceTx.length ? (
          <p className="text-sm text-pe-brown">No balance transactions yet.</p>
        ) : (
          <div className="border border-pe-beige rounded-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-pe-cream text-left">
                <tr>
                  <th className="p-2">Date</th>
                  <th className="p-2">Type</th>
                  <th className="p-2">Gross</th>
                  <th className="p-2">Stripe fee</th>
                  <th className="p-2">Net</th>
                  <th className="p-2">Description</th>
                </tr>
              </thead>
              <tbody>
                {balanceTx.map((t) => (
                  <tr key={t.id} className="border-t border-pe-beige">
                    <td className="p-2">{new Date(t.created * 1000).toLocaleDateString()}</td>
                    <td className="p-2 capitalize">{t.type.replace(/_/g, ' ')}</td>
                    <td className="p-2">{formatCurrency(t.amount)}</td>
                    <td className="p-2">{formatCurrency(t.fee)}</td>
                    <td className="p-2">{formatCurrency(t.net)}</td>
                    <td className="p-2 text-pe-brown">{t.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
