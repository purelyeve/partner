import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Button } from '@/components/ui'
import { requireDistributor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import CustomerForm from '../customer-form'
import DeleteCustomerButton from '../delete-customer-button'

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { distributor } = await requireDistributor()
  const { id } = await params
  const supabase = await createClient()

  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .eq('distributor_id', distributor.id)
    .single()

  if (!customer) notFound()

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/partner/customers" className="text-sm">
            ← Customers
          </Link>
          <h1 className="text-3xl mt-2">{customer.full_name}</h1>
        </div>
        <Link href={`/partner/invoices/new?customer=${customer.id}`}>
          <Button>Create invoice</Button>
        </Link>
        <DeleteCustomerButton customerId={customer.id} />
      </div>
      <CustomerForm customer={customer} />
    </div>
  )
}
