import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Alert, Badge, Button, Card } from '@/components/ui'
import { requireDistributor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import {
  customerTypeLabel,
  formatCurrency,
  formatDate,
  invoiceStatusLabel,
} from '@/lib/utils'
import {
  FulfillOrderButton,
  RefundOrderForm,
  ReprintLabelButton,
} from '../../orders/order-actions'

export default async function PartnerFulfillmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { distributor } = await requireDistributor()
  const { id } = await params
  const supabase = await createClient()

  const { data: invoice } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', id)
    .eq('distributor_id', distributor.id)
    .single()

  if (!invoice) notFound()
  if (invoice.status !== 'paid' && invoice.status !== 'cancelled') {
    notFound()
  }

  const { data: lines } = await supabase
    .from('invoice_line_items')
    .select('*')
    .eq('invoice_id', invoice.id)
    .order('sort_order')

  const pendingShip =
    invoice.status === 'paid' && !invoice.fulfilled_at && !invoice.refunded_at
  const shipped = Boolean(invoice.fulfilled_at) && !invoice.refunded_at
  const easypostReady = Boolean(
    distributor.easypost_use_company || distributor.easypost_api_key_last4,
  )

  return (
    <div className="space-y-6">
      <div>
        <Link href="/partner/fulfillments" className="text-sm">
          ← Fulfillments
        </Link>
        <h1 className="text-3xl mt-2">{invoice.invoice_number}</h1>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <Badge
            tone={
              invoice.refunded_at
                ? 'error'
                : shipped
                  ? 'success'
                  : pendingShip
                    ? 'gold'
                    : 'neutral'
            }
          >
            {invoice.refunded_at
              ? 'Refunded'
              : shipped
                ? 'Fulfilled'
                : pendingShip
                  ? 'Unfulfilled'
                  : invoiceStatusLabel(invoice.status)}
          </Badge>
          <span className="text-sm text-pe-brown">
            {customerTypeLabel(invoice.customer_type)}
          </span>
        </div>
      </div>

      {!easypostReady && pendingShip && (
        <Alert variant="warning">
          Enable EasyPost shipping under <Link href="/partner/payments">Payments</Link> before
          buying a customer label.
        </Alert>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <Card className="space-y-2 text-sm">
          <h2 className="text-lg">Customer</h2>
          <p className="font-medium">{invoice.customer_name_snapshot}</p>
          <p>{invoice.customer_email_snapshot}</p>
          {invoice.customer_phone_snapshot && <p>{invoice.customer_phone_snapshot}</p>}
        </Card>
        <Card className="space-y-2 text-sm">
          <h2 className="text-lg">Ship to</h2>
          <p>
            {invoice.ship_to_line1}
            {invoice.ship_to_line2 ? `, ${invoice.ship_to_line2}` : ''}
            <br />
            {invoice.ship_to_city}, {invoice.ship_to_state} {invoice.ship_to_postal_code}
          </p>
          <p className="pt-2">
            Service:{' '}
            {invoice.free_shipping
              ? 'Free shipping'
              : `${invoice.shipping_carrier} ${invoice.shipping_service}`}
          </p>
          {invoice.paid_at && <p>Paid: {formatDate(invoice.paid_at)}</p>}
          {invoice.fulfilled_at && <p>Shipped: {formatDate(invoice.fulfilled_at)}</p>}
          {invoice.tracking_code && <p>Tracking: {invoice.tracking_code}</p>}
          {invoice.refunded_at && <p>Refunded: {formatDate(invoice.refunded_at)}</p>}
        </Card>
      </div>

      <div className="border border-pe-beige bg-white rounded-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-pe-cream text-left">
            <tr>
              <th className="p-3">Item</th>
              <th className="p-3">Qty</th>
              <th className="p-3">Total</th>
            </tr>
          </thead>
          <tbody>
            {(lines ?? []).map((line) => (
              <tr key={line.id} className="border-t border-pe-beige">
                <td className="p-3">{line.name_snapshot}</td>
                <td className="p-3">{line.quantity}</td>
                <td className="p-3">{formatCurrency(line.line_total_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Card className="text-sm max-w-sm ml-auto space-y-1">
        <div className="flex justify-between">
          <span>Total</span>
          <span className="font-medium">{formatCurrency(invoice.total_cents)}</span>
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg">Packing list</h2>
        <p className="text-sm text-pe-brown">
          Print a packing list to include in the box with the customer order.
        </p>
        <Link href={`/partner/fulfillments/${invoice.id}/packing-list`} target="_blank">
          <Button type="button" variant="secondary">
            Print packing list
          </Button>
        </Link>
      </Card>

      {pendingShip && (
        <Card className="space-y-4">
          <h2 className="text-lg">Ship label</h2>
          <FulfillOrderButton invoiceId={invoice.id} />
        </Card>
      )}

      {shipped && (invoice.label_url || (invoice.label_urls?.length ?? 0) > 0) && (
        <Card className="space-y-4">
          <h2 className="text-lg">Label</h2>
          <ReprintLabelButton invoiceId={invoice.id} />
        </Card>
      )}

      {invoice.status === 'paid' && !invoice.refunded_at && (
        <Card className="space-y-4">
          <h2 className="text-lg">Refund / cancel paid order</h2>
          <RefundOrderForm invoiceId={invoice.id} />
        </Card>
      )}

      <p className="text-sm">
        <Link href={`/partner/invoices/${invoice.id}`}>View invoice details</Link>
      </p>
    </div>
  )
}
