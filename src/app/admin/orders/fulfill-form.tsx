'use client'

import { useActionState } from 'react'
import { Button, Label } from '@/components/ui'
import { adminBuyLabelAndFulfillAction, adminFulfillOrderAction } from '@/lib/actions'

export function BuyLabelForm({ orderId }: { orderId: string }) {
  const [state, action, pending] = useActionState(adminBuyLabelAndFulfillAction, null)

  return (
    <form action={action} className="flex flex-col gap-2 min-w-[160px]">
      <input type="hidden" name="orderId" value={orderId} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? 'Purchasing label…' : 'Buy & print label'}
      </Button>
      {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
      {state?.success && state.message && (
        <p className="text-xs text-pe-forest">{state.message}</p>
      )}
    </form>
  )
}

export function MarkFulfilledForm({
  orderId,
  defaultTracking,
}: {
  orderId: string
  defaultTracking?: string
}) {
  const [state, action, pending] = useActionState(adminFulfillOrderAction, null)

  return (
    <form action={action} className="flex flex-col gap-2 min-w-[180px] mt-2 pt-2 border-t border-pe-beige">
      <input type="hidden" name="orderId" value={orderId} />
      <Label htmlFor={`tracking-${orderId}`}>Tracking number</Label>
      <input
        id={`tracking-${orderId}`}
        name="tracking"
        defaultValue={defaultTracking ?? ''}
        placeholder="From label, if needed"
      />
      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Mark fulfilled'}
      </Button>
      {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
      {state?.success && state.message && (
        <p className="text-xs text-pe-forest">{state.message}</p>
      )}
    </form>
  )
}

export function LabelLinks({
  labelUrl,
  labelUrls,
  tracking,
}: {
  labelUrl?: string | null
  labelUrls?: string[] | null
  tracking?: string | null
}) {
  const urls = (labelUrls?.filter(Boolean) ?? []).length
    ? labelUrls!.filter(Boolean)
    : labelUrl
      ? [labelUrl]
      : []

  if (!tracking && urls.length === 0) return null

  return (
    <div className="space-y-1 text-xs mt-2">
      {tracking ? <p>Tracking: {tracking}</p> : null}
      {urls.map((url, i) => (
        <p key={url}>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-pe-gold"
          >
            {urls.length > 1 ? `Print label ${i + 1}` : 'Print / reprint label'}
          </a>
        </p>
      ))}
    </div>
  )
}
