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
        <h1 className="text-3xl mt-2">Resale certificate</h1>
        <p className="text-sm text-pe-brown mt-1">
          Upload your resale certificate, seller&apos;s permit, or sales tax license. Purely Eve must
          accept it before you can purchase inventory.
        </p>
      </div>

      {state?.error && <Alert variant="error">{state.error}</Alert>}
      {state?.success && <Alert variant="success">{state.message}</Alert>}

      <form action={action} className="space-y-4">
        <div>
          <Label htmlFor="certificateNumber" required>Certificate / permit number</Label>
          <input id="certificateNumber" name="certificateNumber" required />
        </div>
        <div>
          <Label htmlFor="resaleState" required>Issuing state</Label>
          <select id="resaleState" name="resaleState" required defaultValue="CO">
            {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <Label htmlFor="file" required>Document (PDF or image)</Label>
          <input id="file" name="file" type="file" accept=".pdf,image/*" required />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Uploading…' : 'Submit for review'}
        </Button>
      </form>
    </div>
  )
}
