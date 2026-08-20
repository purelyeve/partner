'use client'

import { useActionState } from 'react'
import { Button, Label } from '@/components/ui'
import { adminFulfillOrderAction } from '@/lib/actions'

export function FulfillOrderForm({ orderId }: { orderId: string }) {
  const [, action, pending] = useActionState(adminFulfillOrderAction, null)

  return (
    <form action={action} className="flex flex-col gap-2 min-w-[180px]">
      <input type="hidden" name="orderId" value={orderId} />
      <Label htmlFor={`tracking-${orderId}`}>Tracking number (optional)</Label>
      <input id={`tracking-${orderId}`} name="tracking" placeholder="e.g. 9400 1000 0000 0000 0000 00" />
      <Button type="submit" variant="secondary" disabled={pending}>Mark fulfilled</Button>
    </form>
  )
}
