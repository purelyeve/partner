import { createAdminClient } from '@/lib/supabase/admin'
import { DISTRIBUTOR_PROFILE } from '@/lib/constants'
import { appUrl, emailShell, sendEmail } from '@/lib/email'
import { formatCurrency } from '@/lib/utils'
import { deductInventoryForPaidInvoice } from '@/lib/inventory'

/** Mark a customer invoice paid (idempotent). Used by webhook + pay-page sync. */
export async function markCustomerInvoicePaid(params: {
  invoiceId: string
  paymentIntentId?: string | null
  checkoutSessionId?: string | null
}): Promise<{ ok: true; alreadyPaid?: boolean } | { ok: false; error: string }> {
  const admin = createAdminClient()
  const { data: invoice } = await admin
    .from('invoices')
    .select(
      `*, distributors(business_name, ${DISTRIBUTOR_PROFILE}(email, full_name))`,
    )
    .eq('id', params.invoiceId)
    .single()

  if (!invoice) return { ok: false, error: 'Invoice not found' }

  if (invoice.status === 'paid') {
    return { ok: true, alreadyPaid: true }
  }
  if (invoice.status === 'cancelled' && invoice.refunded_at) {
    return { ok: false, error: 'Invoice was refunded' }
  }

  await admin
    .from('invoices')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      stripe_payment_intent_id:
        params.paymentIntentId || invoice.stripe_payment_intent_id || '',
      stripe_checkout_session_id:
        params.checkoutSessionId || invoice.stripe_checkout_session_id || null,
    })
    .eq('id', invoice.id)

  try {
    await deductInventoryForPaidInvoice(invoice.id)
  } catch (err) {
    console.error('[invoice-paid] inventory deduct failed', err)
  }

  const dist = invoice.distributors as {
    business_name: string
    profiles: { email: string; full_name: string }
  } | null
  const partnerEmail = dist?.profiles?.email
  const partnerName = dist?.profiles?.full_name || 'Partner'

  if (partnerEmail) {
    await sendEmail({
      to: partnerEmail,
      subject: `Invoice ${invoice.invoice_number} paid — ready to ship`,
      html: emailShell(
        'Invoice paid',
        `<p>Dear ${partnerName},</p>
         <p>Your customer <strong>${invoice.customer_name_snapshot}</strong> paid invoice <strong>${invoice.invoice_number}</strong> for ${formatCurrency(invoice.total_cents)}.</p>
         <p>Inventory for the items on this invoice has been deducted from your on-hand stock.</p>
         <p>Next step: buy a shipping label and mark the order shipped.</p>
         <p style="margin:24px 0;">
           <a href="${appUrl()}/partner/fulfillments/${invoice.id}" style="background:#3a2108;color:#f5f0e8;padding:12px 20px;text-decoration:none;display:inline-block;">Open fulfillment</a>
         </p>
         <p><a href="${appUrl()}/partner/fulfillments">Fulfillments</a> · <a href="${appUrl()}/partner">Dashboard</a></p>`,
      ),
    })
  }

  if (invoice.customer_email_snapshot) {
    const seller =
      invoice.seller_name_snapshot || dist?.business_name || partnerName
    const contactBits = [
      invoice.seller_email_snapshot
        ? `Email: ${invoice.seller_email_snapshot}`
        : null,
      invoice.seller_phone_snapshot
        ? `Phone: ${invoice.seller_phone_snapshot}`
        : null,
    ]
      .filter(Boolean)
      .join('<br/>')

    await sendEmail({
      to: invoice.customer_email_snapshot,
      subject: `Payment received — ${invoice.invoice_number}`,
      replyTo: invoice.seller_email_snapshot || undefined,
      html: emailShell(
        'Payment received',
        `<p>Dear ${invoice.customer_name_snapshot},</p>
         <p>Thank you. Your payment of <strong>${formatCurrency(invoice.total_cents)}</strong> for invoice <strong>${invoice.invoice_number}</strong> from ${seller} has been received.</p>
         ${contactBits ? `<p>Questions? Contact your Partner:<br/>${contactBits}</p>` : ''}
         <p style="margin:24px 0;"><a href="${appUrl()}/pay/${invoice.public_token}" style="background:#3a2108;color:#f5f0e8;padding:12px 20px;text-decoration:none;display:inline-block;">View receipt</a></p>`,
      ),
    })
  }

  return { ok: true }
}
