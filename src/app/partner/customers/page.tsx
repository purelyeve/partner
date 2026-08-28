import Link from 'next/link'
import { Button } from '@/components/ui'
import { requireDistributor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export default async function PartnerCustomersPage() {
  const { distributor } = await requireDistributor()
  const supabase = await createClient()

  const { data: customers } = await supabase
    .from('customers')
    .select('id, full_name, email, phone, billing_city, billing_state, resale_certificate_number')
    .eq('distributor_id', distributor.id)
    .order('full_name')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/partner" className="text-sm">
            ← Dashboard
          </Link>
          <h1 className="text-3xl mt-2">Customers</h1>
          <p className="text-sm text-pe-brown mt-1">
            Save customer details once. Resale certificates reuse on wholesale invoices.
          </p>
        </div>
        <Link href="/partner/customers/new">
          <Button>Add customer</Button>
        </Link>
      </div>

      {!customers?.length ? (
        <p className="text-sm text-pe-brown">No customers yet.</p>
      ) : (
        <div className="border border-pe-beige bg-white rounded-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-pe-cream text-left">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Email</th>
                <th className="p-3">Location</th>
                <th className="p-3">Resale</th>
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
                  <td className="p-3">
                    {[c.billing_city, c.billing_state].filter(Boolean).join(', ')}
                  </td>
                  <td className="p-3">{c.resale_certificate_number ? 'On file' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
