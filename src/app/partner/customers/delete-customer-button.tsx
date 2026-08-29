'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui'
import { partnerDeleteCustomerAction } from '@/lib/product-actions'

export default function DeleteCustomerButton({ customerId }: { customerId: string }) {
  const [state, action, pending] = useActionState(partnerDeleteCustomerAction, null)

  return (
    <form action={action} className="inline">
      <input type="hidden" name="customerId" value={customerId} />
      <Button type="submit" variant="ghost" disabled={pending} className="text-red-700 text-xs px-2 py-1">
        {pending ? '…' : 'Delete'}
      </Button>
      {state?.error && <span className="block text-xs text-red-600 mt-1 max-w-[12rem]">{state.error}</span>}
    </form>
  )
}
