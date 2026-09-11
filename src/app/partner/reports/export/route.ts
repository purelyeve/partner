import { requireDistributor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { inPaidWindow, resolvePeriod } from '@/lib/admin-reports'
import { csvResponse, rowsToCsv } from '@/lib/csv'
import { customerTypeLabel } from '@/lib/utils'

export async function GET(request: Request) {
  const { distributor } = await requireDistributor()
  const url = new URL(request.url)
  const period = url.searchParams.get('period') ?? undefined
  const from = url.searchParams.get('from') ?? undefined
  const to = url.searchParams.get('to') ?? undefined
  const kind = url.searchParams.get('kind') ?? 'sales'
  const { fromIso, toIso } = resolvePeriod({ period, from, to })
  const stamp = new Date().toISOString().slice(0, 10)

  const supabase = await createClient()
  const { data: invoices } = await supabase
    .from('invoices')
    .select(
      'invoice_number, customer_type, customer_name_snapshot, total_cents, subtotal_cents, tax_cents, shipping_cents, paid_at, ship_to_state',
    )
    .eq('distributor_id', distributor.id)
    .eq('status', 'paid')
    .is('refunded_at', null)
    .order('paid_at', { ascending: false })
    .limit(5000)

  const filtered = (invoices ?? []).filter((i) => inPaidWindow(i.paid_at, fromIso, toIso))

  if (kind === 'tax-by-state') {
    const byState = new Map<string, { tax: number; count: number }>()
    for (const inv of filtered) {
      if (!(inv.tax_cents > 0)) continue
      const state = (inv.ship_to_state || '—').toUpperCase()
      const row = byState.get(state) ?? { tax: 0, count: 0 }
      row.tax += inv.tax_cents ?? 0
      row.count += 1
      byState.set(state, row)
    }
    const csv = rowsToCsv(
      ['State', 'Orders with tax', 'Tax'],
      Array.from(byState.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([state, row]) => [state, row.count, (row.tax / 100).toFixed(2)]),
    )
    return csvResponse(`partner-tax-by-state-${stamp}.csv`, csv)
  }

  const csv = rowsToCsv(
    ['Paid', 'Invoice', 'Customer', 'Type', 'State', 'Subtotal', 'Shipping', 'Tax', 'Total'],
    filtered.map((i) => [
      i.paid_at ?? '',
      i.invoice_number,
      i.customer_name_snapshot,
      customerTypeLabel(i.customer_type),
      i.ship_to_state,
      ((i.subtotal_cents ?? 0) / 100).toFixed(2),
      ((i.shipping_cents ?? 0) / 100).toFixed(2),
      ((i.tax_cents ?? 0) / 100).toFixed(2),
      ((i.total_cents ?? 0) / 100).toFixed(2),
    ]),
  )

  return csvResponse(`partner-sales-${stamp}.csv`, csv)
}
