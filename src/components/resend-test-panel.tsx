'use client'

import { useActionState } from 'react'
import { Alert, Button, Label } from '@/components/ui'
import { sendTestEmailAction } from '@/lib/actions'

/** Dev-only Resend smoke test. Do not ship to production UI permanently. */
export function ResendTestPanel() {
  const [state, action, pending] = useActionState(sendTestEmailAction, null)

  return (
    <div className="mt-16 max-w-md mx-auto text-left border border-dashed border-pe-beige rounded-sm p-6 bg-pe-cream/40">
      <p className="text-xs uppercase tracking-wider text-pe-brown mb-2">Dev only</p>
      <h2 className="text-lg mb-2">Test Resend email</h2>
      <p className="text-xs text-pe-brown mb-4 leading-relaxed">
        With <code className="text-pe-charcoal">onboarding@resend.dev</code>, Resend only delivers to
        the email on your Resend account until a domain is verified.
      </p>

      {state?.error && <Alert variant="error">{state.error}</Alert>}
      {state?.success && <Alert variant="success">{state.message}</Alert>}

      <form action={action} className="space-y-3 mt-4">
        <div>
          <Label htmlFor="testEmail" required>Send test to</Label>
          <input id="testEmail" name="email" type="email" required placeholder="you@example.com" />
        </div>
        <Button type="submit" variant="secondary" disabled={pending} className="w-full">
          {pending ? 'Sending…' : 'Send test email'}
        </Button>
      </form>
    </div>
  )
}
