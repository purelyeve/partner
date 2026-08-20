import Link from 'next/link'
import { Alert, Card } from '@/components/ui'
import { createClient } from '@/lib/supabase/server'
import { requireDistributor } from '@/lib/auth'
import { formatCurrency } from '@/lib/utils'

export default async function PackageSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>
}) {
  const { order: orderId } = await searchParams
  const { distributor } = await requireDistributor()
  const supabase = await createClient()

  let order = null
  if (orderId) {
    const { data } = await supabase
      .from('package_orders')
      .select('*')
      .eq('id', orderId)
      .eq('distributor_id', distributor.id)
      .maybeSingle()
    order = data
  }

  return (
    <div className="max-w-lg space-y-6">
      <Alert variant="success">
        Thank you! {order ? `Order ${order.order_number} is being processed.` : 'Your payment is being processed.'}
      </Alert>
      {order && (
        <Card className="text-sm space-y-2">
          <p><strong>Package:</strong> {order.name_snapshot}</p>
          <p><strong>Total:</strong> {formatCurrency(order.total_cents)}</p>
          <p><strong>Status:</strong> {order.status.replace('_', ' ')}</p>
        </Card>
      )}
      <Link href="/partner" className="text-sm">Return to dashboard</Link>
    </div>
  )
}
