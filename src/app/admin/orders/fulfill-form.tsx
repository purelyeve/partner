'use client'

import { useActionState } from 'react'
import { Button, Label } from '@/components/ui'
import { adminFulfillOrderAction } from '@/lib/actions'

export function FulfillOrderForm({ orderId }: { orderId: string }) {
  const [, action, pending] = useActionState(adminFulfillOrderAction, null)

  return (
    <form action={action} className="flex flex-col gap-2 min-w-[200px]">
      <input type="hidden" name="orderId" value={orderId} />
      <Label htmlFor={`tracking-${orderId}`}>Tracking number</Label>
      <input
        id={`tracking-${orderId}`}
        name="tracking"
        placeholder="Paste from EasyPost"
        required
      />
      <Button type="submit" variant="secondary" disabled={pending}>
        Mark fulfilled
      </Button>
    </form>
  )
}
