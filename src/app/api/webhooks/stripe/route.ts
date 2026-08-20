import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { DISTRIBUTOR_PROFILE } from '@/lib/constants'
import { emailShell, sendEmail } from '@/lib/email'

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
        .select(`*, distributors(${DISTRIBUTOR_PROFILE}(email, full_name))`)
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

        const profiles = (order.distributors as { profiles: { email: string; full_name: string } }).profiles
        await sendEmail({
          to: profiles.email,
          subject: `Payment received — order ${order.order_number}`,
          html: emailShell(
            'Inventory order confirmed',
            `<p>Dear ${profiles.full_name},</p><p>Payment for order <strong>${order.order_number}</strong> has been received. Your inventory will ship shortly.</p>`,
          ),
        })
      }
    }
  }

  return NextResponse.json({ received: true })
}

export const runtime = 'nodejs'
