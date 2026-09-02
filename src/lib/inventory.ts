import { createAdminClient } from '@/lib/supabase/admin'
import { appUrl, emailShell, sendEmail } from '@/lib/email'
import { LOW_STOCK_THRESHOLD } from '@/lib/constants'

/** Credit invoice line quantities back once (on refund / cancel of a paid invoice). */
export async function restoreInventoryForRefundedInvoice(invoiceId: string): Promise<void> {
  const admin = createAdminClient()
  const { data: invoice } = await admin
    .from('invoices')
    .select(
      'id, distributor_id, invoice_number, inventory_deducted_at, inventory_restored_at, status',
    )
    .eq('id', invoiceId)
    .single()

  if (!invoice || !invoice.inventory_deducted_at || invoice.inventory_restored_at) return

  const { data: lines } = await admin
    .from('invoice_line_items')
    .select('sku_snapshot, quantity, name_snapshot')
    .eq('invoice_id', invoiceId)

  for (const line of lines ?? []) {
    const sku = line.sku_snapshot
    const qty = line.quantity
    if (!sku || qty <= 0) continue

    const { data: inv } = await admin
      .from('distributor_inventory')
      .select('quantity_on_hand, low_stock_threshold')
      .eq('distributor_id', invoice.distributor_id)
      .eq('sku', sku)
      .maybeSingle()

    const prev = inv?.quantity_on_hand ?? 0
    const next = prev + qty
    const threshold = inv?.low_stock_threshold ?? LOW_STOCK_THRESHOLD

    await admin.from('distributor_inventory').upsert(
      {
        distributor_id: invoice.distributor_id,
        sku,
        quantity_on_hand: next,
        low_stock_threshold: threshold,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'distributor_id,sku' },
    )

    await admin.from('inventory_movements').insert({
      distributor_id: invoice.distributor_id,
      sku,
      delta: qty,
      reason: 'invoice_refund',
      reference_id: invoiceId,
    })
  }

  await admin
    .from('invoices')
    .update({ inventory_restored_at: new Date().toISOString() })
    .eq('id', invoiceId)
}

/** Deduct invoice line quantities from partner inventory once (on payment). */
export async function deductInventoryForPaidInvoice(invoiceId: string): Promise<void> {
  const admin = createAdminClient()
  const { data: invoice } = await admin
    .from('invoices')
    .select('id, distributor_id, invoice_number, inventory_deducted_at, status')
    .eq('id', invoiceId)
    .single()

  if (!invoice || invoice.status !== 'paid' || invoice.inventory_deducted_at) return

  const { data: lines } = await admin
    .from('invoice_line_items')
    .select('sku_snapshot, quantity, name_snapshot')
    .eq('invoice_id', invoiceId)

  if (!lines?.length) {
    await admin
      .from('invoices')
      .update({ inventory_deducted_at: new Date().toISOString() })
      .eq('id', invoiceId)
    return
  }

  const lowSkus: Array<{ sku: string; name: string; qty: number }> = []

  for (const line of lines) {
    const sku = line.sku_snapshot
    const qty = line.quantity
    if (!sku || qty <= 0) continue

    const { data: inv } = await admin
      .from('distributor_inventory')
      .select('quantity_on_hand, low_stock_threshold')
      .eq('distributor_id', invoice.distributor_id)
      .eq('sku', sku)
      .maybeSingle()

    const prev = inv?.quantity_on_hand ?? 0
    const next = Math.max(0, prev - qty)
    const threshold = inv?.low_stock_threshold ?? LOW_STOCK_THRESHOLD

    await admin.from('distributor_inventory').upsert(
      {
        distributor_id: invoice.distributor_id,
        sku,
        quantity_on_hand: next,
        low_stock_threshold: threshold,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'distributor_id,sku' },
    )

    await admin.from('inventory_movements').insert({
      distributor_id: invoice.distributor_id,
      sku,
      delta: -qty,
      reason: 'invoice_sale',
      reference_id: invoiceId,
    })

    if (next <= threshold) {
      lowSkus.push({ sku, name: line.name_snapshot || sku, qty: next })
    }
  }

  await admin
    .from('invoices')
    .update({ inventory_deducted_at: new Date().toISOString() })
    .eq('id', invoiceId)

  if (lowSkus.length > 0) {
    await notifyPartnerLowStock(invoice.distributor_id, invoice.invoice_number, lowSkus)
  }
}

async function notifyPartnerLowStock(
  distributorId: string,
  invoiceNumber: string,
  items: Array<{ sku: string; name: string; qty: number }>,
) {
  const admin = createAdminClient()
  const { data: dist } = await admin
    .from('distributors')
    .select('business_name, profiles!distributors_profile_id_fkey(email, full_name)')
    .eq('id', distributorId)
    .single()

  const profile = dist?.profiles as unknown as { email?: string; full_name?: string } | null
  if (!profile?.email) return

  const list = items
    .map((i) => `<li>${i.name} (${i.sku}): <strong>${i.qty}</strong> on hand</li>`)
    .join('')

  await sendEmail({
    to: profile.email,
    subject: `Low stock alert — after invoice ${invoiceNumber}`,
    html: emailShell(
      'Low stock alert',
      `<p>Dear ${profile.full_name || 'Partner'},</p>
       <p>After payment on invoice <strong>${invoiceNumber}</strong>, inventory for one or more products is at or below ${LOW_STOCK_THRESHOLD} units:</p>
       <ul>${list}</ul>
       <p><a href="${appUrl()}/partner/inventory">Review inventory</a> · <a href="${appUrl()}/partner/packages">Order packages</a></p>`,
    ),
  })
}
