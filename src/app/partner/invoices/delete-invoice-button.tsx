'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button } from '@/components/ui'
import { partnerDeleteInvoiceAction } from '@/lib/fulfillment-actions'

export default function DeleteInvoiceButton({
  invoiceId,
  compact = false,
  redirectTo,
}: {
  invoiceId: string
  compact?: boolean
  redirectTo?: string
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onDelete() {
    if (!confirm('Delete this invoice permanently? This cannot be undone.')) return
    setError(null)
    startTransition(async () => {
      const result = await partnerDeleteInvoiceAction(invoiceId)
      if (result.error) {
        setError(result.error)
        return
      }
      if (redirectTo) router.push(redirectTo)
      else router.refresh()
    })
  }

  if (compact) {
    return (
      <>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={onDelete}
          className="text-red-700 text-xs px-2 py-1"
        >
          {pending ? '…' : 'Delete'}
        </Button>
        {error && <span className="block text-xs text-red-600 mt-1 max-w-[14rem]">{error}</span>}
      </>
    )
  }

  return (
    <div className="space-y-2">
      {error && <Alert variant="error">{error}</Alert>}
      <Button type="button" variant="secondary" disabled={pending} onClick={onDelete}>
        {pending ? 'Deleting…' : 'Delete invoice'}
      </Button>
    </div>
  )
}
