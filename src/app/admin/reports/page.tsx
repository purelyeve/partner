import Link from 'next/link'
import { Card } from '@/components/ui'
import { requireAdmin } from '@/lib/auth'

const REPORTS = [
  {
    href: '/admin/reports/package-sales',
    title: '1. Partner inventory package sales',
    body: 'Per Partner package orders with dates, amounts, volume, and a 90-day inactive flag.',
  },
  {
    href: '/admin/reports/package-volume',
    title: '2. Company-wide package volume',
    body: 'Month, YTD, and lifetime package sales. Filter by Partner, dates, and package.',
  },
  {
    href: '/admin/reports/customer-orders',
    title: '3. Partner customer orders',
    body: 'Retail vs wholesale customer invoices per Partner, with month / YTD / lifetime volume.',
  },
  {
    href: '/admin/reports/customer-volume',
    title: '4. Company-wide customer volume',
    body: 'All Partner customer sales (excludes inventory packages). Filter wholesale / retail / dates.',
  },
  {
    href: '/admin/reports/tax',
    title: '5. Tax collected',
    body: 'Tax by Partner and ship-to state for month, YTD, or a custom date range.',
  },
  {
    href: '/admin/reports/shipping',
    title: '6. Shipping collected',
    body: 'Customer shipping collected for the company, with fulfilled vs pending label status.',
  },
  {
    href: '/admin/reports/stripe',
    title: '7. Company Stripe',
    body: 'Platform balance, recent fees, shipping application fees, and payouts.',
  },
]

export default async function AdminReportsPage() {
  await requireAdmin()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl">Reports</h1>
        <p className="text-sm text-pe-brown mt-1">
          Admin reporting for inventory packages, customer sales, tax, shipping, and company Stripe.
          New packages and Partners appear in filters automatically.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {REPORTS.map((r) => (
          <Link key={r.href} href={r.href} className="block">
            <Card className="h-full hover:border-pe-gold transition-colors">
              <h2 className="text-lg mb-2">{r.title}</h2>
              <p className="text-sm text-pe-brown">{r.body}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
