import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Distributor, Profile } from '@/lib/types'

export interface SessionContext {
  userId: string
  profile: Profile
  distributor: Distributor | null
}

export async function getSession(): Promise<SessionContext | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) return null

  let distributor: Distributor | null = null
  if (profile.role === 'distributor') {
    const { data } = await supabase
      .from('distributors')
      .select('*')
      .eq('profile_id', user.id)
      .maybeSingle()
    distributor = data
  }

  return { userId: user.id, profile, distributor }
}

export async function requireSession(): Promise<SessionContext> {
  const session = await getSession()
  if (!session) redirect('/login')
  return session
}

export async function requireAdmin(): Promise<SessionContext> {
  const session = await requireSession()
  if (session.profile.role !== 'admin') redirect('/partner')
  return session
}

export async function requireDistributor(): Promise<SessionContext & { distributor: Distributor }> {
  const session = await requireSession()
  if (session.profile.role === 'admin') redirect('/admin')
  if (!session.distributor) redirect('/register')
  return session as SessionContext & { distributor: Distributor }
}

/** Onboarding gates per CLAUDE.md Section 6 */
export function canPurchasePackages(distributor: Distributor): boolean {
  return (
    distributor.application_status === 'approved' &&
    distributor.agreement_signed_at !== null &&
    distributor.resale_accepted_at !== null
  )
}

export function onboardingStep(distributor: Distributor | null): string {
  if (!distributor) return 'register'
  if (distributor.application_status === 'pending') return 'pending'
  if (distributor.application_status === 'declined') return 'declined'
  if (distributor.application_status === 'suspended') return 'suspended'
  if (distributor.application_status === 'removed') return 'removed'
  if (!distributor.agreement_signed_at) return 'agreement'
  if (!distributor.resale_accepted_at) return 'resale'
  return 'ready'
}

export function fulfillmentAddress(distributor: Distributor) {
  if (distributor.fulfillment_same_as_mailing) {
    return {
      name: distributor.business_name,
      line1: distributor.mailing_line1,
      line2: distributor.mailing_line2,
      city: distributor.mailing_city,
      state: distributor.mailing_state,
      postal_code: distributor.mailing_postal_code,
      country: distributor.mailing_country,
    }
  }
  return {
    name: distributor.business_name,
    line1: distributor.fulfillment_line1,
    line2: distributor.fulfillment_line2,
    city: distributor.fulfillment_city,
    state: distributor.fulfillment_state,
    postal_code: distributor.fulfillment_postal_code,
    country: distributor.fulfillment_country,
  }
}
