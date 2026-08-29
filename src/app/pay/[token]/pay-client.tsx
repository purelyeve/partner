'use client'

import { useState, useTransition } from 'react'
import { Alert, Button, Card } from '@/components/ui'
import { createInvoiceCheckoutAction } from '@/lib/invoice-actions'
import {
  customerTypeLabel,
  formatCurrency,
  formatDate,
  invoiceStatusLabel,
} from '@/lib/utils'

type PayInvoice = {
  invoice_number: string
  status: string
  customer_name_snapshot: string
  customer_type: string
  seller_name: string
  seller_email: string
  seller_phone: string
  ship_to_line1: string
  ship_to_line2: string
  ship_to_city: string
  ship_to_state: string
  ship_to_postal_code: string
  subtotal_cents: number
  discount_cents: number
  shipping_cents: number
  tax_cents: number
  total_cents: number
  free_shipping: boolean
  shipping_carrier: string
  shipping_service: string
  expires_at: string | null
  paid_at: string | null
}

type PayLine = {
  id: string
  name_snapshot: string
  sku_snapshot: string
  quantity: number
  unit_price_cents: number
  line_total_cents: number
}

export default function PayInvoiceClient({
  token,
  invoice,
  lines,
  paidFlag,
  cancelledFlag,
}: {
  token: string
  invoice: PayInvoice
  lines: PayLine[]
  paidFlag?: boolean
  cancelledFlag?: boolean
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const canPay = invoice.status === 'sent' || invoice.status === 'draft'

  function pay() {
    startTransition(async () => {
      const result = await createInvoiceCheckoutAction(token)
      if (result.error) {
        setError(result.error)
        return
      }
      if (result.url) {
        window.location.href = result.url
      }
    })
  }

  return (
    <div className="min-h-screen bg-pe-cream/40 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-1">
          <p className="text-xs uppercase tracking-wider text-pe-brown">Invoice</p>
          <h1 className="text-3xl">{invoice.invoice_number}</h1>
          <p className="text-sm text-pe-brown">from {invoice.seller_name}</p>
          {(invoice.seller_email || invoice.seller_phone) && (
            <p className="text-sm text-pe-brown">
              {[invoice.seller_email, invoice.seller_phone].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>

        {(paidFlag || invoice.status === 'paid') && (
          <div className="space-y-3">
            <Alert variant="success">
              Payment received{invoice.paid_at ? ` on ${formatDate(invoice.paid_at)}` : ''}. Thank
              you.
            </Alert>
            <div className="flex flex-wrap gap-3 justify-center">
              <a href="https://purelyeve.com" target="_blank" rel="noopener noreferrer">
                <Button type="button">Visit Purely Eve</Button>
              </a>
            </div>
            <p className="text-center text-sm text-pe-brown">
              You can close this page when you are finished. A receipt email is also sent to the
              address on this invoice.
            </p>
          </div>
        )}
        {cancelledFlag && <Alert variant="info">Checkout was cancelled. You can try again below.</Alert>}
        {invoice.status === 'expired' && (
          <Alert variant="warning">This invoice has expired. Ask your Partner to resend it.</Alert>
        )}
        {error && <Alert variant="error">{error}</Alert>}

        <Card className="space-y-4">
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <div>
              <p className="text-pe-brown">Bill to</p>
              <p className="font-medium">{invoice.customer_name_snapshot}</p>
              <p>{customerTypeLabel(invoice.customer_type)}</p>
            </div>
            <div className="text-right">
              <p className="text-pe-brown">Status</p>
              <p className="font-medium">{invoiceStatusLabel(invoice.status)}</p>
              {invoice.expires_at && invoice.status !== 'paid' && (
                <p className="text-xs text-pe-brown">Expires {formatDate(invoice.expires_at)}</p>
              )}
            </div>
          </div>

          <div className="border-t border-pe-beige pt-4">
            <p className="text-pe-brown text-sm mb-1">Ship to</p>
            <p className="text-sm">
              {invoice.ship_to_line1}
              {invoice.ship_to_line2 ? `, ${invoice.ship_to_line2}` : ''}
              <br />
              {invoice.ship_to_city}, {invoice.ship_to_state} {invoice.ship_to_postal_code}
            </p>
          </div>

          <table className="w-full text-sm">
            <thead className="text-left text-pe-brown">
              <tr>
                <th className="py-2">Item</th>
                <th className="py-2">Qty</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id} className="border-t border-pe-beige">
                  <td className="py-2">
                    {line.name_snapshot}
                    <span className="block text-xs text-pe-brown">{line.sku_snapshot}</span>
                  </td>
                  <td className="py-2">{line.quantity}</td>
                  <td className="py-2 text-right">{formatCurrency(line.line_total_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="space-y-1 text-sm border-t border-pe-beige pt-4">
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
              <span>
                Shipping
                {invoice.free_shipping
                  ? ' (free)'
                  : invoice.shipping_service
                    ? ` (${invoice.shipping_carrier} ${invoice.shipping_service})`
                    : ''}
              </span>
              <span>{formatCurrency(invoice.shipping_cents)}</span>
            </div>
            <div className="flex justify-between">
              <span>Tax</span>
              <span>{formatCurrency(invoice.tax_cents)}</span>
            </div>
            <div className="flex justify-between text-lg font-medium pt-2">
              <span>Total</span>
              <span>{formatCurrency(invoice.total_cents)}</span>
            </div>
          </div>

          {canPay && (
            <Button type="button" className="w-full" disabled={pending} onClick={pay}>
              {pending ? 'Redirecting…' : `Pay ${formatCurrency(invoice.total_cents)}`}
            </Button>
          )}
        </Card>
      </div>
    </div>
  )
}
