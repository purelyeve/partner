import Link from 'next/link'
import { requireDistributor } from '@/lib/auth'
import { getStripe } from '@/lib/stripe'
import { formatCurrency } from '@/lib/utils'
import { Card } from '@/components/ui'
import { createClient } from '@/lib/supabase/server'

type FeeDetail = { type: string; amount: number; description: string | null }

export default async function PayoutReportPage() {
  const { distributor } = await requireDistributor()

  if (!distributor.stripe_account_id || !distributor.stripe_charges_enabled) {
    return (
      <div className="space-y-4 max-w-2xl">
        <Link href="/partner/payments" className="text-sm">
          ← Payouts &amp; Reports
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
    stripeFee: number
    applicationFee: number
    otherFee: number
    description: string | null
    created: number
    source: string | null
  }> = []

  try {
    const txs = await stripe.balanceTransactions.list(
      { limit: 40, expand: ['data.source'] },
      { stripeAccount: distributor.stripe_account_id },
    )
    balanceTx = txs.data.map((t) => {
      const details = (t.fee_details ?? []) as FeeDetail[]
      const stripeFee = details
        .filter((d) => d.type === 'stripe_fee')
        .reduce((sum, d) => sum + d.amount, 0)
      const applicationFee = details
        .filter((d) => d.type === 'application_fee')
        .reduce((sum, d) => sum + d.amount, 0)
      const otherFee = Math.max(0, t.fee - stripeFee - applicationFee)
      return {
        id: t.id,
        type: t.type,
        amount: t.amount,
        fee: t.fee,
        net: t.net,
        stripeFee,
        applicationFee,
        otherFee,
        description: t.description,
        created: t.created,
        source: typeof t.source === 'string' ? t.source : t.source?.id ?? null,
      }
    })
  } catch (err) {
    console.error('[payout report]', err)
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/partner/payments" className="text-sm">
          ← Payouts &amp; Reports
        </Link>
        <h1 className="text-3xl mt-2">Payout &amp; fee breakdown</h1>
        <p className="text-sm text-pe-brown mt-1">
          How each paid invoice becomes your Stripe balance. Shipping goes to Purely Eve for postage.
          Stripe&apos;s card fee (2.9% + $0.30) comes out of your product + tax share.
        </p>
      </div>

      <Card className="space-y-3">
        <h2 className="text-lg">Paid invoices</h2>
        <p className="text-xs text-pe-brown">
          Est. Stripe fee uses the standard U.S. card rate (2.9% + $0.30) on the full customer charge.
          Your estimated net is product + tax − that fee.
        </p>
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
                  <th className="p-2">Shipping → company</th>
                  <th className="p-2">Product + tax</th>
                  <th className="p-2">Est. Stripe fee</th>
                  <th className="p-2">Est. your net</th>
                  <th className="p-2">Paid</th>
                </tr>
              </thead>
              <tbody>
                {paidInvoices.map((inv) => {
                  const productTax = inv.total_cents - inv.shipping_cents
                  // Stripe fees the full charge amount on the connected account.
                  const estStripeFee = Math.round(inv.total_cents * 0.029) + 30
                  const estNet = productTax - estStripeFee
                  return (
                    <tr key={inv.id} className="border-t border-pe-beige">
                      <td className="p-2">
                        <Link href={`/partner/fulfillments/${inv.id}`}>{inv.invoice_number}</Link>
                      </td>
                      <td className="p-2">{inv.customer_name_snapshot}</td>
                      <td className="p-2">{formatCurrency(inv.total_cents)}</td>
                      <td className="p-2">−{formatCurrency(inv.shipping_cents)}</td>
                      <td className="p-2">{formatCurrency(productTax)}</td>
                      <td className="p-2">−{formatCurrency(estStripeFee)}</td>
                      <td className="p-2">{formatCurrency(estNet)}</td>
                      <td className="p-2">
                        {inv.paid_at ? new Date(inv.paid_at).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg">Stripe balance activity</h2>
        <p className="text-xs text-pe-brown">
          On charge rows, Stripe often shows one combined fee. We split it: Stripe processing vs
          shipping passed to Purely Eve (application fee). Net is what stays in your Connect balance.
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
                  <th className="p-2">Shipping → company</th>
                  <th className="p-2">Net to you</th>
                  <th className="p-2">Description</th>
                </tr>
              </thead>
              <tbody>
                {balanceTx.map((t) => {
                  const isChargeLike = t.type === 'charge' || t.type === 'payment'
                  return (
                    <tr key={t.id} className="border-t border-pe-beige">
                      <td className="p-2">{new Date(t.created * 1000).toLocaleDateString()}</td>
                      <td className="p-2 capitalize">{t.type.replace(/_/g, ' ')}</td>
                      <td className="p-2">{formatCurrency(t.amount)}</td>
                      <td className="p-2">
                        {isChargeLike
                          ? formatCurrency(t.stripeFee || (t.applicationFee ? 0 : t.fee))
                          : formatCurrency(t.fee)}
                      </td>
                      <td className="p-2">
                        {isChargeLike && t.applicationFee > 0
                          ? formatCurrency(t.applicationFee)
                          : '—'}
                      </td>
                      <td className="p-2">{formatCurrency(t.net)}</td>
                      <td className="p-2 text-pe-brown">{t.description || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="text-sm text-pe-brown space-y-2">
        <h2 className="text-lg text-pe-dark-brown">Example from a $185.34 order</h2>
        <p>
          Customer paid $185.34. Shipping $6.44 goes to Purely Eve. Product + tax left for you:
          $178.90. Stripe&apos;s fee on the $185.34 charge is about $5.67 (2.9% + $0.30). Your net is
          about $173.23 — which matches Stripe&apos;s balance row. The old report showed $12.11 as
          one &quot;Stripe fee&quot; because it combined the $5.67 processing fee with the $6.44
          shipping transfer.
        </p>
      </Card>
    </div>
  )
}
