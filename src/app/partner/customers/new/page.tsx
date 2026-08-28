import Link from 'next/link'
import CustomerForm from '../customer-form'

export default function NewCustomerPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link href="/partner/customers" className="text-sm">
          ← Customers
        </Link>
        <h1 className="text-3xl mt-2">Add customer</h1>
      </div>
      <CustomerForm />
    </div>
  )
}
