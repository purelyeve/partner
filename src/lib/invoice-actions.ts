'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { ActionState } from '@/lib/action-state'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { appUrl, emailShell, sendEmail } from '@/lib/email'
import { getPackageShippingRates, parcelFromPackage } from '@/lib/easypost'
import { calculateDestinationTaxCents } from '@/lib/tax'
import { getStripe } from '@/lib/stripe'
import { isConnectReady } from '@/lib/stripe-connect'
import { decryptSecret } from '@/lib/crypto'
import {
  computeDiscountCents,
  generateInvoiceNumber,
  formatCurrency,
} from '@/lib/utils'
import { INVOICE_EXPIRY_DAYS } from '@/lib/constants'
import type { InvoiceCustomerType, InvoiceDiscountType } from '@/lib/types'

async function requirePartnerDistributor() {
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
  if (distributor.application_status !== 'approved') {
    return { error: 'Partner account must be approved before invoicing.' as const }
  }

  return { supabase, user, profile, distributor }
}

function shipAddressFromCustomer(customer: {
  shipping_same_as_billing: boolean
  billing_line1: string
  billing_line2: string
  billing_city: string
  billing_state: string
  billing_postal_code: string
  billing_country: string
  shipping_line1: string
  shipping_line2: string
  shipping_city: string
  shipping_state: string
  shipping_postal_code: string
  shipping_country: string
  full_name: string
}) {
  if (customer.shipping_same_as_billing) {
    return {
      name: customer.full_name,
      line1: customer.billing_line1,
      line2: customer.billing_line2,
      city: customer.billing_city,
      state: customer.billing_state,
      postal_code: customer.billing_postal_code,
      country: customer.billing_country || 'US',
    }
  }
  return {
    name: customer.full_name,
    line1: customer.shipping_line1,
    line2: customer.shipping_line2,
    city: customer.shipping_city,
    state: customer.shipping_state,
    postal_code: customer.shipping_postal_code,
    country: customer.shipping_country || 'US',
  }
}

export async function partnerSaveCustomerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requirePartnerDistributor()
  if ('error' in ctx) return { error: ctx.error }

  const id = String(formData.get('id') ?? '')
  const fullName = String(formData.get('fullName') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const phone = String(formData.get('phone') ?? '').trim()
  const sameShip = formData.get('shippingSameAsBilling') === 'on'
  const customerTypeHint = String(formData.get('customerType') ?? '')

  if (!fullName || !email) return { error: 'Name and email are required.' }

  const billing = {
    billing_line1: String(formData.get('billingLine1') ?? '').trim(),
    billing_line2: String(formData.get('billingLine2') ?? '').trim(),
    billing_city: String(formData.get('billingCity') ?? '').trim(),
    billing_state: String(formData.get('billingState') ?? '').trim().toUpperCase(),
    billing_postal_code: String(formData.get('billingPostalCode') ?? '').trim(),
    billing_country: 'US',
  }

  if (!billing.billing_line1 || !billing.billing_city || !billing.billing_state || !billing.billing_postal_code) {
    return { error: 'Billing address is required.' }
  }

  const shipping = sameShip
    ? {
        shipping_same_as_billing: true,
        shipping_line1: '',
        shipping_line2: '',
        shipping_city: '',
        shipping_state: '',
        shipping_postal_code: '',
        shipping_country: 'US',
      }
    : {
        shipping_same_as_billing: false,
        shipping_line1: String(formData.get('shippingLine1') ?? '').trim(),
        shipping_line2: String(formData.get('shippingLine2') ?? '').trim(),
        shipping_city: String(formData.get('shippingCity') ?? '').trim(),
        shipping_state: String(formData.get('shippingState') ?? '').trim().toUpperCase(),
        shipping_postal_code: String(formData.get('shippingPostalCode') ?? '').trim(),
        shipping_country: 'US',
      }

  if (!sameShip && (!shipping.shipping_line1 || !shipping.shipping_city || !shipping.shipping_state || !shipping.shipping_postal_code)) {
    return { error: 'Shipping address is required when different from billing.' }
  }

  let resaleNumber = String(formData.get('resaleCertificateNumber') ?? '').trim()
  const resaleFile = formData.get('resaleFile') as File | null

  const payload: Record<string, unknown> = {
    distributor_id: ctx.distributor.id,
    full_name: fullName,
    email,
    phone,
    ...billing,
    ...shipping,
  }

  if (customerTypeHint === 'retail_wholesale' || resaleNumber) {
    payload.resale_certificate_number = resaleNumber
  }

  if (resaleFile && resaleFile.size > 0) {
    const admin = createAdminClient()
    const path = `${ctx.user.id}/customers/${Date.now()}-${resaleFile.name.replace(/[^\w.\-]+/g, '_')}`
    const buf = Buffer.from(await resaleFile.arrayBuffer())
    const { error: upErr } = await admin.storage.from('distributor-documents').upload(path, buf, {
      contentType: resaleFile.type || 'application/octet-stream',
      upsert: false,
    })
    if (upErr) return { error: upErr.message }
    payload.resale_document_path = path
    payload.resale_document_name = resaleFile.name
    if (!resaleNumber) resaleNumber = 'ON FILE'
    payload.resale_certificate_number = resaleNumber
  }

  if (id) {
    const { error } = await ctx.supabase.from('customers').update(payload).eq('id', id).eq('distributor_id', ctx.distributor.id)
    if (error) return { error: error.message }
    revalidatePath('/partner/customers')
    revalidatePath(`/partner/customers/${id}`)
    return { success: true, message: 'Customer updated.' }
  }

  const { data: created, error } = await ctx.supabase
    .from('customers')
    .insert(payload)
    .select('id')
    .single()
  if (error || !created) return { error: error?.message ?? 'Could not save customer' }

  revalidatePath('/partner/customers')
  redirect(`/partner/customers/${created.id}`)
}

export async function getInvoiceShippingRatesAction(formData: FormData) {
  const ctx = await requirePartnerDistributor()
  if ('error' in ctx) return { error: ctx.error }

  const weightOz = Number(formData.get('weightOz') ?? 0)
  const customerId = String(formData.get('customerId') ?? '')
  if (!customerId) return { error: 'Select a customer first.' }
  if (weightOz <= 0) return { error: 'Add at least one product with weight.' }

  const { data: customer } = await ctx.supabase
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .eq('distributor_id', ctx.distributor.id)
    .single()
  if (!customer) return { error: 'Customer not found.' }

  const ship = shipAddressFromCustomer(customer)
  if (!ship.line1 || !ship.city || !ship.state || !ship.postal_code) {
    return { error: 'Customer shipping address is incomplete.' }
  }

  const from = ctx.distributor.fulfillment_same_as_mailing
    ? {
        name: ctx.profile.full_name || ctx.distributor.business_name || 'Partner',
        phone: ctx.profile.phone || '',
        street1: ctx.distributor.mailing_line1,
        street2: ctx.distributor.mailing_line2,
        city: ctx.distributor.mailing_city,
        state: ctx.distributor.mailing_state,
        zip: ctx.distributor.mailing_postal_code,
        country: ctx.distributor.mailing_country || 'US',
      }
    : {
        name: ctx.profile.full_name || ctx.distributor.business_name || 'Partner',
        phone: ctx.profile.phone || '',
        street1: ctx.distributor.fulfillment_line1,
        street2: ctx.distributor.fulfillment_line2,
        city: ctx.distributor.fulfillment_city,
        state: ctx.distributor.fulfillment_state,
        zip: ctx.distributor.fulfillment_postal_code,
        country: ctx.distributor.fulfillment_country || 'US',
      }

  let partnerApiKey: string | undefined
  if (ctx.distributor.easypost_api_key_ciphertext) {
    try {
      partnerApiKey = decryptSecret(ctx.distributor.easypost_api_key_ciphertext)
    } catch {
      return {
        error:
          'Could not read your EasyPost API key. Re-save it under Payments, then try rates again.',
      }
    }
  }
  if (!partnerApiKey) {
    return {
      rates: [
        { id: 'free', carrier: 'FREE', service: 'Free shipping', rateCents: 0, deliveryDays: null },
      ],
      shipmentId: '',
      warning:
        'Only free shipping is available until you add your EasyPost API key under Payments (required for paid rates and customer labels).',
    }
  }

  const result = await getPackageShippingRates({
    apiKey: partnerApiKey,
    from,
    to: {
      name: ship.name,
      street1: ship.line1,
      street2: ship.line2,
      city: ship.city,
      state: ship.state,
      zip: ship.postal_code,
      country: ship.country,
    },
    parcel: parcelFromPackage({
      weight_oz: weightOz,
      length_in: 8,
      width_in: 6,
      height_in: 4,
      box_count: 1,
    }),
  })

  if (!result.ok) {
    return {
      error: result.error,
      rates: [{ id: 'free', carrier: 'FREE', service: 'Free shipping', rateCents: 0, deliveryDays: null }],
      shipmentId: '',
    }
  }

  return {
    rates: [
      ...result.rates,
      { id: 'free', carrier: 'FREE', service: 'Free shipping', rateCents: 0, deliveryDays: null },
    ],
    shipmentId: result.shipmentId,
  }
}

export async function partnerCreateInvoiceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requirePartnerDistributor()
  if ('error' in ctx) return { error: ctx.error }

  // Free shipping does not need EasyPost at invoice time; paid shipping + labels do.
  const freeShippingEarly =
    String(formData.get('rateId') ?? '') === 'free' ||
    String(formData.get('carrier') ?? '') === 'FREE'

  if (!isConnectReady(ctx.distributor)) {
    return {
      error:
        'Connect your bank under Payments (Stripe Connect) before creating invoices customers can pay.',
    }
  }
  if (!freeShippingEarly && !ctx.distributor.easypost_api_key_ciphertext) {
    return {
      error:
        'Add your EasyPost API key under Payments before creating invoices with paid shipping.',
    }
  }

  const customerId = String(formData.get('customerId') ?? '')
  const customerType = String(formData.get('customerType') ?? '') as InvoiceCustomerType
  const discountType = (String(formData.get('discountType') ?? 'none') || 'none') as InvoiceDiscountType
  const discountValue = Number(formData.get('discountValue') ?? 0)
  const rateId = String(formData.get('rateId') ?? '')
  const carrier = String(formData.get('carrier') ?? '')
  const service = String(formData.get('service') ?? '')
  const shippingCents = Number(formData.get('shippingCents') ?? 0)
  const shipmentId = String(formData.get('shipmentId') ?? '')
  const freeShipping = rateId === 'free' || carrier === 'FREE' || shippingCents === 0 && service.toLowerCase().includes('free')
  const sendNow = formData.get('sendNow') === '1'

  const linesRaw = String(formData.get('linesJson') ?? '[]')
  let lines: Array<{ productId: string; quantity: number }> = []
  try {
    lines = JSON.parse(linesRaw)
  } catch {
    return { error: 'Invalid line items.' }
  }

  if (!customerId) return { error: 'Select a customer.' }
  if (customerType !== 'direct_to_customer' && customerType !== 'retail_wholesale') {
    return { error: 'Choose Direct to Customer or Retail Wholesale.' }
  }
  if (!lines.length) return { error: 'Add at least one product.' }

  const { data: customer } = await ctx.supabase
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .eq('distributor_id', ctx.distributor.id)
    .single()
  if (!customer) return { error: 'Customer not found.' }

  if (customerType === 'retail_wholesale') {
    if (!customer.resale_certificate_number && !customer.resale_document_path) {
      return { error: 'Wholesale invoices require a resale certificate number or uploaded document on the customer.' }
    }
  }

  const productIds = lines.map((l) => l.productId)
  const { data: products } = await ctx.supabase
    .from('products')
    .select('*')
    .in('id', productIds)
    .eq('is_active', true)

  const { data: assignments } = await ctx.supabase
    .from('distributor_product_assignments')
    .select('product_id')
    .eq('distributor_id', ctx.distributor.id)
    .in('product_id', productIds)

  const assigned = new Set((assignments ?? []).map((a) => a.product_id))
  const productMap = new Map((products ?? []).map((p) => [p.id, p]))

  const lineRows: Array<{
    product_id: string
    sku_snapshot: string
    name_snapshot: string
    unit_price_cents: number
    quantity: number
    line_total_cents: number
    sort_order: number
  }> = []

  let subtotal = 0
  let sort = 0
  for (const line of lines) {
    const product = productMap.get(line.productId)
    if (!product || !assigned.has(line.productId)) {
      return { error: 'One or more products are not assigned to your account.' }
    }
    const qty = Math.max(1, Math.round(line.quantity))
    const unit =
      customerType === 'retail_wholesale' ? product.wholesale_cents : product.retail_cents
    const lineTotal = unit * qty
    subtotal += lineTotal
    lineRows.push({
      product_id: product.id,
      sku_snapshot: product.sku,
      name_snapshot: product.name,
      unit_price_cents: unit,
      quantity: qty,
      line_total_cents: lineTotal,
      sort_order: sort++,
    })
  }

  const discountCents = computeDiscountCents(subtotal, discountType, discountValue)
  const afterDiscount = Math.max(0, subtotal - discountCents)
  const shipCents = freeShipping ? 0 : Math.max(0, Math.round(shippingCents))

  const ship = shipAddressFromCustomer(customer)
  const taxResult = await calculateDestinationTaxCents({
    customerType,
    productSubtotalCents: afterDiscount,
    shippingCents: shipCents,
    address: {
      line1: ship.line1,
      line2: ship.line2,
      city: ship.city,
      state: ship.state,
      postal_code: ship.postal_code,
      country: ship.country,
    },
  })

  if (taxResult.error && taxResult.source === 'none') {
    return { error: taxResult.error }
  }

  const taxCents = taxResult.taxCents
  const total = afterDiscount + shipCents + taxCents
  const invoiceNumber = generateInvoiceNumber()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + INVOICE_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
  const sellerName = ctx.distributor.business_name || ctx.profile.full_name
  const sellerEmail = ctx.profile.email
  const sellerPhone = ctx.profile.phone || ''

  const { data: invoice, error: invErr } = await ctx.supabase
    .from('invoices')
    .insert({
      invoice_number: invoiceNumber,
      distributor_id: ctx.distributor.id,
      customer_id: customer.id,
      customer_type: customerType,
      status: sendNow ? 'sent' : 'draft',
      customer_name_snapshot: customer.full_name,
      customer_email_snapshot: customer.email,
      customer_phone_snapshot: customer.phone,
      seller_name_snapshot: sellerName,
      seller_email_snapshot: sellerEmail,
      seller_phone_snapshot: sellerPhone,
      ship_to_line1: ship.line1,
      ship_to_line2: ship.line2,
      ship_to_city: ship.city,
      ship_to_state: ship.state,
      ship_to_postal_code: ship.postal_code,
      ship_to_country: ship.country,
      bill_to_line1: customer.billing_line1,
      bill_to_line2: customer.billing_line2,
      bill_to_city: customer.billing_city,
      bill_to_state: customer.billing_state,
      bill_to_postal_code: customer.billing_postal_code,
      bill_to_country: customer.billing_country,
      resale_certificate_number: customer.resale_certificate_number || '',
      discount_type: discountType,
      discount_value: discountValue,
      discount_cents: discountCents,
      subtotal_cents: subtotal,
      shipping_cents: shipCents,
      tax_cents: taxCents,
      total_cents: total,
      free_shipping: freeShipping,
      shipping_carrier: freeShipping ? 'FREE' : carrier,
      shipping_service: freeShipping ? 'Free shipping' : service,
      easypost_shipment_id: freeShipping ? '' : shipmentId,
      easypost_rate_id: freeShipping ? '' : rateId,
      sent_at: sendNow ? now.toISOString() : null,
      expires_at: expiresAt.toISOString(),
    })
    .select('id, public_token, invoice_number')
    .single()

  if (invErr || !invoice) return { error: invErr?.message ?? 'Could not create invoice' }

  const { error: linesErr } = await ctx.supabase.from('invoice_line_items').insert(
    lineRows.map((row) => ({ ...row, invoice_id: invoice.id })),
  )
  if (linesErr) return { error: linesErr.message }

  if (sendNow) {
    const mailed = await sendInvoiceEmail({
      to: customer.email,
      customerName: customer.full_name,
      invoiceNumber: invoice.invoice_number,
      totalCents: total,
      token: invoice.public_token,
      sellerName,
      sellerEmail,
      sellerPhone,
    })
    if (!mailed.ok) {
      console.error('[invoice email]', mailed.error)
      revalidatePath('/partner/invoices')
      redirect(
        `/partner/invoices/${invoice.id}?mailError=${encodeURIComponent(mailed.error || 'Email failed to send')}`,
      )
    }
  }

  revalidatePath('/partner/invoices')
  redirect(`/partner/invoices/${invoice.id}`)
}

async function sendInvoiceEmail(params: {
  to: string
  customerName: string
  invoiceNumber: string
  totalCents: number
  token: string
  sellerName: string
  sellerEmail: string
  sellerPhone: string
}): Promise<{ ok: boolean; error?: string }> {
  const payUrl = `${appUrl()}/pay/${params.token}`
  const contactBits = [
    params.sellerEmail ? `Email: ${params.sellerEmail}` : null,
    params.sellerPhone ? `Phone: ${params.sellerPhone}` : null,
  ]
    .filter(Boolean)
    .join('<br/>')

  // Verified company From + Partner Reply-To (best deliverability).
  return sendEmail({
    to: params.to,
    subject: `Invoice ${params.invoiceNumber} from ${params.sellerName}`,
    replyTo: params.sellerEmail || undefined,
    html: emailShell(
      `Invoice ${params.invoiceNumber}`,
      `<p>Dear ${params.customerName},</p>
       <p><strong>${params.sellerName}</strong> has sent you an invoice for <strong>${formatCurrency(params.totalCents)}</strong>.</p>
       ${contactBits ? `<p>${contactBits}</p>` : ''}
       <p style="margin:24px 0;"><a href="${payUrl}" style="background:#3a2108;color:#f5f0e8;padding:12px 20px;text-decoration:none;display:inline-block;">View and pay invoice</a></p>
       <p>Or open: <a href="${payUrl}">${payUrl}</a></p>
       <p style="font-size:10pt;color:#794100;">Questions about this invoice? Reply to this email to reach ${params.sellerName}.</p>`,
    ),
  })
}

export async function partnerResendInvoiceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requirePartnerDistributor()
  if ('error' in ctx) return { error: ctx.error }

  const invoiceId = String(formData.get('invoiceId') ?? '')
  const { data: invoice } = await ctx.supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .eq('distributor_id', ctx.distributor.id)
    .single()

  if (!invoice) return { error: 'Invoice not found.' }
  if (!['sent', 'expired', 'draft'].includes(invoice.status)) {
    return { error: 'Only draft, sent, or expired invoices can be resent.' }
  }

  const now = new Date()
  const expiresAt = new Date(now.getTime() + INVOICE_EXPIRY_DAYS * 24 * 60 * 60 * 1000)

  await ctx.supabase
    .from('invoices')
    .update({
      status: 'sent',
      sent_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .eq('id', invoice.id)

  const mailed = await sendInvoiceEmail({
    to: invoice.customer_email_snapshot,
    customerName: invoice.customer_name_snapshot,
    invoiceNumber: invoice.invoice_number,
    totalCents: invoice.total_cents,
    token: invoice.public_token,
    sellerName: invoice.seller_name_snapshot || ctx.distributor.business_name || ctx.profile.full_name,
    sellerEmail: invoice.seller_email_snapshot || ctx.profile.email,
    sellerPhone: invoice.seller_phone_snapshot || ctx.profile.phone || '',
  })

  if (!mailed.ok) {
    return {
      error: mailed.error
        ? `Could not send email: ${mailed.error}`
        : 'Could not send email. Check Resend domain settings and try again.',
    }
  }

  revalidatePath(`/partner/invoices/${invoice.id}`)
  revalidatePath('/partner/invoices')
  return { success: true, message: `Invoice emailed to ${invoice.customer_email_snapshot}.` }
}

export async function createInvoiceCheckoutAction(token: string): Promise<ActionState & { url?: string }> {
  const admin = createAdminClient()
  const { data: invoice } = await admin
    .from('invoices')
    .select('*, distributors(business_name, profiles!distributors_profile_id_fkey(full_name, email))')
    .eq('public_token', token)
    .single()

  if (!invoice) return { error: 'Invoice not found.' }
  if (invoice.status === 'paid') return { error: 'This invoice is already paid.' }
  if (invoice.status === 'cancelled') return { error: 'This invoice was cancelled.' }

  if (invoice.expires_at && new Date(invoice.expires_at) < new Date() && invoice.status !== 'paid') {
    await admin.from('invoices').update({ status: 'expired' }).eq('id', invoice.id)
    return { error: 'This invoice has expired. Ask your Partner to resend it.' }
  }

  const { data: lines } = await admin
    .from('invoice_line_items')
    .select('*')
    .eq('invoice_id', invoice.id)
    .order('sort_order')

  const stripe = getStripe()

  const { data: distributor } = await admin
    .from('distributors')
    .select(
      'stripe_account_id, stripe_charges_enabled, stripe_onboarding_complete, business_name',
    )
    .eq('id', invoice.distributor_id)
    .single()

  if (!distributor || !isConnectReady(distributor)) {
    return {
      error:
        'This Partner has not finished Stripe Connect setup yet. Ask them to connect their bank under Payments in the Partner portal.',
    }
  }

  // Direct charge on the Partner's connected account (Partner absorbs processing fee).
  const session = await stripe.checkout.sessions.create(
    {
      mode: 'payment',
      success_url: `${appUrl()}/pay/${token}?paid=1`,
      cancel_url: `${appUrl()}/pay/${token}?cancelled=1`,
      customer_email: invoice.customer_email_snapshot,
      metadata: {
        type: 'customer_invoice',
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        distributor_id: invoice.distributor_id,
      },
      payment_intent_data: {
        metadata: {
          type: 'customer_invoice',
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          distributor_id: invoice.distributor_id,
        },
      },
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Invoice ${invoice.invoice_number}`,
              description: [
                ...(lines ?? []).map((l) => `${l.quantity}× ${l.name_snapshot}`),
                invoice.shipping_cents > 0
                  ? `Shipping ${invoice.shipping_carrier} ${invoice.shipping_service}`
                  : invoice.free_shipping
                    ? 'Free shipping'
                    : null,
                invoice.tax_cents > 0 ? `Tax ${formatCurrency(invoice.tax_cents)}` : null,
                invoice.discount_cents > 0
                  ? `Discount −${formatCurrency(invoice.discount_cents)}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · '),
            },
            unit_amount: invoice.total_cents,
          },
          quantity: 1,
        },
      ],
    },
    { stripeAccount: distributor.stripe_account_id! },
  )

  await admin
    .from('invoices')
    .update({ stripe_checkout_session_id: session.id, status: 'sent' })
    .eq('id', invoice.id)

  if (!session.url) return { error: 'Could not create payment session.' }
  return { success: true, url: session.url }
}
