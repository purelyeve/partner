import { getStripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { appUrl } from '@/lib/email'
import type { Distributor } from '@/lib/types'

export function isConnectReady(distributor: Pick<
  Distributor,
  'stripe_account_id' | 'stripe_charges_enabled' | 'stripe_onboarding_complete'
>): boolean {
  return Boolean(
    distributor.stripe_account_id &&
      distributor.stripe_charges_enabled &&
      distributor.stripe_onboarding_complete,
  )
}

/** Create Express connected account if missing; return Stripe Account Link URL. */
export async function createConnectOnboardingLink(params: {
  distributorId: string
  email: string
  businessName?: string
  refreshPath?: string
  returnPath?: string
}): Promise<{ url: string } | { error: string }> {
  const admin = createAdminClient()
  const { data: dist } = await admin
    .from('distributors')
    .select('id, stripe_account_id, business_name')
    .eq('id', params.distributorId)
    .single()

  if (!dist) return { error: 'Partner account not found.' }

  const stripe = getStripe()
  let accountId = dist.stripe_account_id as string | null

  if (!accountId) {
    try {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        email: params.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_profile: {
          name: params.businessName || dist.business_name || undefined,
          product_description: 'Purely Eve Partner — skincare resale',
        },
        metadata: {
          distributor_id: params.distributorId,
        },
      })
      accountId = account.id
      await admin
        .from('distributors')
        .update({
          stripe_account_id: accountId,
          stripe_charges_enabled: account.charges_enabled ?? false,
          stripe_payouts_enabled: account.payouts_enabled ?? false,
          stripe_details_submitted: account.details_submitted ?? false,
          stripe_onboarding_complete: Boolean(
            account.charges_enabled && account.details_submitted,
          ),
        })
        .eq('id', params.distributorId)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not create Stripe account'
      console.error('[connect] accounts.create', message)
      return { error: message }
    }
  }

  const refreshUrl = `${appUrl()}${params.refreshPath ?? '/partner/payments?refresh=1'}`
  const returnUrl = `${appUrl()}${params.returnPath ?? '/partner/payments?return=1'}`

  try {
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    })
    return { url: link.url }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not start Stripe onboarding'
    console.error('[connect] accountLinks.create', message)
    return { error: message }
  }
}

/** Stripe Express login link so Partner can edit bank / view payouts. */
export async function createConnectDashboardLink(
  stripeAccountId: string,
): Promise<{ url: string } | { error: string }> {
  const stripe = getStripe()
  try {
    const link = await stripe.accounts.createLoginLink(stripeAccountId)
    return { url: link.url }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not open Stripe dashboard'
    console.error('[connect] createLoginLink', message)
    return { error: message }
  }
}

/** Sync Connect flags from Stripe after onboarding return or webhook. */
export async function syncConnectAccountStatus(stripeAccountId: string): Promise<void> {
  const stripe = getStripe()
  const account = await stripe.accounts.retrieve(stripeAccountId)
  const admin = createAdminClient()
  await admin
    .from('distributors')
    .update({
      stripe_charges_enabled: account.charges_enabled ?? false,
      stripe_payouts_enabled: account.payouts_enabled ?? false,
      stripe_details_submitted: account.details_submitted ?? false,
      stripe_onboarding_complete: Boolean(
        account.charges_enabled && account.details_submitted,
      ),
    })
    .eq('stripe_account_id', stripeAccountId)
}

export async function getConnectBalanceSummary(stripeAccountId: string): Promise<{
  availableCents: number
  pendingCents: number
  currency: string
} | null> {
  const stripe = getStripe()
  try {
    const balance = await stripe.balance.retrieve(undefined, {
      stripeAccount: stripeAccountId,
    })
    const currency = balance.available[0]?.currency ?? balance.pending[0]?.currency ?? 'usd'
    const availableCents = balance.available
      .filter((b) => b.currency === currency)
      .reduce((sum, b) => sum + b.amount, 0)
    const pendingCents = balance.pending
      .filter((b) => b.currency === currency)
      .reduce((sum, b) => sum + b.amount, 0)
    return { availableCents, pendingCents, currency }
  } catch (err) {
    console.error('[connect] balance.retrieve', err)
    return null
  }
}

export async function listConnectPayouts(
  stripeAccountId: string,
  limit = 10,
): Promise<
  Array<{
    id: string
    amountCents: number
    currency: string
    status: string
    arrivalDate: number | null
    created: number
  }>
> {
  const stripe = getStripe()
  try {
    const payouts = await stripe.payouts.list(
      { limit },
      { stripeAccount: stripeAccountId },
    )
    return payouts.data.map((p) => ({
      id: p.id,
      amountCents: p.amount,
      currency: p.currency,
      status: p.status,
      arrivalDate: p.arrival_date ?? null,
      created: p.created,
    }))
  } catch (err) {
    console.error('[connect] payouts.list', err)
    return []
  }
}
