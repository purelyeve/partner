import Link from 'next/link'
import { Button } from '@/components/ui'
import { requireDistributor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'
import DeleteCustomerButton from './delete-customer-button'

export default async function PartnerCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; from?: string; to?: string }>
}) {
  const { distributor } = await requireDistributor()
  const { q, from, to } = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('customers')
    .select(
      'id, full_name, email, phone, billing_city, billing_state, resale_certificate_number, created_at',
    )
    .eq('distributor_id', distributor.id)
    .order('full_name')

  const term = (q ?? '').trim().replace(/[%_,]/g, ' ')
  if (term) {
    query = query.or(
      `full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`,
    )
  }
  if (from) {
    query = query.gte('created_at', new Date(from).toISOString())
  }
  if (to) {
    const end = new Date(to)
    end.setHours(23, 59, 59, 999)
    query = query.lte('created_at', end.toISOString())
  }

  const { data: customers } = await query

  const customerIds = (customers ?? []).map((c) => c.id)
  const trackingByCustomer = new Map<string, string>()

  if (customerIds.length) {
    const { data: paid } = await supabase
      .from('invoices')
      .select('customer_id, tracking_code, paid_at, fulfilled_at')
      .eq('distributor_id', distributor.id)
      .in('customer_id', customerIds)
      .eq('status', 'paid')
      .not('tracking_code', 'eq', '')
      .order('paid_at', { ascending: false })

    for (const inv of paid ?? []) {
      if (!inv.customer_id || !inv.tracking_code) continue
      if (!trackingByCustomer.has(inv.customer_id)) {
        trackingByCustomer.set(inv.customer_id, inv.tracking_code)
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/partner" className="text-sm">
            ← Dashboard
          </Link>
          <h1 className="text-3xl mt-2">Customers</h1>
          <p className="text-sm text-pe-brown mt-1">
            Save customer details once. Latest shipment tracking shows when available.
          </p>
        </div>
        <Link href="/partner/customers/new">
          <Button>Add customer</Button>
        </Link>
      </div>

      <form className="border border-pe-beige bg-white rounded-sm p-4 grid sm:grid-cols-4 gap-3 items-end">
        <div className="sm:col-span-2">
          <label htmlFor="q" className="text-sm text-pe-brown">
            Search name, email, or phone
          </label>
          <input id="q" name="q" defaultValue={q ?? ''} placeholder="Search…" />
        </div>
        <div>
          <label htmlFor="from" className="text-sm text-pe-brown">
            Added from
          </label>
          <input id="from" name="from" type="date" defaultValue={from ?? ''} />
        </div>
        <div>
          <label htmlFor="to" className="text-sm text-pe-brown">
            Added to
          </label>
          <input id="to" name="to" type="date" defaultValue={to ?? ''} />
        </div>
        <div className="sm:col-span-4 flex flex-wrap gap-2">
          <Button type="submit">Filter</Button>
          {(q || from || to) && (
            <Link href="/partner/customers">
              <Button type="button" variant="secondary">
                Clear
              </Button>
            </Link>
          )}
        </div>
      </form>

      {!customers?.length ? (
        <p className="text-sm text-pe-brown">No customers match.</p>
      ) : (
        <div className="border border-pe-beige bg-white rounded-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-pe-cream text-left">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Email</th>
                <th className="p-3">Phone</th>
                <th className="p-3">Location</th>
                <th className="p-3">Tracking</th>
                <th className="p-3">Resale</th>
                <th className="p-3">Added</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-t border-pe-beige">
                  <td className="p-3">
                    <Link href={`/partner/customers/${c.id}`} className="font-medium hover:underline">
                      {c.full_name}
                    </Link>
                  </td>
                  <td className="p-3 text-pe-brown">{c.email}</td>
                  <td className="p-3">{c.phone || '—'}</td>
                  <td className="p-3">
                    {[c.billing_city, c.billing_state].filter(Boolean).join(', ')}
                  </td>
                  <td className="p-3 font-mono text-xs">
                    {trackingByCustomer.get(c.id) || '—'}
                  </td>
                  <td className="p-3">{c.resale_certificate_number ? 'On file' : '—'}</td>
                  <td className="p-3">{formatDate(c.created_at)}</td>
                  <td className="p-3 text-right">
                    <DeleteCustomerButton customerId={c.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
