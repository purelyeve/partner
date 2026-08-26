'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui'
import { adminCreateTestPaidOrderAction } from '@/lib/actions'

export function CreateTestPaidOrderButton() {
  const [state, action, pending] = useActionState(adminCreateTestPaidOrderAction, null)

  return (
    <form action={action} className="flex flex-col sm:flex-row sm:items-center gap-2">
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? 'Creating…' : 'Create test Paid order'}
      </Button>
      {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
      {state?.success && state.message && (
        <p className="text-xs text-pe-forest">{state.message}</p>
      )}
    </form>
  )
}
