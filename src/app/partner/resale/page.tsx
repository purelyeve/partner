'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Alert, Button, Label } from '@/components/ui'
import { uploadResaleDocumentAction } from '@/lib/actions'
import { US_STATES } from '@/lib/constants'

export default function ResalePage() {
  const [state, action, pending] = useActionState(uploadResaleDocumentAction, null)

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <Link href="/partner" className="text-sm">← Dashboard</Link>
        <h1 className="text-3xl mt-2">Resale documentation</h1>
        <p className="text-sm text-pe-brown mt-1">
          Upload your Resale Certificate, Sales Tax License, Seller&apos;s Permit, or other
          state-issued resale documentation. Purely Eve must accept it before you can purchase
          inventory.
        </p>
      </div>

      {state?.error && <Alert variant="error">{state.error}</Alert>}
      {state?.success && <Alert variant="success">{state.message}</Alert>}

      <form action={action} className="space-y-4">
        <div>
          <Label htmlFor="certificateNumber" required>
            Sales Tax License / Seller&apos;s Permit Number
          </Label>
          <input id="certificateNumber" name="certificateNumber" required />
        </div>
        <div>
          <Label htmlFor="resaleState">Issuing state (optional)</Label>
          <select id="resaleState" name="resaleState" defaultValue="">
            <option value="">Select state</option>
            {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <Label htmlFor="file" required>Upload document</Label>
          <input
            id="file"
            name="file"
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            required
          />
          <p className="text-xs text-pe-brown mt-1">Accepted file types: PDF, JPG, JPEG, or PNG</p>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Uploading…' : 'Submit for review'}
        </Button>
      </form>
    </div>
  )
}
