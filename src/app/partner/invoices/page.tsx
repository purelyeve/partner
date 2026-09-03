import Link from 'next/link'
import { Badge, Button } from '@/components/ui'
import { requireDistributor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import {
  customerTypeLabel,
  formatCurrency,
  formatDate,
  invoiceStatusLabel,
} from '@/lib/utils'

export default async function PartnerInvoicesPage() {
  const { distributor } = await requireDistributor()
  const supabase = await createClient()

  const { data: invoices } = await supabase
    .from('invoices')
    .select(
      'id, invoice_number, customer_name_snapshot, customer_type, status, total_cents, created_at, expires_at, paid_at, fulfilled_at, refunded_at',
    )
    .eq('distributor_id', distributor.id)
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/partner" className="text-sm">
            ← Dashboard
          </Link>
          <h1 className="text-3xl mt-2">Invoices</h1>
          <p className="text-sm text-pe-brown mt-1">
            Build invoices, quote shipping, and email a payment link. Expires after 30 days.
          </p>
        </div>
        <Link href="/partner/invoices/new">
          <Button>New invoice</Button>
        </Link>
      </div>

      {!invoices?.length ? (
        <p className="text-sm text-pe-brown">No invoices yet.</p>
      ) : (
        <div className="border border-pe-beige bg-white rounded-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-pe-cream text-left">
              <tr>
                <th className="p-3">Invoice</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Type</th>
                <th className="p-3">Status</th>
                <th className="p-3">Fulfillment</th>
                <th className="p-3">Total</th>
                <th className="p-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const isPaid = inv.status === 'paid' && !inv.refunded_at
                const fulfilled = Boolean(inv.fulfilled_at)
                return (
                  <tr key={inv.id} className="border-t border-pe-beige">
                    <td className="p-3">
                      <Link
                        href={`/partner/invoices/${inv.id}`}
                        className="font-medium hover:underline"
                      >
                        {inv.invoice_number}
                      </Link>
                    </td>
                    <td className="p-3">{inv.customer_name_snapshot}</td>
                    <td className="p-3">{customerTypeLabel(inv.customer_type)}</td>
                    <td className="p-3">
                      <Badge
                        tone={
                          inv.status === 'paid'
                            ? 'success'
                            : inv.status === 'expired' || inv.status === 'cancelled'
                              ? 'error'
                              : inv.status === 'sent'
                                ? 'gold'
                                : 'neutral'
                        }
                      >
                        {invoiceStatusLabel(inv.status)}
                      </Badge>
                    </td>
                    <td className="p-3">
                      {!isPaid ? (
                        <span className="text-pe-brown">—</span>
                      ) : (
                        <Link
                          href={`/partner/fulfillments/${inv.id}`}
                          className="underline"
                        >
                          {fulfilled ? 'Fulfilled' : 'Unfulfilled'}
                        </Link>
                      )}
                    </td>
                    <td className="p-3">{formatCurrency(inv.total_cents)}</td>
                    <td className="p-3">{formatDate(inv.created_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
