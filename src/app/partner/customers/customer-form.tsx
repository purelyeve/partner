'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Alert, Button, Card, Label } from '@/components/ui'
import { partnerSaveCustomerAction } from '@/lib/invoice-actions'
import { US_STATES } from '@/lib/constants'
import type { Customer } from '@/lib/types'

export default function CustomerForm({ customer }: { customer?: Customer }) {
  const [state, action, pending] = useActionState(partnerSaveCustomerAction, null)
  const [sameShip, setSameShip] = useState(customer?.shipping_same_as_billing ?? true)

  return (
    <form action={action} className="space-y-6 max-w-2xl">
      {customer?.id && <input type="hidden" name="id" value={customer.id} />}

      {state?.error && <Alert variant="error">{state.error}</Alert>}
      {state?.success && <Alert variant="success">{state.message ?? 'Saved.'}</Alert>}

      <Card className="space-y-4">
        <h2 className="text-lg">Contact</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Label htmlFor="fullName" required>
              Full name
            </Label>
            <input id="fullName" name="fullName" defaultValue={customer?.full_name ?? ''} required />
          </div>
          <div>
            <Label htmlFor="email" required>
              Email
            </Label>
            <input
              id="email"
              name="email"
              type="email"
              defaultValue={customer?.email ?? ''}
              required
            />
          </div>
          <div>
            <Label htmlFor="phone">Phone</Label>
            <input id="phone" name="phone" defaultValue={customer?.phone ?? ''} />
          </div>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-lg">Billing address</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Label htmlFor="billingLine1" required>
              Street
            </Label>
            <input
              id="billingLine1"
              name="billingLine1"
              defaultValue={customer?.billing_line1 ?? ''}
              required
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="billingLine2">Apt / suite</Label>
            <input
              id="billingLine2"
              name="billingLine2"
              defaultValue={customer?.billing_line2 ?? ''}
            />
          </div>
          <div>
            <Label htmlFor="billingCity" required>
              City
            </Label>
            <input
              id="billingCity"
              name="billingCity"
              defaultValue={customer?.billing_city ?? ''}
              required
            />
          </div>
          <div>
            <Label htmlFor="billingState" required>
              State
            </Label>
            <select
              id="billingState"
              name="billingState"
              defaultValue={customer?.billing_state ?? ''}
              required
            >
              <option value="">Select</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="billingPostalCode" required>
              ZIP
            </Label>
            <input
              id="billingPostalCode"
              name="billingPostalCode"
              defaultValue={customer?.billing_postal_code ?? ''}
              required
            />
          </div>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-lg">Shipping address</h2>
        <label className="flex items-center gap-2 text-sm text-pe-charcoal">
          <input
            type="checkbox"
            name="shippingSameAsBilling"
            checked={sameShip}
            onChange={(e) => setSameShip(e.target.checked)}
          />
          Same as billing
        </label>
        {!sameShip && (
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label htmlFor="shippingLine1" required>
                Street
              </Label>
              <input
                id="shippingLine1"
                name="shippingLine1"
                defaultValue={customer?.shipping_line1 ?? ''}
                required
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="shippingLine2">Apt / suite</Label>
              <input
                id="shippingLine2"
                name="shippingLine2"
                defaultValue={customer?.shipping_line2 ?? ''}
              />
            </div>
            <div>
              <Label htmlFor="shippingCity" required>
                City
              </Label>
              <input
                id="shippingCity"
                name="shippingCity"
                defaultValue={customer?.shipping_city ?? ''}
                required
              />
            </div>
            <div>
              <Label htmlFor="shippingState" required>
                State
              </Label>
              <select
                id="shippingState"
                name="shippingState"
                defaultValue={customer?.shipping_state ?? ''}
                required
              >
                <option value="">Select</option>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="shippingPostalCode" required>
                ZIP
              </Label>
              <input
                id="shippingPostalCode"
                name="shippingPostalCode"
                defaultValue={customer?.shipping_postal_code ?? ''}
                required
              />
            </div>
          </div>
        )}
      </Card>

      <Card className="space-y-4">
        <h2 className="text-lg">Resale certificate (wholesale)</h2>
        <p className="text-sm text-pe-brown">
          Required once for Retail Wholesale invoices. Reused for this customer afterward.
        </p>
        <div>
          <Label htmlFor="resaleCertificateNumber">Certificate number</Label>
          <input
            id="resaleCertificateNumber"
            name="resaleCertificateNumber"
            defaultValue={customer?.resale_certificate_number ?? ''}
          />
        </div>
        <div>
          <Label htmlFor="resaleFile">Upload copy (optional)</Label>
          <input id="resaleFile" name="resaleFile" type="file" accept=".pdf,image/*" />
          {customer?.resale_document_name && (
            <p className="text-xs text-pe-brown mt-1">On file: {customer.resale_document_name}</p>
          )}
        </div>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : customer ? 'Save customer' : 'Create customer'}
        </Button>
        <Link href="/partner/customers">
          <Button type="button" variant="secondary">
            Cancel
          </Button>
        </Link>
      </div>
    </form>
  )
}
