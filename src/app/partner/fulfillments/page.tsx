import Link from 'next/link'
import { Badge, Card } from '@/components/ui'
import { requireDistributor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency, formatDate } from '@/lib/utils'

export default async function PartnerFulfillmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const { distributor } = await requireDistributor()
  const { filter } = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('invoices')
    .select(
      'id, invoice_number, status, total_cents, paid_at, fulfilled_at, tracking_code, customer_name_snapshot, refunded_at',
    )
    .eq('distributor_id', distributor.id)
    .in('status', ['paid', 'cancelled'])
    .order('paid_at', { ascending: false })

  if (filter === 'pending') {
    query = query.eq('status', 'paid').is('fulfilled_at', null).is('refunded_at', null)
  } else if (filter === 'shipped') {
    query = query.eq('status', 'paid').not('fulfilled_at', 'is', null)
  } else if (filter === 'refunded') {
    query = query.not('refunded_at', 'is', null)
  }

  const { data: orders } = await query.limit(100)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl">Fulfillments</h1>
          <p className="text-sm text-pe-brown">
            Paid customer invoices awaiting ship, shipped, or refunded.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/partner/fulfillments?filter=pending" className="nav-link">
            Pending
          </Link>
          <Link href="/partner/fulfillments?filter=shipped" className="nav-link">
            Shipped
          </Link>
          <Link href="/partner/fulfillments?filter=refunded" className="nav-link">
            Refunded
          </Link>
          <Link href="/partner/fulfillments" className="nav-link">
            All
          </Link>
        </div>
      </div>

      {!orders?.length ? (
        <Card>
          <p className="text-sm text-pe-brown">No fulfillments in this view yet.</p>
        </Card>
      ) : (
        <div className="border border-pe-beige bg-white rounded-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-pe-cream text-left">
              <tr>
                <th className="p-3">Invoice</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Paid</th>
                <th className="p-3">Total</th>
                <th className="p-3">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const pendingShip =
                  o.status === 'paid' && !o.fulfilled_at && !o.refunded_at
                const shipped = Boolean(o.fulfilled_at) && !o.refunded_at
                return (
                  <tr key={o.id} className="border-t border-pe-beige">
                    <td className="p-3 font-medium">{o.invoice_number}</td>
                    <td className="p-3">{o.customer_name_snapshot}</td>
                    <td className="p-3">{o.paid_at ? formatDate(o.paid_at) : '—'}</td>
                    <td className="p-3">{formatCurrency(o.total_cents)}</td>
                    <td className="p-3">
                      <Badge
                        tone={
                          o.refunded_at
                            ? 'error'
                            : shipped
                              ? 'success'
                              : pendingShip
                                ? 'gold'
                                : 'neutral'
                        }
                      >
                        {o.refunded_at
                          ? 'Refunded'
                          : shipped
                            ? 'Fulfilled'
                            : pendingShip
                              ? 'Unfulfilled'
                              : o.status}
                      </Badge>
                      {o.tracking_code ? (
                        <p className="text-xs text-pe-brown mt-1">{o.tracking_code}</p>
                      ) : null}
                    </td>
                    <td className="p-3 text-right">
                      <Link href={`/partner/fulfillments/${o.id}`}>Open</Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
