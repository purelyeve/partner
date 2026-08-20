'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { PageShell } from '@/components/layout/page-shell'
import { Alert, Button, Label } from '@/components/ui'
import { registerAction } from '@/lib/actions'
import { BUSINESS_STRUCTURES, US_STATES } from '@/lib/constants'

export default function RegisterPage() {
  const [state, action, pending] = useActionState(registerAction, null)

  if (state?.success) {
    return (
      <PageShell>
        <div className="max-w-md mx-auto px-4 py-16">
          <Alert variant="success">{state.message}</Alert>
          <p className="mt-4 text-sm"><Link href="/login">Return to sign in</Link></p>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <div className="max-w-2xl mx-auto px-4 py-12">
        <h1 className="text-2xl mb-2">Partner application</h1>
        <p className="text-sm text-pe-brown mb-8">
          Complete this form to apply as a Purely Eve Partner. Your application will be reviewed by our team.
        </p>

        {state?.error && <Alert variant="error">{state.error}</Alert>}

        <form action={action} className="space-y-8 mt-6">
          <section className="space-y-4">
            <h2 className="text-lg">Account</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label htmlFor="email" required>Email</Label>
                <input id="email" name="email" type="email" required />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="password" required>Password (min. 8 characters)</Label>
                <input id="password" name="password" type="password" required minLength={8} />
              </div>
              <div>
                <Label htmlFor="fullName" required>Full legal name</Label>
                <input id="fullName" name="fullName" required />
              </div>
              <div>
                <Label htmlFor="phone" required>Phone</Label>
                <input id="phone" name="phone" type="tel" required />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg">Business</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label htmlFor="businessName" required>Business name</Label>
                <input id="businessName" name="businessName" required />
              </div>
              <div>
                <Label htmlFor="businessStructure" required>Business structure</Label>
                <select id="businessStructure" name="businessStructure" required defaultValue="sole_proprietor">
                  {BUSINESS_STRUCTURES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="businessStructureOther">If other, specify</Label>
                <input id="businessStructureOther" name="businessStructureOther" />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="taxId" required>Tax ID / SSN</Label>
                <input id="taxId" name="taxId" required autoComplete="off" />
                <p className="text-xs text-pe-brown mt-1">Encrypted and masked after submission. Only the last 4 digits are shown again.</p>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg">Mailing address</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label htmlFor="mailingLine1" required>Street address</Label>
                <input id="mailingLine1" name="mailingLine1" required />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="mailingLine2">Apt / suite (optional)</Label>
                <input id="mailingLine2" name="mailingLine2" />
              </div>
              <div>
                <Label htmlFor="mailingCity" required>City</Label>
                <input id="mailingCity" name="mailingCity" required />
              </div>
              <div>
                <Label htmlFor="mailingState" required>State</Label>
                <select id="mailingState" name="mailingState" required defaultValue="CO">
                  {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="mailingPostalCode" required>ZIP code</Label>
                <input id="mailingPostalCode" name="mailingPostalCode" required />
              </div>
            </div>
          </section>

          <Button type="submit" disabled={pending} className="w-full sm:w-auto">
            {pending ? 'Submitting…' : 'Submit application'}
          </Button>
        </form>

        <p className="mt-8 text-sm text-pe-brown">
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </PageShell>
  )
}
