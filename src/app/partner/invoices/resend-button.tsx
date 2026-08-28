'use client'

import { useActionState } from 'react'
import { Alert, Button } from '@/components/ui'
import { partnerResendInvoiceAction } from '@/lib/invoice-actions'

export default function ResendInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const [state, action, pending] = useActionState(partnerResendInvoiceAction, null)

  return (
    <form action={action} className="inline-flex flex-col gap-2">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? 'Sending…' : 'Email / resend payment link'}
      </Button>
      {state?.error && <Alert variant="error">{state.error}</Alert>}
      {state?.success && <Alert variant="success">{state.message ?? 'Sent.'}</Alert>}
    </form>
  )
}
