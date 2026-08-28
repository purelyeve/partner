import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { DISTRIBUTOR_PROFILE } from '@/lib/constants'
import PayInvoiceClient from './pay-client'

export default async function PayInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ paid?: string; cancelled?: string }>
}) {
  const { token } = await params
  const q = await searchParams
  const admin = createAdminClient()

  const { data: invoice } = await admin
    .from('invoices')
    .select(`*, distributors(business_name, ${DISTRIBUTOR_PROFILE}(full_name))`)
    .eq('public_token', token)
    .single()

  if (!invoice) notFound()

  if (
    invoice.expires_at &&
    new Date(invoice.expires_at) < new Date() &&
    invoice.status !== 'paid' &&
    invoice.status !== 'cancelled'
  ) {
    await admin.from('invoices').update({ status: 'expired' }).eq('id', invoice.id)
    invoice.status = 'expired'
  }

  const { data: lines } = await admin
    .from('invoice_line_items')
    .select('*')
    .eq('invoice_id', invoice.id)
    .order('sort_order')

  const dist = invoice.distributors as {
    business_name: string
    profiles: { full_name: string }
  } | null

  const sellerName =
    dist?.business_name?.trim() || dist?.profiles?.full_name || 'Purely Eve Partner'

  return (
    <PayInvoiceClient
      token={token}
      paidFlag={q.paid === '1'}
      cancelledFlag={q.cancelled === '1'}
      invoice={{
        invoice_number: invoice.invoice_number,
        status: invoice.status,
        customer_name_snapshot: invoice.customer_name_snapshot,
        customer_type: invoice.customer_type,
        seller_name: sellerName,
        ship_to_line1: invoice.ship_to_line1,
        ship_to_line2: invoice.ship_to_line2,
        ship_to_city: invoice.ship_to_city,
        ship_to_state: invoice.ship_to_state,
        ship_to_postal_code: invoice.ship_to_postal_code,
        subtotal_cents: invoice.subtotal_cents,
        discount_cents: invoice.discount_cents,
        shipping_cents: invoice.shipping_cents,
        tax_cents: invoice.tax_cents,
        total_cents: invoice.total_cents,
        free_shipping: invoice.free_shipping,
        shipping_carrier: invoice.shipping_carrier,
        shipping_service: invoice.shipping_service,
        expires_at: invoice.expires_at,
        paid_at: invoice.paid_at,
      }}
      lines={lines ?? []}
    />
  )
}
