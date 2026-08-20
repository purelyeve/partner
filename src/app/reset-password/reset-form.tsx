'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { PageShell } from '@/components/layout/page-shell'
import { Alert, Button, Label } from '@/components/ui'
import { resetPasswordAction } from '@/lib/actions'

export default function ResetPasswordForm() {
  const [state, action, pending] = useActionState(resetPasswordAction, null)

  return (
    <PageShell>
      <div className="max-w-md mx-auto px-4 py-16">
        <h1 className="text-2xl mb-2">Choose a new password</h1>
        {state?.error && <Alert variant="error">{state.error}</Alert>}
        <form action={action} className="space-y-4 mt-8">
          <div>
            <Label htmlFor="password" required>New password</Label>
            <input id="password" name="password" type="password" required minLength={8} />
          </div>
          <Button type="submit" disabled={pending} className="w-full">Update password</Button>
        </form>
        <p className="mt-6 text-sm"><Link href="/login">Back to sign in</Link></p>
      </div>
    </PageShell>
  )
}
