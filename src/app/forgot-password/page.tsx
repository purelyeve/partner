'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { PageShell } from '@/components/layout/page-shell'
import { Alert, Button, Label } from '@/components/ui'
import { forgotPasswordAction } from '@/lib/actions'

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(forgotPasswordAction, null)

  return (
    <PageShell>
      <div className="max-w-md mx-auto px-4 py-16">
        <h1 className="text-2xl mb-2">Reset password</h1>
        <p className="text-sm text-pe-brown mb-8">Enter your email and we will send a reset link.</p>

        {state?.error && <Alert variant="error">{state.error}</Alert>}
        {state?.success && <Alert variant="success">{state.message}</Alert>}

        <form action={action} className="space-y-4 mt-6">
          <div>
            <Label htmlFor="email" required>Email</Label>
            <input id="email" name="email" type="email" required />
          </div>
          <Button type="submit" disabled={pending} className="w-full">Send reset link</Button>
        </form>

        <p className="mt-6 text-sm"><Link href="/login">Back to sign in</Link></p>
      </div>
    </PageShell>
  )
}
