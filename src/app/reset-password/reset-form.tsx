'use client'

import { useActionState, useEffect, useState } from 'react'
import Link from 'next/link'
import { PageShell } from '@/components/layout/page-shell'
import { Alert, Button, Label } from '@/components/ui'
import { resetPasswordAction } from '@/lib/actions'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordForm() {
  const [state, action, pending] = useActionState(resetPasswordAction, null)
  const [ready, setReady] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)

  useEffect(() => {
    if (state?.success && state.redirectTo) {
      window.location.assign(state.redirectTo)
    }
  }, [state])

  useEffect(() => {
    let cancelled = false

    async function establishRecoverySession() {
      const supabase = createClient()
      const params = new URLSearchParams(window.location.search)

      if (params.get('error') === 'link') {
        if (!cancelled) {
          setLinkError('That reset link is invalid or has expired. Request a new one.')
          setReady(true)
        }
        return
      }

      const code = params.get('code')
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error && !cancelled) {
          setLinkError(error.message)
          setReady(true)
          return
        }
        window.history.replaceState({}, '', '/reset-password')
      }

      // Hash-based recovery links are picked up by getSession on the client.
      const { data } = await supabase.auth.getSession()
      if (!cancelled) {
        if (!data.session) {
          setLinkError(
            'Open the reset link from your email on this device. If it still fails, request a new reset email.',
          )
        }
        setReady(true)
      }
    }

    void establishRecoverySession()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <PageShell>
      <div className="max-w-md mx-auto px-4 py-16">
        <h1 className="text-2xl mb-2">Choose a new password</h1>
        <p className="text-sm text-pe-brown mb-6">
          Enter a new password for your Partner account.
        </p>

        {(linkError || state?.error) && (
          <Alert variant="error">{linkError || state?.error}</Alert>
        )}
        {state?.success && <Alert variant="success">Password updated. Redirecting to sign in…</Alert>}

        <form action={action} className="space-y-4 mt-8">
          <div>
            <Label htmlFor="password" required>
              New password
            </Label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              disabled={!ready || Boolean(linkError) || Boolean(state?.redirectTo)}
            />
          </div>
          <Button
            type="submit"
            disabled={!ready || Boolean(linkError) || pending || Boolean(state?.redirectTo)}
            className="w-full"
          >
            {pending || state?.redirectTo ? 'Updating…' : 'Update password'}
          </Button>
        </form>
        <p className="mt-6 text-sm">
          <Link href="/forgot-password">Request a new reset link</Link>
          {' · '}
          <Link href="/login">Back to sign in</Link>
        </p>
      </div>
    </PageShell>
  )
}
