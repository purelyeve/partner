'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Alert, Button, Card, Label } from '@/components/ui'
import { updateProfileAction } from '@/lib/actions'
import { US_STATES } from '@/lib/constants'
import { maskTaxId } from '@/lib/utils'
import type { Distributor, Profile } from '@/lib/types'

export default function ProfilePage({
  profile,
  distributor,
}: {
  profile: Profile
  distributor: Distributor
}) {
  const [sameAsMailing, setSameAsMailing] = useState(distributor.fulfillment_same_as_mailing)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(formData: FormData) {
    const result = await updateProfileAction(formData)
    if (result?.error) setError(result.error)
    else {
      setError(null)
      setMessage(result?.message ?? 'Saved')
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link href="/partner" className="text-sm">← Dashboard</Link>
        <h1 className="text-3xl mt-2">Profile</h1>
        <p className="text-sm text-pe-brown">Update your contact and fulfillment address.</p>
      </div>

      {message && <Alert variant="success">{message}</Alert>}
      {error && <Alert variant="error">{error}</Alert>}

      <form action={handleSubmit} className="space-y-6">
        <Card className="space-y-4">
          <h2 className="text-lg">Contact</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="fullName" required>Full name</Label>
              <input id="fullName" name="fullName" defaultValue={profile.full_name} required />
            </div>
            <div>
              <Label htmlFor="phone" required>Phone</Label>
              <input id="phone" name="phone" defaultValue={profile.phone} required />
            </div>
            <div className="sm:col-span-2">
              <Label>Email</Label>
              <input value={profile.email} disabled className="bg-pe-cream" />
            </div>
            <div className="sm:col-span-2">
              <Label>Tax ID on file</Label>
              <input value={maskTaxId(distributor.tax_id_last4)} disabled className="bg-pe-cream" />
            </div>
          </div>
        </Card>

        <Card className="space-y-4">
          <h2 className="text-lg">Business & mailing address</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label htmlFor="businessName" required>Business name</Label>
              <input id="businessName" name="businessName" defaultValue={distributor.business_name} required />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="mailingLine1" required>Street</Label>
              <input id="mailingLine1" name="mailingLine1" defaultValue={distributor.mailing_line1} required />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="mailingLine2">Apt / suite (optional)</Label>
              <input id="mailingLine2" name="mailingLine2" defaultValue={distributor.mailing_line2} />
            </div>
            <div>
              <Label htmlFor="mailingCity" required>City</Label>
              <input id="mailingCity" name="mailingCity" defaultValue={distributor.mailing_city} required />
            </div>
            <div>
              <Label htmlFor="mailingState" required>State</Label>
              <select id="mailingState" name="mailingState" defaultValue={distributor.mailing_state}>
                {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="mailingPostalCode" required>ZIP</Label>
              <input id="mailingPostalCode" name="mailingPostalCode" defaultValue={distributor.mailing_postal_code} required />
            </div>
          </div>
        </Card>

        <Card className="space-y-4">
          <h2 className="text-lg">Fulfillment address</h2>
          <p className="text-sm text-pe-brown">Where you ship from and receive inventory. Used for shipping rates.</p>
          <div className="flex items-start gap-3">
            <input
              id="fulfillmentSameAsMailing"
              type="checkbox"
              name="fulfillmentSameAsMailing"
              checked={sameAsMailing}
              onChange={(e) => setSameAsMailing(e.target.checked)}
              className="mt-0.5"
            />
            <label htmlFor="fulfillmentSameAsMailing" className="!mb-0 text-sm text-pe-brown cursor-pointer">
              Same as mailing address
            </label>
          </div>
          {!sameAsMailing && (
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label htmlFor="fulfillmentLine1" required>Street</Label>
                <input id="fulfillmentLine1" name="fulfillmentLine1" defaultValue={distributor.fulfillment_line1} required />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="fulfillmentLine2">Apt / suite (optional)</Label>
                <input id="fulfillmentLine2" name="fulfillmentLine2" defaultValue={distributor.fulfillment_line2} />
              </div>
              <div>
                <Label htmlFor="fulfillmentCity" required>City</Label>
                <input id="fulfillmentCity" name="fulfillmentCity" defaultValue={distributor.fulfillment_city} required />
              </div>
              <div>
                <Label htmlFor="fulfillmentState" required>State</Label>
                <select id="fulfillmentState" name="fulfillmentState" defaultValue={distributor.fulfillment_state} required>
                  {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="fulfillmentPostalCode" required>ZIP</Label>
                <input id="fulfillmentPostalCode" name="fulfillmentPostalCode" defaultValue={distributor.fulfillment_postal_code} required />
              </div>
            </div>
          )}
        </Card>

        <Button type="submit">Save changes</Button>
      </form>
    </div>
  )
}
