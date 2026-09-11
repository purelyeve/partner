import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { DISTRIBUTOR_PROFILE } from '@/lib/constants'
import { appUrl, emailShell, notifyCompany, sendEmail } from '@/lib/email'
import { formatCurrency } from '@/lib/utils'
import { restoreInventoryForRefundedInvoice, reverseInventoryForRefundedPackageOrder } from '@/lib/inventory'
import { syncConnectAccountStatus } from '@/lib/stripe-connect'
import { markCustomerInvoicePaid } from '@/lib/invoice-paid'
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

      const { data: packageOrder } = await admin
        .from('package_orders')
        .select('id, status, refunded_at')
        .eq('stripe_payment_intent_id', paymentIntentId)
        .maybeSingle()

      if (packageOrder && ['paid', 'fulfilled'].includes(packageOrder.status) && !packageOrder.refunded_at) {
        await admin
          .from('package_orders')
          .update({
            status: 'cancelled',
            refunded_at: new Date().toISOString(),
            cancel_reason: 'Refunded via Stripe (webhook)',
          })
          .eq('id', packageOrder.id)
        try {
          await reverseInventoryForRefundedPackageOrder(packageOrder.id)
        } catch (err) {
          console.error('[webhook] package stock reverse failed', err)
        }
      }
    }
    return NextResponse.json({ received: true })
  }

  async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
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
      const result = await markCustomerInvoicePaid({
        invoiceId: session.metadata.invoice_id,
        paymentIntentId: session.payment_intent
          ? String(session.payment_intent)
          : null,
        checkoutSessionId: session.id,
      })
      if (!result.ok) {
        console.error('[webhook] markCustomerInvoicePaid', result.error)
      }
    }
  }

  if (event.type === 'checkout.session.completed') {
    await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session)
  }

  // Connect fallback: some destinations deliver payment_intent.succeeded instead.
  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object as Stripe.PaymentIntent
    const invoiceId = pi.metadata?.invoice_id
    if (pi.metadata?.type === 'customer_invoice' && invoiceId) {
      const result = await markCustomerInvoicePaid({
        invoiceId,
        paymentIntentId: pi.id,
      })
      if (!result.ok) {
        console.error('[webhook] PI markCustomerInvoicePaid', result.error)
      }
    }
  }

  return NextResponse.json({ received: true })
}

export const runtime = 'nodejs'
