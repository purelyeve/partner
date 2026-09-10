import { endOfDay, parseDateParam, startOfMonth, startOfYear } from '@/lib/csv'

export type PeriodKey = 'month' | 'ytd' | 'lifetime' | 'custom'

export function resolvePeriod(params: {
  period?: string
  from?: string
  to?: string
}): { period: PeriodKey; fromIso: string | null; toIso: string | null; label: string } {
  const raw = (params.period ?? 'month').toLowerCase()
  const now = new Date()

  if (raw === 'custom' || params.from || params.to) {
    const from = parseDateParam(params.from)
    const to = params.to ? endOfDay(params.to) : null
    return {
      period: 'custom',
      fromIso: from?.toISOString() ?? null,
      toIso: to?.toISOString() ?? null,
      label: 'Custom range',
    }
  }

  if (raw === 'ytd') {
    return {
      period: 'ytd',
      fromIso: startOfYear(now).toISOString(),
      toIso: null,
      label: 'Year to date',
    }
  }

  if (raw === 'lifetime') {
    return { period: 'lifetime', fromIso: null, toIso: null, label: 'Lifetime' }
  }

  return {
    period: 'month',
    fromIso: startOfMonth(now).toISOString(),
    toIso: null,
    label: 'Calendar month',
  }
}

export function inPaidWindow(
  paidAt: string | null | undefined,
  fromIso: string | null,
  toIso: string | null,
) {
  if (!paidAt) return false
  const t = new Date(paidAt).getTime()
  if (Number.isNaN(t)) return false
  if (fromIso && t < new Date(fromIso).getTime()) return false
  if (toIso && t > new Date(toIso).getTime()) return false
  return true
}

export function partnerSearchHaystack(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(' ').toLowerCase()
}
