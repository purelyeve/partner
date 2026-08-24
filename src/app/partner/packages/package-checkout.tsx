'use client'

import { useState, useTransition, useActionState } from 'react'
import Link from 'next/link'
import { Alert, Button, Card, Label } from '@/components/ui'
import { cn, formatCurrency } from '@/lib/utils'
import { createPackageCheckoutAction, getShippingRatesAction } from '@/lib/actions'
import type { InventoryPackage, ShippingRate } from '@/lib/types'

export function PackageCheckout({
  packages,
  canPurchase,
  needsAddress = false,
}: {
  packages: InventoryPackage[]
  canPurchase: boolean
  needsAddress?: boolean
}) {
  const [selectedPkg, setSelectedPkg] = useState<InventoryPackage | null>(null)
  const [rates, setRates] = useState<ShippingRate[]>([])
  const [selectedRate, setSelectedRate] = useState<ShippingRate | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ratesPending, startTransition] = useTransition()
  const [checkoutState, checkoutAction, checkoutPending] = useActionState(createPackageCheckoutAction, null)

  function loadRates(pkg: InventoryPackage) {
    setSelectedPkg(pkg)
    setSelectedRate(null)
    setError(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set('packageId', pkg.id)
      const result = await getShippingRatesAction(fd)
      if (result.error) setError(result.error)
      else setRates(result.rates ?? [])
    })
  }

  if (!canPurchase) {
    return (
      <Alert variant="warning">
        {needsAddress ? (
          <>
            Add your mailing or fulfillment address before purchasing inventory.{' '}
            <Link href="/partner/profile">Update profile</Link>
          </>
        ) : (
          <>
            Complete onboarding (approved registration and accepted resale documentation) before
            purchasing inventory.
          </>
        )}
      </Alert>
    )
  }

  return (
    <div className="space-y-8">
      <div className="grid sm:grid-cols-2 gap-6">
        {packages.map((pkg) => {
          const isSelected = selectedPkg?.id === pkg.id
          return (
            <Card
              key={pkg.id}
              className={cn(
                'flex flex-col h-full transition-shadow',
                isSelected && 'ring-2 ring-pe-gold shadow-sm',
              )}
            >
              <p className="text-xs text-pe-gold tracking-wider uppercase mb-1">{pkg.sku}</p>
              <h2 className="text-xl mb-2">{pkg.name}</h2>
              <p className="text-sm text-pe-brown mb-4 flex-1">{pkg.description}</p>
              <p className="text-lg font-serif mb-1">{formatCurrency(pkg.price_cents)} + shipping</p>
              <p className="text-xs text-pe-brown mb-4">{pkg.unit_count} units · tax exempt (wholesale)</p>
              <Button
                type="button"
                variant={isSelected ? 'primary' : 'secondary'}
                onClick={() => loadRates(pkg)}
                disabled={ratesPending}
                className="w-full sm:w-auto"
              >
                {ratesPending && isSelected ? 'Loading rates…' : isSelected ? 'Selected' : 'Select package'}
              </Button>
            </Card>
          )
        })}
      </div>

      {error && <Alert variant="error">{error}</Alert>}
      {checkoutState?.error && <Alert variant="error">{checkoutState.error}</Alert>}

      {selectedPkg && rates.length > 0 && (
        <Card>
          <Label required>Shipping method</Label>
          <p className="text-sm text-pe-brown mb-4">Ship to your fulfillment address</p>
          <div className="space-y-2" role="radiogroup" aria-label="Shipping method">
            {rates.map((rate) => {
              const isSelected = selectedRate?.id === rate.id
              return (
                <label
                  key={rate.id}
                  className={cn(
                    'flex items-center gap-3 border rounded-sm p-4 cursor-pointer transition-colors',
                    isSelected
                      ? 'border-pe-gold bg-pe-cream/60 ring-1 ring-pe-gold'
                      : 'border-pe-beige hover:bg-pe-cream/40',
                  )}
                >
                  <input
                    type="radio"
                    name="rate"
                    checked={isSelected}
                    onChange={() => setSelectedRate(rate)}
                    className="accent-pe-gold"
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block text-pe-charcoal font-medium">
                      {rate.carrier} — {rate.service}
                    </span>
                    {rate.deliveryDays != null && (
                      <span className="block text-xs text-pe-brown mt-0.5">
                        Estimated {rate.deliveryDays} business days
                      </span>
                    )}
                  </span>
                  <span className="font-serif text-pe-dark-brown shrink-0">
                    {formatCurrency(rate.rateCents)}
                  </span>
                </label>
              )
            })}
          </div>

          {selectedRate && (
            <form action={checkoutAction} className="mt-6 pt-6 border-t border-pe-beige">
              <input type="hidden" name="packageId" value={selectedPkg.id} />
              <input type="hidden" name="rateId" value={selectedRate.id} />
              <input type="hidden" name="carrier" value={selectedRate.carrier} />
              <input type="hidden" name="service" value={selectedRate.service} />
              <input type="hidden" name="shippingCents" value={selectedRate.rateCents} />
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <div className="text-sm text-pe-brown space-y-1">
                  <p>{selectedPkg.name}</p>
                  <p>{selectedRate.carrier} — {selectedRate.service}</p>
                </div>
                <p className="text-lg font-serif text-pe-dark-brown">
                  {formatCurrency(selectedPkg.price_cents + selectedRate.rateCents)}
                </p>
              </div>
              <p className="text-xs text-pe-brown mb-4">Prepaid before shipment · tax exempt</p>
              <Button type="submit" disabled={checkoutPending}>
                {checkoutPending ? 'Redirecting…' : 'Proceed to payment'}
              </Button>
            </form>
          )}
        </Card>
      )}
    </div>
  )
}

export function PackagesPageHeader() {
  return (
    <div>
      <Link href="/partner" className="text-sm">← Dashboard</Link>
      <h1 className="text-3xl mt-2">Inventory packages</h1>
      <p className="text-sm text-pe-brown mt-1">
        Opening inventory is required to begin reselling. Orders are prepaid and tax-exempt.
      </p>
    </div>
  )
}
