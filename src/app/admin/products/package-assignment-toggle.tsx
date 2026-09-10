'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui'
import { adminTogglePackageAssignmentAction } from '@/lib/package-actions'

export default function PackageAssignmentToggle({
  packageId,
  distributorId,
  assigned,
}: {
  packageId: string
  distributorId: string
  assigned: boolean
}) {
  const [state, action, pending] = useActionState(adminTogglePackageAssignmentAction, null)

  return (
    <form action={action} className="inline">
      <input type="hidden" name="packageId" value={packageId} />
      <input type="hidden" name="distributorId" value={distributorId} />
      <input type="hidden" name="assign" value={assigned ? '0' : '1'} />
      <Button type="submit" variant={assigned ? 'secondary' : 'primary'} disabled={pending}>
        {pending ? '…' : assigned ? 'Remove' : 'Assign'}
      </Button>
      {state?.error && <span className="text-xs text-red-600 ml-2">{state.error}</span>}
    </form>
  )
}
