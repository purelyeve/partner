import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Alert, Badge, Card } from '@/components/ui'
import { requireDistributor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  customerTypeLabel,
  formatCurrency,
  formatDate,
  invoiceStatusLabel,
} from '@/lib/utils'
import { appUrl } from '@/lib/email'
import ResendInvoiceButton from '../resend-button'
import CancelUnpaidButton from '../cancel-unpaid-button'
import DeleteInvoiceButton from '../delete-invoice-button'
import { RefundOrderForm } from '../../orders/order-actions'

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ mailError?: string }>
}) {
  const { distributor } = await requireDistributor()
  const { id } = await params
  const { mailError } = await searchParams
  const supabase = await createClient()

  const { data: invoice } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', id)
    .eq('distributor_id', distributor.id)
    .single()

  if (!invoice) notFound()

  if (
    invoice.expires_at &&
    new Date(invoice.expires_at) < new Date() &&
    invoice.status === 'sent'
  ) {
    const admin = createAdminClient()
    await admin.from('invoices').update({ status: 'expired' }).eq('id', invoice.id)
    invoice.status = 'expired'
  }

  const { data: lines } = await supabase
    .from('invoice_line_items')
    .select('*')
    .eq('invoice_id', invoice.id)
    .order('sort_order')

  const payUrl = `${appUrl()}/pay/${invoice.public_token}`
  const canResend = ['draft', 'sent', 'expired'].includes(invoice.status)

  return (
    <div className="space-y-6">
      {mailError && (
        <Alert variant="error">
          Invoice was saved, but the customer email did not send: {mailError}. Use Email / resend
          below after checking Resend (domain + API key on Vercel).
        </Alert>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/partner/invoices" className="text-sm">
            ← Invoices
          </Link>
          <h1 className="text-3xl mt-2">{invoice.invoice_number}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Badge
              tone={
                invoice.status === 'paid'
                  ? 'success'
                  : invoice.status === 'expired' || invoice.status === 'cancelled'
                    ? 'error'
                    : invoice.status === 'sent'
                      ? 'gold'
                      : 'neutral'
              }
            >
              {invoiceStatusLabel(invoice.status)}
            </Badge>
            <span className="text-sm text-pe-brown">
              {customerTypeLabel(invoice.customer_type)}
            </span>
          </div>
        </div>
        {canResend && <ResendInvoiceButton invoiceId={invoice.id} />}
      </div>

      {invoice.status === 'paid' && (
        <Alert variant="success">
          Paid.{' '}
          <Link href={`/partner/fulfillments/${invoice.id}`}>Open fulfillment / refund →</Link>
        </Alert>
      )}

      {invoice.status === 'paid' && !invoice.refunded_at && (
        <Card className="space-y-4">
          <h2 className="text-lg">Refund / cancel paid order</h2>
          <p className="text-sm text-pe-brown">
            Refunds the customer through Stripe and restores inventory. You can also do this from
            Fulfillments.
          </p>
          <RefundOrderForm invoiceId={invoice.id} />
        </Card>
      )}

      {invoice.status === 'cancelled' && invoice.refunded_at && (
        <Alert variant="info">
          Refunded / cancelled. Stock restored if it had been deducted.{' '}
          <Link href={`/partner/fulfillments/${invoice.id}`}>View order →</Link>
        </Alert>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <Card className="space-y-2 text-sm">
          <h2 className="text-lg">Sold by</h2>
          <p className="font-medium">
            {invoice.seller_name_snapshot || 'Partner'}
          </p>
          {invoice.seller_email_snapshot && <p>{invoice.seller_email_snapshot}</p>}
          {invoice.seller_phone_snapshot && <p>{invoice.seller_phone_snapshot}</p>}
        </Card>
        <Card className="space-y-2 text-sm">
          <h2 className="text-lg">Bill to</h2>
          <p className="font-medium">{invoice.customer_name_snapshot}</p>
          <p>{invoice.customer_email_snapshot}</p>
          {invoice.customer_phone_snapshot && <p>{invoice.customer_phone_snapshot}</p>}
          <p className="text-pe-brown">
            {invoice.bill_to_line1}
            {invoice.bill_to_line2 ? `, ${invoice.bill_to_line2}` : ''}
            <br />
            {invoice.bill_to_city}, {invoice.bill_to_state} {invoice.bill_to_postal_code}
          </p>
        </Card>
        <Card className="space-y-2 text-sm">
          <h2 className="text-lg">Ship to</h2>
          <p className="text-pe-brown">
            {invoice.ship_to_line1}
            {invoice.ship_to_line2 ? `, ${invoice.ship_to_line2}` : ''}
            <br />
            {invoice.ship_to_city}, {invoice.ship_to_state} {invoice.ship_to_postal_code}
          </p>
          <p className="pt-2">
            Shipping:{' '}
            {invoice.free_shipping
              ? 'Free'
              : `${invoice.shipping_carrier} ${invoice.shipping_service}`}
          </p>
          {invoice.expires_at && (
            <p>Expires: {formatDate(invoice.expires_at)}</p>
          )}
          {invoice.paid_at && <p>Paid: {formatDate(invoice.paid_at)}</p>}
        </Card>
      </div>

      <div className="border border-pe-beige bg-white rounded-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-pe-cream text-left">
            <tr>
              <th className="p-3">Item</th>
              <th className="p-3">SKU</th>
              <th className="p-3">Qty</th>
              <th className="p-3">Unit</th>
              <th className="p-3">Total</th>
            </tr>
          </thead>
          <tbody>
            {(lines ?? []).map((line) => (
              <tr key={line.id} className="border-t border-pe-beige">
                <td className="p-3">{line.name_snapshot}</td>
                <td className="p-3 font-mono text-xs">{line.sku_snapshot}</td>
                <td className="p-3">{line.quantity}</td>
                <td className="p-3">{formatCurrency(line.unit_price_cents)}</td>
                <td className="p-3">{formatCurrency(line.line_total_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Card className="space-y-2 text-sm max-w-sm ml-auto">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatCurrency(invoice.subtotal_cents)}</span>
        </div>
        {invoice.discount_cents > 0 && (
          <div className="flex justify-between text-pe-brown">
            <span>Discount</span>
            <span>−{formatCurrency(invoice.discount_cents)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>Shipping</span>
          <span>{formatCurrency(invoice.shipping_cents)}</span>
        </div>
        <div className="flex justify-between">
          <span>Tax</span>
          <span>{formatCurrency(invoice.tax_cents)}</span>
        </div>
        <div className="flex justify-between text-base font-medium pt-2 border-t border-pe-beige">
          <span>Total</span>
          <span>{formatCurrency(invoice.total_cents)}</span>
        </div>
      </Card>

      {invoice.status !== 'paid' && invoice.status !== 'cancelled' && (
        <Card className="text-sm space-y-3">
          <p className="font-medium">Customer payment link</p>
          <a href={payUrl} className="break-all">
            {payUrl}
          </a>
          <CancelUnpaidButton invoiceId={invoice.id} />
        </Card>
      )}

      {(invoice.status === 'cancelled' || invoice.status === 'expired') && !invoice.paid_at && (
        <Card className="text-sm space-y-3">
          <p className="font-medium">Remove this invoice</p>
          <p className="text-pe-brown">
            This invoice was never paid, so it can be deleted permanently.
          </p>
          <DeleteInvoiceButton invoiceId={invoice.id} redirectTo="/partner/invoices" />
        </Card>
      )}
    </div>
  )
}
