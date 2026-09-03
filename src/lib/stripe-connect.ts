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

function stripeErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message
  }
  if (err instanceof Error) return err.message
  return fallback
}

/** Create connected account via Accounts v2; return Stripe-hosted onboarding URL. */
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
      const displayName =
        params.businessName || dist.business_name || params.email.split('@')[0] || 'Partner'

      // Accounts v2 — required for new Connect platforms (v1 create is blocked by default).
      // Prefills website + beauty retail MCC for Stripe onboarding (Partner can still edit).
      const account = await stripe.v2.core.accounts.create({
        contact_email: params.email,
        display_name: displayName,
        identity: {
          country: 'us',
        },
        dashboard: 'none',
        defaults: {
          responsibilities: {
            fees_collector: 'stripe',
            losses_collector: 'stripe',
          },
          profile: {
            business_url: 'https://purelyeve.com',
            product_description:
              'Retail beauty and skincare products (Purely Eve Partner reseller)',
          },
        },
        configuration: {
          merchant: {
            mcc: '5977',
            capabilities: {
              card_payments: { requested: true },
            },
          },
        },
        metadata: {
          distributor_id: params.distributorId,
        },
        include: ['configuration.merchant', 'defaults', 'identity'],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      accountId = account.id

      // v1 retrieve still works for status flags used by the portal.
      let chargesEnabled = false
      let payoutsEnabled = false
      let detailsSubmitted = false
      try {
        const v1 = await stripe.accounts.retrieve(accountId)
        chargesEnabled = v1.charges_enabled ?? false
        payoutsEnabled = v1.payouts_enabled ?? false
        detailsSubmitted = v1.details_submitted ?? false
      } catch {
        // New account — flags stay false until onboarding completes.
      }

      await admin
        .from('distributors')
        .update({
          stripe_account_id: accountId,
          stripe_charges_enabled: chargesEnabled,
          stripe_payouts_enabled: payoutsEnabled,
          stripe_details_submitted: detailsSubmitted,
          stripe_onboarding_complete: Boolean(chargesEnabled && detailsSubmitted),
        })
        .eq('id', params.distributorId)
    } catch (err) {
      const message = stripeErrorMessage(err, 'Could not create Stripe account')
      console.error('[connect] v2 accounts.create', message)
      return { error: message }
    }
  }

  const refreshUrl = `${appUrl()}${params.refreshPath ?? '/partner/payments?refresh=1'}`
  const returnUrl = `${appUrl()}${params.returnPath ?? '/partner/payments?return=1'}`

  try {
    // Prefer v2 account links when available; fall back to v1 Account Links.
    try {
      const v2Link = await stripe.v2.core.accountLinks.create({
        account: accountId,
        use_case: {
          type: 'account_onboarding',
          account_onboarding: {
            configurations: ['merchant'],
            refresh_url: refreshUrl,
            return_url: returnUrl,
          },
        },
      })
      if (v2Link.url) return { url: v2Link.url }
    } catch (v2Err) {
      console.warn('[connect] v2 accountLinks failed, trying v1', stripeErrorMessage(v2Err, ''))
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    })
    return { url: link.url }
  } catch (err) {
    const message = stripeErrorMessage(err, 'Could not start Stripe onboarding')
    console.error('[connect] accountLinks.create', message)
    return { error: message }
  }
}

/**
 * Open Stripe so Partner can edit bank / view payouts.
 * Tries Express login link; if dashboard is "none", falls back to hosted onboarding/update link.
 */
export async function createConnectDashboardLink(
  stripeAccountId: string,
): Promise<{ url: string } | { error: string }> {
  const stripe = getStripe()
  try {
    const link = await stripe.accounts.createLoginLink(stripeAccountId)
    return { url: link.url }
  } catch {
    // dashboard: none accounts have no Express login link — use hosted update flow.
    const refreshUrl = `${appUrl()}/partner/payments?refresh=1`
    const returnUrl = `${appUrl()}/partner/payments?return=1`
    try {
      const v2Link = await stripe.v2.core.accountLinks.create({
        account: stripeAccountId,
        use_case: {
          type: 'account_onboarding',
          account_onboarding: {
            configurations: ['merchant'],
            refresh_url: refreshUrl,
            return_url: returnUrl,
          },
        },
      })
      if (v2Link.url) return { url: v2Link.url }
    } catch (v2Err) {
      console.warn('[connect] v2 update link failed', stripeErrorMessage(v2Err, ''))
    }
    try {
      const link = await stripe.accountLinks.create({
        account: stripeAccountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: 'account_onboarding',
      })
      return { url: link.url }
    } catch (err) {
      const message = stripeErrorMessage(err, 'Could not open Stripe dashboard')
      console.error('[connect] dashboard link', message)
      return { error: message }
    }
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
