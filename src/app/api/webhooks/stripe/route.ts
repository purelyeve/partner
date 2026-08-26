import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { DISTRIBUTOR_PROFILE } from '@/lib/constants'
import { appUrl, emailShell, notifyCompany, sendEmail } from '@/lib/email'
import { formatCurrency } from '@/lib/utils'

export async function POST(request: Request) {
  const body = await request.text()
  const signature = (await headers()).get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  const stripe = getStripe()
  let event
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

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
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
  }

  return NextResponse.json({ received: true })
}

export const runtime = 'nodejs'
