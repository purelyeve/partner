'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button } from '@/components/ui'
import { partnerCancelUnpaidInvoiceAction } from '@/lib/fulfillment-actions'

export default function CancelUnpaidButton({ invoiceId }: { invoiceId: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="space-y-2">
      {error && <Alert variant="error">{error}</Alert>}
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={() => {
          if (!confirm('Cancel this unpaid invoice? The payment link will stop working.')) return
          setError(null)
          startTransition(async () => {
            const result = await partnerCancelUnpaidInvoiceAction(invoiceId)
            if (result.error) setError(result.error)
            else router.refresh()
          })
        }}
      >
        {pending ? 'Cancelling…' : 'Cancel unpaid invoice'}
      </Button>
    </div>
  )
}
