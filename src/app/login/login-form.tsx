'use client'

import { useActionState, useEffect } from 'react'
import Link from 'next/link'
import { PageShell } from '@/components/layout/page-shell'
import { Alert, Button, Label } from '@/components/ui'
import { loginAction } from '@/lib/actions'

export default function LoginPage({
  reset,
  verified,
}: {
  reset?: string
  verified?: string
}) {
  const [state, action, pending] = useActionState(loginAction, null)

  useEffect(() => {
    if (state?.success && state.redirectTo) {
      // Hard navigation so auth cookies from the server action are applied cleanly
      window.location.assign(state.redirectTo)
    }
  }, [state])

  return (
    <PageShell>
      <div className="max-w-md mx-auto px-4 py-16">
        <h1 className="text-2xl mb-2">Sign in</h1>
        <p className="text-sm text-pe-brown mb-8">Access your Partner account.</p>

        {reset && <Alert variant="success">Password updated. You can sign in now.</Alert>}
        {verified === '1' && (
          <Alert variant="success">
            Your email has been confirmed. Sign in with your password below.
          </Alert>
        )}
        {verified === '0' && (
          <Alert variant="error">
            That confirmation link is invalid or has expired. Try signing in, or register again.
          </Alert>
        )}
        {state?.error && <Alert variant="error">{state.error}</Alert>}

        <form action={action} className="space-y-4 mt-6">
          <div>
            <Label htmlFor="email" required>
              Email
            </Label>
            <input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div>
            <Label htmlFor="password" required>
              Password
            </Label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </div>
          <Button type="submit" disabled={pending || Boolean(state?.redirectTo)} className="w-full">
            {pending || state?.redirectTo ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <div className="mt-6 text-sm text-center space-y-2">
          <p>
            <Link href="/forgot-password">Forgot password?</Link>
          </p>
          <p className="text-pe-brown">
            New Partner? <Link href="/register">Register as a Partner</Link>
          </p>
        </div>
      </div>
    </PageShell>
  )
}
