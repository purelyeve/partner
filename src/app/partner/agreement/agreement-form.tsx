'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Alert, Button, Card, Label } from '@/components/ui'
import { AGREEMENT_INTRO, PARTNER_AGREEMENT_SECTIONS } from '@/content/partner-agreement'
import { acceptAgreementAction } from '@/lib/actions'

export function AgreementForm({ defaultName }: { defaultName: string }) {
  const [state, action, pending] = useActionState(acceptAgreementAction, null)

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link href="/partner" className="text-sm">← Dashboard</Link>
        <h1 className="text-3xl mt-2">Partner Agreement</h1>
        <p className="text-sm text-pe-brown mt-1">Read the full agreement, then sign below.</p>
      </div>

      <Card className="max-h-[50vh] overflow-y-auto space-y-6 text-sm leading-relaxed">
        <p className="whitespace-pre-line">{AGREEMENT_INTRO}</p>
        {PARTNER_AGREEMENT_SECTIONS.map((section) => (
          <div key={section.title}>
            <h2 className="text-base font-serif mb-2">{section.title}</h2>
            <p className="whitespace-pre-line text-pe-charcoal">{section.body}</p>
          </div>
        ))}
      </Card>

      <Alert variant="warning">
        By typing your name below, you agree to the Purely Eve Partner Terms & Wholesale Agreement.
      </Alert>

      {state?.error && <Alert variant="error">{state.error}</Alert>}

      <form action={action} className="space-y-4">
        <div>
          <Label htmlFor="fullName" required>Full legal name (electronic signature)</Label>
          <input id="fullName" name="fullName" defaultValue={defaultName} required />
        </div>
        <Button type="submit" disabled={pending}>I agree and accept</Button>
      </form>
    </div>
  )
}
