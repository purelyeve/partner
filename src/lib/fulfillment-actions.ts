'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { appUrl, emailShell, sendEmail } from '@/lib/email'
import { buyPartnerLabel, parcelFromPackage } from '@/lib/easypost'
import { resolvePartnerEasyPostKey } from '@/lib/easypost-partner'
import { getStripe } from '@/lib/stripe'
import { restoreInventoryForRefundedInvoice } from '@/lib/inventory'
import { formatCurrency } from '@/lib/utils'
import { fulfillmentAddress } from '@/lib/auth'

async function requirePartner() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' as const }

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const { data: distributor } = await supabase
    .from('distributors')
    .select('*')
    .eq('profile_id', user.id)
    .single()

  if (!profile || !distributor) return { error: 'Distributor not found' as const }
  return { supabase, profile, distributor }
}

function partnerShipFrom(distributor: {
  business_name: string
  fulfillment_same_as_mailing: boolean
  mailing_line1: string
  mailing_line2: string
  mailing_city: string
  mailing_state: string
  mailing_postal_code: string
  mailing_country: string
  fulfillment_line1: string
  fulfillment_line2: string
  fulfillment_city: string
  fulfillment_state: string
  fulfillment_postal_code: string
  fulfillment_country: string
}, phone: string, fullName: string) {
  const addr = fulfillmentAddress(distributor as Parameters<typeof fulfillmentAddress>[0])
  return {
    name: fullName || distributor.business_name || 'Partner',
    company: distributor.business_name || undefined,
    phone: phone || '',
    street1: addr.line1,
    street2: addr.line2 || '',
    city: addr.city,
    state: addr.state,
    zip: addr.postal_code,
    country: addr.country || 'US',
  }
}

/** Buy + store label for a paid customer invoice; mark shipped; email tracking. */
export async function partnerBuyLabelAndFulfillAction(invoiceId: string) {
  const ctx = await requirePartner()
  if ('error' in ctx) return { error: ctx.error }

  const { data: invoice } = await ctx.supabase
    .from('invoices')
    .select('*, invoice_line_items(*)')
    .eq('id', invoiceId)
    .eq('distributor_id', ctx.distributor.id)
    .single()

  if (!invoice) return { error: 'Order not found.' }
  if (invoice.status !== 'paid') {
    return { error: 'Only paid orders can be fulfilled.' }
  }
  if (invoice.fulfilled_at) {
    return { error: 'This order is already marked shipped.' }
  }
  if (invoice.refunded_at) {
    return { error: 'This order was refunded and cannot be shipped.' }
  }

  const resolved = resolvePartnerEasyPostKey(ctx.distributor)
  if ('error' in resolved) {
    return { error: resolved.error }
  }
  const apiKey = resolved.apiKey

  const lines = (invoice.invoice_line_items ?? []) as Array<{
    quantity: number
    sku_snapshot: string
  }>

  let weightOz = 0
  for (const line of lines) {
    const { data: product } = await ctx.supabase
      .from('products')
      .select('weight_oz')
      .eq('sku', line.sku_snapshot)
      .maybeSingle()
    weightOz += line.quantity * (product?.weight_oz ?? 4)
  }
  weightOz = Math.max(4, weightOz)

  const from = partnerShipFrom(ctx.distributor, ctx.profile.phone, ctx.profile.full_name)
  const purchased = await buyPartnerLabel({
    apiKey,
    from,
    to: {
      name: invoice.customer_name_snapshot,
      street1: invoice.ship_to_line1,
      street2: invoice.ship_to_line2 || '',
      city: invoice.ship_to_city,
      state: invoice.ship_to_state,
      zip: invoice.ship_to_postal_code,
      country: invoice.ship_to_country || 'US',
    },
    parcel: {
      weightOz,
      lengthIn: 8,
      widthIn: 6,
      heightIn: 4,
    },
    carrier: invoice.shipping_carrier || 'USPS',
    service: invoice.shipping_service || 'Priority',
    existingShipmentId: invoice.easypost_shipment_id || undefined,
    existingRateId: invoice.easypost_rate_id || undefined,
  })

  if (!purchased.ok) return { error: purchased.error }

  const label = purchased.label
  const labelUrls = [label.labelUrl]

  const { error: updateError } = await ctx.supabase
    .from('invoices')
    .update({
      tracking_code: label.trackingCode,
      label_url: label.labelUrl,
      label_urls: labelUrls,
      easypost_shipment_id: label.shipmentId,
      easypost_rate_id: label.rateId,
      shipping_carrier: label.carrier,
      shipping_service: label.service,
      fulfilled_at: new Date().toISOString(),
    })
    .eq('id', invoice.id)

  if (updateError) return { error: updateError.message }

  const seller =
    invoice.seller_name_snapshot ||
    ctx.distributor.business_name ||
    ctx.profile.full_name ||
    'Your Partner'

  if (invoice.customer_email_snapshot) {
    await sendEmail({
      to: invoice.customer_email_snapshot,
      subject: `Your order has shipped — ${invoice.invoice_number}`,
      replyTo: invoice.seller_email_snapshot || ctx.profile.email,
      html: emailShell(
        'Your order has shipped',
        `<p>Dear ${invoice.customer_name_snapshot},</p>
         <p>Good news — ${seller} has shipped invoice <strong>${invoice.invoice_number}</strong>.</p>
         ${
           label.trackingCode
             ? `<p>Tracking number: <strong>${label.trackingCode}</strong><br/>Carrier: ${label.carrier} ${label.service}</p>`
             : `<p>Carrier: ${label.carrier} ${label.service}</p>`
         }
         <p>Questions? Reply to this email to reach your Partner.</p>`,
      ),
    })
  }

  revalidatePath('/partner/fulfillments')
  revalidatePath(`/partner/fulfillments/${invoice.id}`)
  revalidatePath(`/partner/invoices/${invoice.id}`)
  revalidatePath('/partner')

  return {
    success: true,
    message: label.usedFallback
      ? `Label purchased (${label.carrier} ${label.service} — closest available). Tracking emailed to customer.`
      : 'Label purchased. Tracking emailed to customer.',
    labelUrl: label.labelUrl,
    tracking: label.trackingCode,
  }
}

export async function getInvoiceLabelSignedUrlAction(invoiceId: string) {
  const ctx = await requirePartner()
  if ('error' in ctx) return { error: ctx.error }

  const { data: invoice } = await ctx.supabase
    .from('invoices')
    .select('label_url, label_urls')
    .eq('id', invoiceId)
    .eq('distributor_id', ctx.distributor.id)
    .single()

  if (!invoice) return { error: 'Order not found.' }
  const urls = (invoice.label_urls as string[] | null)?.filter(Boolean) ?? []
  const url = urls[0] || invoice.label_url
  if (!url) return { error: 'No label on file for this order.' }
  return { url }
}

/**
 * Refund a paid customer payment on the Partner's Connect account and restore stock.
 * Also used for cancel-after-pay.
 */
export async function partnerRefundPaidInvoiceAction(formData: FormData) {
  const ctx = await requirePartner()
  if ('error' in ctx) return { error: ctx.error }

  const invoiceId = String(formData.get('invoiceId') ?? '')
  const reason = String(formData.get('reason') ?? '').trim()
  if (!invoiceId) return { error: 'Missing order id.' }

  const { data: invoice } = await ctx.supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .eq('distributor_id', ctx.distributor.id)
    .single()

  if (!invoice) return { error: 'Order not found.' }
  if (invoice.status !== 'paid') {
    return { error: 'Only paid orders can be refunded.' }
  }
  if (invoice.refunded_at) {
    return { error: 'This order was already refunded.' }
  }
  if (!invoice.stripe_payment_intent_id) {
    return { error: 'No Stripe payment found on this order. Contact support.' }
  }
  if (!ctx.distributor.stripe_account_id) {
    return { error: 'Stripe Connect account missing. Open Payments to reconnect.' }
  }

  const stripe = getStripe()
  try {
    const refund = await stripe.refunds.create(
      {
        payment_intent: invoice.stripe_payment_intent_id,
        reason: 'requested_by_customer',
        metadata: {
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          distributor_id: ctx.distributor.id,
          cancel_reason: reason.slice(0, 200),
        },
      },
      { stripeAccount: ctx.distributor.stripe_account_id },
    )

    await ctx.supabase
      .from('invoices')
      .update({
        status: 'cancelled',
        refunded_at: new Date().toISOString(),
        stripe_refund_id: refund.id,
        cancel_reason: reason.slice(0, 500),
      })
      .eq('id', invoice.id)

    await restoreInventoryForRefundedInvoice(invoice.id)

    if (invoice.customer_email_snapshot) {
      await sendEmail({
        to: invoice.customer_email_snapshot,
        subject: `Refund processed — ${invoice.invoice_number}`,
        replyTo: invoice.seller_email_snapshot || ctx.profile.email,
        html: emailShell(
          'Refund processed',
          `<p>Dear ${invoice.customer_name_snapshot},</p>
           <p>Your payment of <strong>${formatCurrency(invoice.total_cents)}</strong> for invoice <strong>${invoice.invoice_number}</strong> has been refunded.</p>
           <p>Funds typically return to the original payment method in a few business days.</p>`,
        ),
      })
    }

    await sendEmail({
      to: ctx.profile.email,
      subject: `Refund completed — ${invoice.invoice_number}`,
      html: emailShell(
        'Refund completed',
        `<p>Dear ${ctx.profile.full_name},</p>
         <p>You refunded invoice <strong>${invoice.invoice_number}</strong> (${formatCurrency(invoice.total_cents)}).</p>
         <p>Inventory for that order has been restored to your stock.</p>
         <p><a href="${appUrl()}/partner/fulfillments/${invoice.id}">View order</a></p>`,
      ),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Refund failed'
    console.error('[refund]', message)
    return { error: message }
  }

  revalidatePath('/partner/fulfillments')
  revalidatePath(`/partner/fulfillments/${invoiceId}`)
  revalidatePath(`/partner/invoices/${invoiceId}`)
  revalidatePath('/partner/inventory')
  revalidatePath('/partner')

  return { success: true, message: 'Refund issued. Stock restored.' }
}

/** Cancel an unpaid invoice (draft/sent/expired) without Stripe refund. */
export async function partnerCancelUnpaidInvoiceAction(invoiceId: string) {
  const ctx = await requirePartner()
  if ('error' in ctx) return { error: ctx.error }

  const { data: invoice } = await ctx.supabase
    .from('invoices')
    .select('id, status')
    .eq('id', invoiceId)
    .eq('distributor_id', ctx.distributor.id)
    .single()

  if (!invoice) return { error: 'Invoice not found.' }
  if (invoice.status === 'paid') {
    return { error: 'Paid orders must be refunded (not cancelled as unpaid).' }
  }
  if (invoice.status === 'cancelled') {
    return { error: 'Already cancelled.' }
  }

  await ctx.supabase
    .from('invoices')
    .update({ status: 'cancelled', cancel_reason: 'Cancelled by Partner before payment' })
    .eq('id', invoiceId)

  revalidatePath('/partner/invoices')
  revalidatePath(`/partner/invoices/${invoiceId}`)
  revalidatePath('/partner/fulfillments')
  return { success: true, message: 'Invoice cancelled.' }
}

/** Admin helper: network view uses service role when needed. */
export async function adminListPaidCustomerOrders() {
  const admin = createAdminClient()
  const { data } = await admin
    .from('invoices')
    .select(
      'id, invoice_number, status, total_cents, paid_at, fulfilled_at, tracking_code, customer_name_snapshot, distributor_id, distributors(business_name)',
    )
    .eq('status', 'paid')
    .order('paid_at', { ascending: false })
    .limit(100)
  return data ?? []
}
