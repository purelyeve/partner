'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { PageShell } from '@/components/layout/page-shell'
import { AgreementDocument } from '@/components/agreement-document'
import { Alert, Button, Label } from '@/components/ui'
import { registerAction } from '@/lib/actions'
import { BUSINESS_STRUCTURES, US_STATES } from '@/lib/constants'
import { AGREEMENT_VERSION_LABEL } from '@/content/partner-agreement'

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
        <h1 className="text-2xl mb-2">Partner Registration</h1>
        <p className="text-sm text-pe-brown mb-8">
          Complete this form to finalize your application as a Purely Eve Partner.
        </p>

        {state?.error && <Alert variant="error">{state.error}</Alert>}

        <form action={action} className="space-y-8 mt-6" encType="multipart/form-data">
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
                <Label htmlFor="businessName">Business name (if applicable)</Label>
                <input id="businessName" name="businessName" />
              </div>
              <div>
                <Label htmlFor="businessStructure">Business structure</Label>
                <select id="businessStructure" name="businessStructure" defaultValue="">
                  <option value="">Select (optional)</option>
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
                <Label htmlFor="taxId">EIN Tax ID (if applicable)</Label>
                <input id="taxId" name="taxId" autoComplete="off" />
                <p className="text-xs text-pe-brown mt-1">
                  Encrypted and masked after submission. Only the last 4 digits are shown again.
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg">Mailing address</h2>
            <p className="text-sm text-pe-brown leading-relaxed">
              Inventory packages ship to this address unless you set a different fulfillment address
              later in your profile.
            </p>
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
                  {US_STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="mailingPostalCode" required>ZIP code</Label>
                <input id="mailingPostalCode" name="mailingPostalCode" required />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg">Resale documentation</h2>
            <p className="text-sm text-pe-brown leading-relaxed">
              Purely Eve partners purchase products for resale. Before your Partner Account can be
              activated for wholesale purchasing, you must provide valid resale and/or sales tax
              documentation applicable to your business and jurisdiction.
            </p>
            <div>
              <Label htmlFor="certificateNumber" required>
                Sales Tax License / Seller&apos;s Permit Number
              </Label>
              <input id="certificateNumber" name="certificateNumber" required placeholder="Enter number" />
            </div>
            <div>
              <Label htmlFor="resaleFile" required>Upload Resale Documentation</Label>
              <input
                id="resaleFile"
                name="resaleFile"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                required
              />
              <p className="text-xs text-pe-brown mt-2 leading-relaxed">
                Please upload your applicable Resale Certificate, Sales Tax License, Seller&apos;s
                Permit, or other state-issued resale documentation.
              </p>
              <p className="text-xs text-pe-brown mt-1">Accepted file types: PDF, JPG, JPEG, or PNG</p>
            </div>
            <p className="text-xs text-pe-charcoal leading-relaxed border border-pe-beige bg-pe-cream/60 rounded-sm px-3 py-3">
              By submitting this information, I certify that the information and documentation
              provided are current, accurate, and applicable to my business. I understand that I am
              responsible for maintaining any registrations, licenses, permits, or certificates
              required for my resale activities and for the collection, reporting, and remittance of
              applicable sales and use taxes as required by law.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg">Partner Terms & Wholesale Agreement</h2>
            <p className="text-sm text-pe-brown leading-relaxed">
              By checking the box below and submitting my registration, I acknowledge that I have
              been provided access to, have reviewed, and agree to be bound by the Purely Eve Partner
              Terms & Wholesale Agreement.
            </p>
            <p className="text-sm text-pe-brown leading-relaxed">
              I understand and agree that checking this box and submitting my registration constitutes
              my electronic signature and has the same legal force and effect as my handwritten
              signature. I further acknowledge that I am entering into a binding agreement with Purely
              Eve LLC and agree to conduct my Partner activities in accordance with the terms of the
              Agreement.
            </p>

            <AgreementDocument />

            <p className="text-sm text-pe-charcoal">
              Want a copy for your records?{' '}
              <a
                href="/agreement/pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-pe-dark-brown underline underline-offset-2 hover:text-pe-gold"
              >
                Download Partner Terms & Wholesale Agreement (PDF)
              </a>
            </p>

            <div className="flex gap-3 items-start">
              <input
                id="agreeToTerms"
                type="checkbox"
                name="agreeToTerms"
                value="yes"
                required
                className="mt-1"
              />
              <div className="min-w-0 flex-1">
                <label htmlFor="agreeToTerms" className="!mb-0 text-sm leading-relaxed text-pe-charcoal cursor-pointer">
                  I have read and agree to the Purely Eve Partner Terms & Wholesale Agreement, and I
                  consent to use my electronic acceptance as my legally binding signature.
                </label>
                <p className="text-xs text-pe-brown mt-2">{AGREEMENT_VERSION_LABEL}</p>
              </div>
            </div>
          </section>

          <Button type="submit" disabled={pending} className="w-full sm:w-auto">
            {pending ? 'Submitting…' : 'Submit Partner Registration'}
          </Button>
        </form>

        <p className="mt-8 text-sm text-pe-brown">
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </PageShell>
  )
}
