import { notFound } from 'next/navigation'
import { requireDistributor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency, formatDate } from '@/lib/utils'
import PackingListPrint from './print-client'

export default async function PackingListPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { distributor, profile } = await requireDistributor()
  const { id } = await params
  const supabase = await createClient()

  const { data: invoice } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', id)
    .eq('distributor_id', distributor.id)
    .single()

  if (!invoice) notFound()

  const { data: lines } = await supabase
    .from('invoice_line_items')
    .select('*')
    .eq('invoice_id', invoice.id)
    .order('sort_order')

  const seller =
    invoice.seller_name_snapshot ||
    distributor.business_name ||
    profile.full_name ||
    'Partner'

  return (
    <PackingListPrint
      sellerName={seller}
      sellerPhone={invoice.seller_phone_snapshot || profile.phone || ''}
      sellerEmail={invoice.seller_email_snapshot || profile.email || ''}
      invoiceNumber={invoice.invoice_number}
      paidAt={invoice.paid_at ? formatDate(invoice.paid_at) : ''}
      customerName={invoice.customer_name_snapshot}
      shipTo={[
        invoice.ship_to_line1,
        invoice.ship_to_line2,
        `${invoice.ship_to_city}, ${invoice.ship_to_state} ${invoice.ship_to_postal_code}`,
      ].filter(Boolean)}
      tracking={invoice.tracking_code || ''}
      lines={(lines ?? []).map((l) => ({
        name: l.name_snapshot,
        sku: l.sku_snapshot,
        qty: l.quantity,
        total: formatCurrency(l.line_total_cents),
      }))}
      total={formatCurrency(invoice.total_cents)}
    />
  )
}
