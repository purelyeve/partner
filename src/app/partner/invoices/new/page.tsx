import Link from 'next/link'
import { requireDistributor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import InvoiceCreateForm from '../invoice-create-form'
import type { Product } from '@/lib/types'

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>
}) {
  const { distributor } = await requireDistributor()
  const { customer: defaultCustomerId } = await searchParams
  const supabase = await createClient()

  const { data: customers } = await supabase
    .from('customers')
    .select('id, full_name, email, resale_certificate_number, resale_document_path')
    .eq('distributor_id', distributor.id)
    .order('full_name')

  const { data: assignments } = await supabase
    .from('distributor_product_assignments')
    .select('products(*)')
    .eq('distributor_id', distributor.id)

  const products = (assignments ?? [])
    .map((a) => a.products as unknown as Product | null)
    .filter((p): p is Product => !!p && p.is_active)
    .sort((a, b) => a.sort_order - b.sort_order)

  return (
    <div className="space-y-6">
      <div>
        <Link href="/partner/invoices" className="text-sm">
          ← Invoices
        </Link>
        <h1 className="text-3xl mt-2">New invoice</h1>
      </div>

      {!customers?.length ? (
        <p className="text-sm text-pe-brown">
          Add a customer first. <Link href="/partner/customers/new">Create customer</Link>
        </p>
      ) : !products.length ? (
        <p className="text-sm text-pe-brown">
          No products are assigned to your account yet. Contact Purely Eve admin.
        </p>
      ) : (
        <InvoiceCreateForm
          customers={customers}
          products={products}
          defaultCustomerId={defaultCustomerId}
        />
      )}
    </div>
  )
}
