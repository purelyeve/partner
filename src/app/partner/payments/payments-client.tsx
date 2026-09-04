'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Alert, Button, Card } from '@/components/ui'
import {
  openConnectDashboardAction,
  refreshConnectStatusAction,
  startConnectOnboardingAction,
} from '@/lib/connect-actions'
import { formatCurrency } from '@/lib/utils'

type PayoutRow = {
  id: string
  amountCents: number
  currency: string
  status: string
  arrivalDate: number | null
  created: number
}

export default function PaymentsClient({
  connectReady,
  chargesEnabled,
  payoutsEnabled,
  detailsSubmitted,
  hasAccount,
  balance,
  payouts,
  returnedFromStripe,
  refreshedFromStripe,
}: {
  connectReady: boolean
  chargesEnabled: boolean
  payoutsEnabled: boolean
  detailsSubmitted: boolean
  hasAccount: boolean
  balance: { availableCents: number; pendingCents: number; currency: string } | null
  payouts: PayoutRow[]
  returnedFromStripe?: boolean
  refreshedFromStripe?: boolean
}) {
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function run(
    action: () => Promise<
      { error?: string; message?: string; success?: boolean; url?: string } | void
    >,
  ) {
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const result = await action()
      if (result && 'url' in result && result.url) {
        window.location.assign(result.url)
        return
      }
      if (result && 'error' in result && result.error) setError(result.error)
      else if (result && 'message' in result && result.message) setMessage(result.message)
    })
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link href="/partner" className="text-sm">
          ← Dashboard
        </Link>
        <h1 className="text-3xl mt-2">Payouts &amp; Reports</h1>
        <p className="text-sm text-pe-brown">
          Receive your customer payouts by setting up your Stripe account below and connecting your
          bank account.
        </p>
      </div>

      {returnedFromStripe && (
        <Alert variant="success">
          Returned from Stripe. If setup looks incomplete, click Refresh status below.
        </Alert>
      )}
      {refreshedFromStripe && (
        <Alert variant="info">Stripe asked you to continue onboarding. Use Connect bank again.</Alert>
      )}
      {message && <Alert variant="success">{message}</Alert>}
      {error && <Alert variant="error">{error}</Alert>}

      <Card className="space-y-4">
        <h2 className="text-lg">Stripe Connect — customer payments</h2>
        <p className="text-sm text-pe-brown">
          Customer invoice payments go to your connected Stripe account. Stripe&apos;s processing fee
          comes out of your proceeds. Your final payout is the amount collected on the product order
          plus tax collected. Stripe&apos;s fees are as follows:
        </p>
        <ul className="text-sm space-y-1 list-disc pl-5 text-pe-brown">
          <li>
            Card payments: <strong>2.9% + $0.30</strong> per successful charge (standard U.S. rate)
          </li>
          <li>
            Instant Payouts (optional, via Stripe): additional fee shown in Stripe before you confirm
          </li>
        </ul>
        <p className="text-sm text-pe-brown">
          Shipping the customer paid is passed to Purely Eve to cover postage on your label, so it is
          not part of your payout.
        </p>
        <ul className="text-sm space-y-1">
          <li>
            Status:{' '}
            <strong>{connectReady ? 'Ready to accept payments' : 'Setup incomplete'}</strong>
          </li>
          <li>Charges enabled: {chargesEnabled ? 'Yes' : 'No'}</li>
          <li>Payouts enabled: {payoutsEnabled ? 'Yes' : 'No'}</li>
          <li>Details submitted: {detailsSubmitted ? 'Yes' : 'No'}</li>
        </ul>
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            disabled={pending}
            onClick={() => run(() => startConnectOnboardingAction())}
          >
            {hasAccount && !connectReady
              ? 'Continue Stripe setup'
              : hasAccount
                ? 'Update Stripe details'
                : 'Connect bank with Stripe'}
          </Button>
          {hasAccount && (
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => run(() => openConnectDashboardAction())}
              >
                Open Stripe (edit bank / payouts)
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => run(() => refreshConnectStatusAction())}
              >
                Refresh status
              </Button>
            </>
          )}
        </div>
      </Card>

      {connectReady && (
        <Card className="space-y-4">
          <h2 className="text-lg">Balance & payouts</h2>
          {balance ? (
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wider text-pe-brown">Available</p>
                <p className="text-2xl">{formatCurrency(balance.availableCents)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-pe-brown">Pending</p>
                <p className="text-2xl">{formatCurrency(balance.pendingCents)}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-pe-brown">Balance unavailable right now. Try Refresh status.</p>
          )}
          <p className="text-xs text-pe-brown">
            Stripe pays out to your bank on its normal schedule. For Instant Payouts (when available),
            use Open Stripe above.
          </p>
          {payouts.length > 0 ? (
            <div className="border border-pe-beige rounded-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-pe-cream text-left">
                  <tr>
                    <th className="p-2">Date</th>
                    <th className="p-2">Amount</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Arrival</th>
                  </tr>
                </thead>
                <tbody>
                  {payouts.map((p) => (
                    <tr key={p.id} className="border-t border-pe-beige">
                      <td className="p-2">
                        {new Date(p.created * 1000).toLocaleDateString()}
                      </td>
                      <td className="p-2">{formatCurrency(p.amountCents)}</td>
                      <td className="p-2 capitalize">{p.status}</td>
                      <td className="p-2">
                        {p.arrivalDate
                          ? new Date(p.arrivalDate * 1000).toLocaleDateString()
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-pe-brown">No payouts yet.</p>
          )}
          <p className="text-sm">
            <Link href="/partner/payments/report" className="underline">
              Open payout &amp; fee breakdown report →
            </Link>
          </p>
        </Card>
      )}
    </div>
  )
}
