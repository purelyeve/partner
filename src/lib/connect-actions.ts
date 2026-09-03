'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  createConnectDashboardLink,
  createConnectOnboardingLink,
  syncConnectAccountStatus,
} from '@/lib/stripe-connect'

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

export async function startConnectOnboardingAction() {
  const ctx = await requirePartner()
  if ('error' in ctx) return { error: ctx.error }

  if (ctx.distributor.application_status !== 'approved') {
    return { error: 'Your Partner account must be approved before connecting Stripe.' }
  }

  const result = await createConnectOnboardingLink({
    distributorId: ctx.distributor.id,
    email: ctx.profile.email,
    businessName: ctx.distributor.business_name || undefined,
  })

  if ('error' in result) return { error: result.error }
  return { url: result.url }
}

export async function openConnectDashboardAction() {
  const ctx = await requirePartner()
  if ('error' in ctx) return { error: ctx.error }

  if (!ctx.distributor.stripe_account_id) {
    return { error: 'Connect Stripe first, then you can open your Stripe dashboard.' }
  }

  await syncConnectAccountStatus(ctx.distributor.stripe_account_id)

  const result = await createConnectDashboardLink(ctx.distributor.stripe_account_id)
  if ('error' in result) return { error: result.error }
  return { url: result.url }
}

export async function refreshConnectStatusAction() {
  const ctx = await requirePartner()
  if ('error' in ctx) return { error: ctx.error }

  if (!ctx.distributor.stripe_account_id) {
    return { error: 'No Stripe account connected yet.' }
  }

  try {
    await syncConnectAccountStatus(ctx.distributor.stripe_account_id)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not refresh Stripe status'
    return { error: message }
  }

  revalidatePath('/partner/payments')
  revalidatePath('/partner')
  return { success: true, message: 'Stripe status updated.' }
}
