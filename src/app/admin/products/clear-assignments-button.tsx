'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui'
import { adminClearProductAssignmentsAction } from '@/lib/product-actions'
import { adminClearPackageAssignmentsAction } from '@/lib/package-actions'

export default function ClearAssignmentsButton({
  entityType,
  entityId,
}: {
  entityType: 'product' | 'package'
  entityId: string
}) {
  const action =
    entityType === 'product'
      ? adminClearProductAssignmentsAction
      : adminClearPackageAssignmentsAction
  const [state, formAction, pending] = useActionState(action, null)

  return (
    <form action={formAction} className="inline">
      <input
        type="hidden"
        name={entityType === 'product' ? 'productId' : 'packageId'}
        value={entityId}
      />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? 'Clearing…' : 'Clear all assignments'}
      </Button>
      {state?.error && <span className="text-xs text-red-600 ml-2">{state.error}</span>}
      {state?.success && state.message && (
        <span className="text-xs text-pe-forest ml-2">{state.message}</span>
      )}
    </form>
  )
}
