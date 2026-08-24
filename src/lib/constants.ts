export const BRAND = {
  name: 'Purely Eve',
  tagline: 'Partner Portal',
} as const

/** Disambiguates distributors → profiles embed (profile_id vs application_decided_by). */
export const DISTRIBUTOR_PROFILE = 'profiles!distributors_profile_id_fkey' as const

export const COLORS = {
  white: '#ffffff',
  darkBrown: '#3a2108',
  brown: '#794100',
  gold: '#aa7800',
  darkCharcoal: '#1d201f',
  deepForestGreen: '#2d4a2d',
  mediumGreen: '#4a7c4a',
  cream: '#f5f0e8',
  lightBeige: '#e8dcc8',
} as const

export const CONSUMER_SERUM_SKU = 'PE-SERUM-30'

export const PRICING = {
  retailCents: 8400,
  wholesaleCents: 4200,
  introCents: 6900,
  introDays: 30,
} as const

export { AGREEMENT_VERSION_LABEL as AGREEMENT_VERSION } from '@/content/partner-agreement'

export const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
] as const

export const BUSINESS_STRUCTURES = [
  { value: 'sole_proprietor', label: 'Sole proprietor' },
  { value: 'llc', label: 'LLC' },
  { value: 'corporation', label: 'Corporation' },
  { value: 'other', label: 'Other' },
] as const
