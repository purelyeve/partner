import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui'
import { getAdminDb } from '@/lib/admin'
import { requireAdmin } from '@/lib/auth'
import { DISTRIBUTOR_PROFILE } from '@/lib/constants'
import {
  customerTypeLabel,
  formatCurrency,
  formatDate,
  invoiceStatusLabel,
} from '@/lib/utils'
import type { Profile } from '@/lib/types'

export default async function AdminInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdmin()
  const { id } = await params
  const supabase = getAdminDb()

  const { data: invoice } = await supabase
    .from('invoices')
    .select(
      `*, distributors(business_name, ${DISTRIBUTOR_PROFILE}(full_name, email, phone)), invoice_line_items(*)`,
    )
    .eq('id', id)
    .maybeSingle()

  if (!invoice) notFound()

  const dist = invoice.distributors as {
    business_name?: string
    profiles?: Profile | Profile[]
  } | null
  const profile = Array.isArray(dist?.profiles) ? dist?.profiles[0] : dist?.profiles
  const lines = (invoice.invoice_line_items ?? []) as Array<{
    id: string
    name_snapshot: string
    sku_snapshot: string
    quantity: number
    unit_price_cents: number
    line_total_cents: number
  }>

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link href="/admin/reports/customer-orders" className="text-sm text-pe-brown">
          ← Customer orders
        </Link>
        <div className="flex flex-wrap items-center gap-3 mt-2">
          <h1 className="text-3xl">{invoice.invoice_number}</h1>
          <Badge>{invoiceStatusLabel(invoice.status)}</Badge>
        </div>
        <p className="text-sm text-pe-brown mt-1">
          {customerTypeLabel(invoice.customer_type)} · Paid{' '}
          {invoice.paid_at ? formatDate(invoice.paid_at) : '—'}
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 text-sm">
        <div className="border border-pe-beige bg-white rounded-sm p-4 space-y-1">
          <p className="text-xs uppercase tracking-wider text-pe-brown">Customer</p>
          <p className="font-medium">{invoice.customer_name_snapshot}</p>
          <p>{invoice.customer_email_snapshot}</p>
          <p>{invoice.customer_phone_snapshot}</p>
          <p className="pt-2">
            {invoice.ship_to_line1}
            {invoice.ship_to_line2 ? `, ${invoice.ship_to_line2}` : ''}
          </p>
          <p>
            {invoice.ship_to_city}, {invoice.ship_to_state} {invoice.ship_to_postal_code}
          </p>
        </div>
        <div className="border border-pe-beige bg-white rounded-sm p-4 space-y-1">
          <p className="text-xs uppercase tracking-wider text-pe-brown">Selling Partner</p>
          <p className="font-medium">
            {dist?.business_name?.trim() || profile?.full_name || 'Partner'}
          </p>
          <p>{profile?.email}</p>
          <p>{profile?.phone}</p>
          {invoice.fulfilled_at ? (
            <p className="pt-2 text-pe-brown">
              Label fulfilled {formatDate(invoice.fulfilled_at)}
              {invoice.tracking_code ? ` · ${invoice.tracking_code}` : ''}
            </p>
          ) : (
            <p className="pt-2 text-pe-brown">Shipping label pending</p>
          )}
        </div>
      </div>

      <div className="border border-pe-beige bg-white rounded-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-pe-cream text-left">
            <tr>
              <th className="p-3">Item</th>
              <th className="p-3">Qty</th>
              <th className="p-3">Unit</th>
              <th className="p-3">Line</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-t border-pe-beige">
                <td className="p-3">
                  {line.name_snapshot}
                  <span className="block text-xs text-pe-brown">{line.sku_snapshot}</span>
                </td>
                <td className="p-3">{line.quantity}</td>
                <td className="p-3">{formatCurrency(line.unit_price_cents)}</td>
                <td className="p-3">{formatCurrency(line.line_total_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t border-pe-beige p-3 space-y-1 text-sm text-right">
          <p>Subtotal {formatCurrency(invoice.subtotal_cents)}</p>
          <p>Shipping {formatCurrency(invoice.shipping_cents)}</p>
          <p>Tax {formatCurrency(invoice.tax_cents)}</p>
          <p className="text-lg font-serif">Total {formatCurrency(invoice.total_cents)}</p>
        </div>
      </div>
    </div>
  )
}
