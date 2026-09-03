'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  createConnectDashboardLink,
  createConnectOnboardingLink,
  syncConnectAccountStatus,
} from '@/lib/stripe-connect'
import { encryptSecret, secretLast4 } from '@/lib/crypto'
import {
  createEasyPostChildUser,
  pickEasyPostKeyForEnv,
} from '@/lib/easypost-partner'

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

export async function savePartnerEasyPostKeyAction(formData: FormData) {
  const ctx = await requirePartner()
  if ('error' in ctx) return { error: ctx.error }

  const raw = String(formData.get('easypostApiKey') ?? '').trim()
  const clear = formData.get('clearKey') === '1'

  if (clear) {
    const { error } = await ctx.supabase
      .from('distributors')
      .update({
        easypost_api_key_ciphertext: null,
        easypost_api_key_last4: null,
      })
      .eq('id', ctx.distributor.id)
    if (error) return { error: error.message }
    revalidatePath('/partner/payments')
    revalidatePath('/partner/profile')
    return { success: true, message: 'EasyPost key removed.' }
  }

  if (!raw) {
    return { error: 'Paste your EasyPost API key (Test key for staging, Production key for live).' }
  }

  if (raw.length < 10) {
    return { error: 'That does not look like a valid EasyPost API key.' }
  }

  let ciphertext: string
  try {
    ciphertext = encryptSecret(raw)
  } catch {
    return {
      error: 'Server encryption is not configured. Contact support before saving API keys.',
    }
  }

  const { error } = await ctx.supabase
    .from('distributors')
    .update({
      easypost_api_key_ciphertext: ciphertext,
      easypost_api_key_last4: secretLast4(raw),
    })
    .eq('id', ctx.distributor.id)

  if (error) return { error: error.message }

  revalidatePath('/partner/payments')
  revalidatePath('/partner/profile')
  return { success: true, message: 'EasyPost API key saved. Customer labels will bill this account.' }
}

/**
 * One-click EasyPost setup from the portal (no EasyPost website visit).
 * Tries child user under company parent; falls back to company key for rates/labels.
 */
export async function enablePartnerEasyPostAction() {
  const ctx = await requirePartner()
  if ('error' in ctx) return { error: ctx.error }

  if (ctx.distributor.application_status !== 'approved') {
    return { error: 'Your Partner account must be approved first.' }
  }

  // Already set up
  if (ctx.distributor.easypost_api_key_last4 || ctx.distributor.easypost_use_company) {
    return { success: true, message: 'EasyPost shipping is already enabled.' }
  }

  const name =
    ctx.distributor.business_name ||
    ctx.profile.full_name ||
    ctx.profile.email ||
    `Partner ${ctx.distributor.id.slice(0, 8)}`

  const child = await createEasyPostChildUser({ name: `PE Partner — ${name}` })

  if (child.ok) {
    const key = pickEasyPostKeyForEnv(child)
    if (!key) {
      // Child created but no key returned — use company fallback
      const { error } = await ctx.supabase
        .from('distributors')
        .update({
          easypost_user_id: child.userId,
          easypost_use_company: true,
          easypost_api_key_last4: 'CO',
        })
        .eq('id', ctx.distributor.id)
      if (error) return { error: error.message }
      revalidatePath('/partner/payments')
      return {
        success: true,
        message:
          'EasyPost shipping enabled (company account). USPS/UPS rates are available on invoices.',
      }
    }

    let ciphertext: string
    try {
      ciphertext = encryptSecret(key)
    } catch {
      return { error: 'Server encryption is not configured.' }
    }

    const { error } = await ctx.supabase
      .from('distributors')
      .update({
        easypost_user_id: child.userId,
        easypost_api_key_ciphertext: ciphertext,
        easypost_api_key_last4: secretLast4(key),
        easypost_use_company: false,
      })
      .eq('id', ctx.distributor.id)

    if (error) return { error: error.message }
    revalidatePath('/partner/payments')
    revalidatePath('/partner')
    return {
      success: true,
      message: 'EasyPost shipping enabled. Carrier rates will show when you create invoices.',
    }
  }

  // Test key / child create blocked — enable company key fallback so USPS/UPS work.
  if (!process.env.EASYPOST_API_KEY) {
    return {
      error:
        child.error ||
        'Company EasyPost is not configured. Add EASYPOST_API_KEY on the server first.',
    }
  }

  const { error } = await ctx.supabase
    .from('distributors')
    .update({
      easypost_use_company: true,
      easypost_api_key_last4: 'CO',
      easypost_api_key_ciphertext: null,
    })
    .eq('id', ctx.distributor.id)

  if (error) return { error: error.message }
  revalidatePath('/partner/payments')
  revalidatePath('/partner')
  return {
    success: true,
    message:
      'EasyPost shipping enabled for your account. Carrier rates (USPS/UPS) are available on new invoices.',
  }
}
