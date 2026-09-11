import { requireAdmin } from '@/lib/auth'
import { getAdminDb } from '@/lib/admin'
import { DISTRIBUTOR_PROFILE } from '@/lib/constants'
import { csvResponse, rowsToCsv } from '@/lib/csv'
import { inPaidWindow, resolvePeriod } from '@/lib/admin-reports'
import { customerTypeLabel } from '@/lib/utils'
import type { Profile } from '@/lib/types'

function profileOf(dist: { profiles?: Profile | Profile[] } | null | undefined) {
  if (!dist?.profiles) return undefined
  return Array.isArray(dist.profiles) ? dist.profiles[0] : dist.profiles
}

export async function GET(request: Request) {
  await requireAdmin()
  const url = new URL(request.url)
  const report = url.searchParams.get('report') ?? ''
  const q = url.searchParams.get('q') ?? undefined
  const from = url.searchParams.get('from') ?? undefined
  const to = url.searchParams.get('to') ?? undefined
  const period = url.searchParams.get('period') ?? undefined
  const partner = url.searchParams.get('partner') ?? undefined
  const type = url.searchParams.get('type') ?? undefined
  const state = url.searchParams.get('state') ?? undefined
  const status = url.searchParams.get('status') ?? undefined
  const pkg = url.searchParams.get('package') ?? undefined
  const { fromIso, toIso } = resolvePeriod({ period, from, to })
  const supabase = getAdminDb()
  const stamp = new Date().toISOString().slice(0, 10)

  if (report === 'package-sales') {
    let query = supabase
      .from('package_orders')
      .select(
        `order_number, paid_at, created_at, total_cents, quantity, unit_count_snapshot, name_snapshot, sku_snapshot, status, distributors(business_name, ${DISTRIBUTOR_PROFILE}(full_name, email))`,
      )
      .in('status', ['paid', 'fulfilled'])
      .order('paid_at', { ascending: false })
      .limit(5000)
    if (from) query = query.gte('paid_at', new Date(from).toISOString())
    if (to) {
      const end = new Date(to)
      end.setHours(23, 59, 59, 999)
      query = query.lte('paid_at', end.toISOString())
    }
    const { data } = await query
    const term = (q ?? '').trim().toLowerCase()
    const rows = (data ?? []).filter((o) => {
      if (!term) return true
      const dist = o.distributors as { business_name?: string; profiles?: Profile | Profile[] } | null
      const p = profileOf(dist)
      return `${dist?.business_name ?? ''} ${p?.full_name ?? ''} ${p?.email ?? ''} ${o.name_snapshot} ${o.order_number}`
        .toLowerCase()
        .includes(term)
    })
    const csv = rowsToCsv(
      ['Date', 'Order', 'Partner', 'Email', 'Package', 'SKU', 'Units', 'Amount', 'Status'],
      rows.map((o) => {
        const dist = o.distributors as { business_name?: string; profiles?: Profile | Profile[] } | null
        const p = profileOf(dist)
        return [
          o.paid_at || o.created_at,
          o.order_number,
          dist?.business_name?.trim() || p?.full_name || '',
          p?.email || '',
          o.name_snapshot,
          o.sku_snapshot,
          (o.unit_count_snapshot ?? 0) * (o.quantity ?? 1),
          ((o.total_cents ?? 0) / 100).toFixed(2),
          o.status,
        ]
      }),
    )
    return csvResponse(`package-sales-${stamp}.csv`, csv)
  }

  if (report === 'package-volume') {
    const { data } = await supabase
      .from('package_orders')
      .select(
        `paid_at, total_cents, quantity, unit_count_snapshot, name_snapshot, sku_snapshot, package_id, distributors(business_name, ${DISTRIBUTOR_PROFILE}(full_name, email))`,
      )
      .in('status', ['paid', 'fulfilled'])
      .limit(5000)
    const term = (q ?? '').trim().toLowerCase()
    const rows = (data ?? []).filter((o) => {
      if (!inPaidWindow(o.paid_at, fromIso, toIso)) return false
      if (pkg && o.package_id !== pkg && o.sku_snapshot !== pkg) return false
      if (!term) return true
      const dist = o.distributors as { business_name?: string; profiles?: Profile | Profile[] } | null
      const p = profileOf(dist)
      return `${dist?.business_name ?? ''} ${p?.full_name ?? ''} ${p?.email ?? ''} ${o.name_snapshot}`
        .toLowerCase()
        .includes(term)
    })
    const csv = rowsToCsv(
      ['Paid', 'Partner', 'Package', 'SKU', 'Units', 'Amount'],
      rows.map((o) => {
        const dist = o.distributors as { business_name?: string; profiles?: Profile | Profile[] } | null
        const p = profileOf(dist)
        return [
          o.paid_at,
          dist?.business_name?.trim() || p?.full_name || '',
          o.name_snapshot,
          o.sku_snapshot,
          (o.unit_count_snapshot ?? 0) * (o.quantity ?? 1),
          ((o.total_cents ?? 0) / 100).toFixed(2),
        ]
      }),
    )
    return csvResponse(`package-volume-${stamp}.csv`, csv)
  }

  if (report === 'customer-orders' || report === 'customer-volume') {
    const { data } = await supabase
      .from('invoices')
      .select(
        `invoice_number, customer_type, customer_name_snapshot, total_cents, subtotal_cents, tax_cents, shipping_cents, paid_at, ship_to_state, distributor_id, distributors(business_name, ${DISTRIBUTOR_PROFILE}(full_name, email))`,
      )
      .eq('status', 'paid')
      .is('refunded_at', null)
      .limit(5000)
    const typeFilter = (type ?? 'all').toLowerCase()
    const rows = (data ?? []).filter((inv) => {
      if (!inPaidWindow(inv.paid_at, fromIso, toIso)) return false
      if (partner && inv.distributor_id !== partner) return false
      if (typeFilter === 'retail' && inv.customer_type !== 'direct_to_customer') return false
      if (typeFilter === 'wholesale' && inv.customer_type !== 'retail_wholesale') return false
      if (!q) return true
      const dist = inv.distributors as { business_name?: string; profiles?: Profile | Profile[] } | null
      const p = profileOf(dist)
      return `${dist?.business_name ?? ''} ${p?.full_name ?? ''} ${inv.customer_name_snapshot} ${inv.invoice_number}`
        .toLowerCase()
        .includes(q.toLowerCase())
    })
    const csv = rowsToCsv(
      ['Paid', 'Invoice', 'Partner', 'Customer', 'Type', 'State', 'Subtotal', 'Shipping', 'Tax', 'Total'],
      rows.map((inv) => {
        const dist = inv.distributors as { business_name?: string; profiles?: Profile | Profile[] } | null
        const p = profileOf(dist)
        return [
          inv.paid_at,
          inv.invoice_number,
          dist?.business_name?.trim() || p?.full_name || '',
          inv.customer_name_snapshot,
          customerTypeLabel(inv.customer_type),
          inv.ship_to_state,
          ((inv.subtotal_cents ?? 0) / 100).toFixed(2),
          ((inv.shipping_cents ?? 0) / 100).toFixed(2),
          ((inv.tax_cents ?? 0) / 100).toFixed(2),
          ((inv.total_cents ?? 0) / 100).toFixed(2),
        ]
      }),
    )
    return csvResponse(`${report}-${stamp}.csv`, csv)
  }

  if (report === 'tax') {
    const { data } = await supabase
      .from('invoices')
      .select(
        `invoice_number, tax_cents, paid_at, ship_to_state, customer_name_snapshot, distributor_id, distributors(business_name, ${DISTRIBUTOR_PROFILE}(full_name))`,
      )
      .eq('status', 'paid')
      .is('refunded_at', null)
      .gt('tax_cents', 0)
      .limit(5000)
    const stateFilter = (state ?? '').trim().toUpperCase()
    const rows = (data ?? []).filter((inv) => {
      if (!inPaidWindow(inv.paid_at, fromIso, toIso)) return false
      if (partner && inv.distributor_id !== partner) return false
      if (stateFilter && (inv.ship_to_state || '').toUpperCase() !== stateFilter) return false
      return true
    })
    const csv = rowsToCsv(
      ['Paid', 'Invoice', 'Partner', 'Customer', 'State', 'Tax'],
      rows.map((inv) => {
        const dist = inv.distributors as { business_name?: string; profiles?: Profile | Profile[] } | null
        const p = profileOf(dist)
        return [
          inv.paid_at,
          inv.invoice_number,
          dist?.business_name?.trim() || p?.full_name || '',
          inv.customer_name_snapshot,
          (inv.ship_to_state || '').toUpperCase(),
          ((inv.tax_cents ?? 0) / 100).toFixed(2),
        ]
      }),
    )
    return csvResponse(`tax-collected-${stamp}.csv`, csv)
  }

  if (report === 'shipping') {
    const { data } = await supabase
      .from('invoices')
      .select(
        `invoice_number, shipping_cents, paid_at, fulfilled_at, customer_name_snapshot, distributor_id, distributors(business_name, ${DISTRIBUTOR_PROFILE}(full_name))`,
      )
      .eq('status', 'paid')
      .is('refunded_at', null)
      .gt('shipping_cents', 0)
      .limit(5000)
    const statusFilter = (status ?? 'all').toLowerCase()
    const rows = (data ?? []).filter((inv) => {
      if (!inPaidWindow(inv.paid_at, fromIso, toIso)) return false
      if (partner && inv.distributor_id !== partner) return false
      const fulfilled = Boolean(inv.fulfilled_at)
      if (statusFilter === 'fulfilled' && !fulfilled) return false
      if (statusFilter === 'pending' && fulfilled) return false
      return true
    })
    const csv = rowsToCsv(
      ['Paid', 'Invoice', 'Partner', 'Customer', 'Shipping', 'Label status'],
      rows.map((inv) => {
        const dist = inv.distributors as { business_name?: string; profiles?: Profile | Profile[] } | null
        const p = profileOf(dist)
        return [
          inv.paid_at,
          inv.invoice_number,
          dist?.business_name?.trim() || p?.full_name || '',
          inv.customer_name_snapshot,
          ((inv.shipping_cents ?? 0) / 100).toFixed(2),
          inv.fulfilled_at ? 'Fulfilled' : 'Pending',
        ]
      }),
    )
    return csvResponse(`shipping-collected-${stamp}.csv`, csv)
  }

  if (report === 'stripe') {
    const [{ data: invoices }, { data: packages }] = await Promise.all([
      supabase
        .from('invoices')
        .select('invoice_number, shipping_cents, paid_at')
        .eq('status', 'paid')
        .is('refunded_at', null)
        .limit(5000),
      supabase
        .from('package_orders')
        .select('order_number, total_cents, paid_at, status')
        .in('status', ['paid', 'fulfilled'])
        .limit(5000),
    ])
    const invRows = (invoices ?? []).filter((i) => inPaidWindow(i.paid_at, fromIso, toIso))
    const pkgRows = (packages ?? []).filter((o) => inPaidWindow(o.paid_at, fromIso, toIso))
    const csv = rowsToCsv(
      ['Type', 'Reference', 'Paid', 'Amount'],
      [
        ...invRows.map((i) => [
          'Customer shipping',
          i.invoice_number,
          i.paid_at,
          ((i.shipping_cents ?? 0) / 100).toFixed(2),
        ]),
        ...pkgRows.map((o) => [
          'Inventory package',
          o.order_number,
          o.paid_at,
          ((o.total_cents ?? 0) / 100).toFixed(2),
        ]),
      ],
    )
    return csvResponse(`company-stripe-${stamp}.csv`, csv)
  }

  return new Response('Unknown report', { status: 400 })
}
