'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Label } from '@/components/ui'
import {
  getInvoiceLabelSignedUrlAction,
  partnerBuyLabelAndFulfillAction,
  partnerRefundPaidInvoiceAction,
} from '@/lib/fulfillment-actions'

export function FulfillOrderButton({ invoiceId }: { invoiceId: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="space-y-2">
      {error && <Alert variant="error">{error}</Alert>}
      {message && <Alert variant="success">{message}</Alert>}
      <Button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null)
          setMessage(null)
          startTransition(async () => {
            const result = await partnerBuyLabelAndFulfillAction(invoiceId)
            if (result.error) setError(result.error)
            else {
              setMessage(result.message ?? 'Shipped')
              if (result.labelUrl) window.open(result.labelUrl, '_blank')
              router.refresh()
            }
          })
        }}
      >
        {pending ? 'Buying label…' : 'Buy label & mark shipped'}
      </Button>
      <p className="text-xs text-pe-brown">
        Postage is covered by the shipping the customer already paid. The customer receives a
        tracking email.
      </p>
    </div>
  )
}

export function ReprintLabelButton({ invoiceId }: { invoiceId: string }) {
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
          setError(null)
          startTransition(async () => {
            const result = await getInvoiceLabelSignedUrlAction(invoiceId)
            if (result.error) setError(result.error)
            else if (result.url) window.open(result.url, '_blank')
          })
        }}
      >
        {pending ? 'Opening…' : 'Reprint label'}
      </Button>
    </div>
  )
}

export function RefundOrderForm({ invoiceId }: { invoiceId: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        fd.set('invoiceId', invoiceId)
        setError(null)
        setMessage(null)
        startTransition(async () => {
          const result = await partnerRefundPaidInvoiceAction(fd)
          if (result.error) setError(result.error)
          else {
            setMessage(result.message ?? 'Refunded')
            router.refresh()
          }
        })
      }}
    >
      {error && <Alert variant="error">{error}</Alert>}
      {message && <Alert variant="success">{message}</Alert>}
      <div>
        <Label htmlFor="reason">Reason (optional)</Label>
        <input id="reason" name="reason" placeholder="Customer request, damaged, etc." />
      </div>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? 'Refunding…' : 'Refund & restore stock'}
      </Button>
      <p className="text-xs text-pe-brown">
        Refunds the customer through Stripe and puts inventory back on hand. Cannot be undone.
      </p>
    </form>
  )
}
