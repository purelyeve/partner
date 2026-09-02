import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { DISTRIBUTOR_PROFILE } from '@/lib/constants'
import { appUrl, emailShell, notifyCompany, sendEmail } from '@/lib/email'
import { formatCurrency } from '@/lib/utils'
import {
  deductInventoryForPaidInvoice,
  restoreInventoryForRefundedInvoice,
} from '@/lib/inventory'
import { syncConnectAccountStatus } from '@/lib/stripe-connect'
import type Stripe from 'stripe'

export async function POST(request: Request) {
  const body = await request.text()
  const signature = (await headers()).get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  const stripe = getStripe()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook error'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  if (event.type === 'account.updated') {
    const account = event.data.object as Stripe.Account
    try {
      await syncConnectAccountStatus(account.id)
    } catch (err) {
      console.error('[webhook] account.updated sync failed', err)
    }
    return NextResponse.json({ received: true })
  }

  if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge
    const paymentIntentId =
      typeof charge.payment_intent === 'string'
        ? charge.payment_intent
        : charge.payment_intent?.id
    if (paymentIntentId && charge.refunded) {
      const admin = createAdminClient()
      const { data: invoice } = await admin
        .from('invoices')
        .select('id, status, refunded_at, inventory_restored_at')
        .eq('stripe_payment_intent_id', paymentIntentId)
        .maybeSingle()

      if (invoice && invoice.status === 'paid' && !invoice.refunded_at) {
        await admin
          .from('invoices')
          .update({
            status: 'cancelled',
            refunded_at: new Date().toISOString(),
            cancel_reason: 'Refunded via Stripe (webhook)',
          })
          .eq('id', invoice.id)

        try {
          await restoreInventoryForRefundedInvoice(invoice.id)
        } catch (err) {
          console.error('[webhook] restock on refund failed', err)
        }
      } else if (invoice && invoice.refunded_at && !invoice.inventory_restored_at) {
        try {
          await restoreInventoryForRefundedInvoice(invoice.id)
        } catch (err) {
          console.error('[webhook] restock retry failed', err)
        }
      }
    }
    return NextResponse.json({ received: true })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    if (session.metadata?.type === 'package_order' && session.metadata.order_id) {
      const admin = createAdminClient()
      const { data: order } = await admin
        .from('package_orders')
        .select(`*, distributors(business_name, ${DISTRIBUTOR_PROFILE}(email, full_name))`)
        .eq('id', session.metadata.order_id)
        .single()

      if (order && order.status === 'awaiting_payment') {
        await admin
          .from('package_orders')
          .update({
            status: 'paid',
            paid_at: new Date().toISOString(),
            stripe_payment_intent_id: String(session.payment_intent ?? ''),
          })
          .eq('id', order.id)

        const dist = order.distributors as {
          business_name: string
          profiles: { email: string; full_name: string }
        }
        const profiles = dist.profiles

        await sendEmail({
          to: profiles.email,
          subject: `Payment received — order ${order.order_number}`,
          html: emailShell(
            'Inventory order confirmed',
            `<p>Dear ${profiles.full_name},</p><p>Payment for order <strong>${order.order_number}</strong> has been received. Your inventory will ship shortly.</p>`,
          ),
        })

        await notifyCompany({
          subject: `New Partner inventory order — ${order.order_number}`,
          html: emailShell(
            'New inventory package order',
            `<p>A Partner placed a paid inventory package order.</p>
             <p><strong>Order:</strong> ${order.order_number}<br/>
             <strong>Package:</strong> ${order.name_snapshot}<br/>
             <strong>Partner:</strong> ${profiles.full_name} (${profiles.email})<br/>
             <strong>Business:</strong> ${dist.business_name || 'Personal'}<br/>
             <strong>Total:</strong> ${formatCurrency(order.total_cents)}<br/>
             <strong>Ship to:</strong> ${order.ship_to_line1}, ${order.ship_to_city}, ${order.ship_to_state} ${order.ship_to_postal_code}<br/>
             <strong>Service:</strong> ${order.shipping_carrier} ${order.shipping_service}</p>
             <p><a href="${appUrl()}/admin/orders?status=paid">Open inventory orders</a></p>`,
          ),
        })
      }
    }

    if (session.metadata?.type === 'customer_invoice' && session.metadata.invoice_id) {
      const admin = createAdminClient()
      const { data: invoice } = await admin
        .from('invoices')
        .select(
          `*, distributors(business_name, ${DISTRIBUTOR_PROFILE}(email, full_name))`,
        )
        .eq('id', session.metadata.invoice_id)
        .single()

      if (invoice && invoice.status !== 'paid' && invoice.status !== 'cancelled') {
        await admin
          .from('invoices')
          .update({
            status: 'paid',
            paid_at: new Date().toISOString(),
            stripe_payment_intent_id: String(session.payment_intent ?? ''),
            stripe_checkout_session_id: session.id,
          })
          .eq('id', invoice.id)

        try {
          await deductInventoryForPaidInvoice(invoice.id)
        } catch (err) {
          console.error('[webhook] inventory deduct failed', err)
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
                 <a href="${appUrl()}/partner/orders/${invoice.id}" style="background:#3a2108;color:#f5f0e8;padding:12px 20px;text-decoration:none;display:inline-block;">Open fulfillment</a>
               </p>
               <p><a href="${appUrl()}/partner/orders">Pending orders</a> · <a href="${appUrl()}/partner">Dashboard</a></p>`,
            ),
          })
        }

        if (invoice.customer_email_snapshot) {
          const seller =
            invoice.seller_name_snapshot ||
            dist?.business_name ||
            partnerName
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
      }
    }
  }

  return NextResponse.json({ received: true })
}

export const runtime = 'nodejs'
