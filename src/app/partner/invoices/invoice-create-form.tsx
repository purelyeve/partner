'use client'

import { useActionState, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { Alert, Button, Card, Label } from '@/components/ui'
import {
  getInvoiceShippingRatesAction,
  partnerCreateInvoiceAction,
} from '@/lib/invoice-actions'
import { computeDiscountCents, formatCurrency } from '@/lib/utils'
import type { Customer, Product, ShippingRate } from '@/lib/types'

type Line = { productId: string; quantity: number }

export default function InvoiceCreateForm({
  customers,
  products,
  defaultCustomerId,
}: {
  customers: Pick<Customer, 'id' | 'full_name' | 'email' | 'resale_certificate_number' | 'resale_document_path'>[]
  products: Product[]
  defaultCustomerId?: string
}) {
  const [state, action, pending] = useActionState(partnerCreateInvoiceAction, null)
  const [customerId, setCustomerId] = useState(defaultCustomerId ?? '')
  const [customerType, setCustomerType] = useState<'direct_to_customer' | 'retail_wholesale'>(
    'direct_to_customer',
  )
  const [lines, setLines] = useState<Line[]>(
    products[0] ? [{ productId: products[0].id, quantity: 1 }] : [],
  )
  const [discountType, setDiscountType] = useState<'none' | 'percent' | 'amount'>('none')
  const [discountValue, setDiscountValue] = useState(0)
  const [rates, setRates] = useState<ShippingRate[]>([])
  const [shipmentId, setShipmentId] = useState('')
  const [selectedRateId, setSelectedRateId] = useState('')
  const [rateError, setRateError] = useState<string | null>(null)
  const [ratesPending, startRates] = useTransition()

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  const subtotal = lines.reduce((sum, line) => {
    const p = productMap.get(line.productId)
    if (!p) return sum
    const unit = customerType === 'retail_wholesale' ? p.wholesale_cents : p.retail_cents
    return sum + unit * Math.max(1, line.quantity)
  }, 0)

  const discountCents = computeDiscountCents(subtotal, discountType, discountValue)
  const afterDiscount = Math.max(0, subtotal - discountCents)

  const weightOz = lines.reduce((sum, line) => {
    const p = productMap.get(line.productId)
    return sum + (p?.weight_oz ?? 0) * Math.max(1, line.quantity)
  }, 0)

  const selectedRate = rates.find((r) => r.id === selectedRateId)
  const customer = customers.find((c) => c.id === customerId)
  const wholesaleBlocked =
    customerType === 'retail_wholesale' &&
    customer &&
    !customer.resale_certificate_number &&
    !customer.resale_document_path

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)))
    setRates([])
    setSelectedRateId('')
  }

  function addLine() {
    if (!products[0]) return
    setLines((prev) => [...prev, { productId: products[0].id, quantity: 1 }])
    setRates([])
    setSelectedRateId('')
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index))
    setRates([])
    setSelectedRateId('')
  }

  function fetchRates() {
    if (!customerId || weightOz <= 0) return
    startRates(async () => {
      const fd = new FormData()
      fd.set('customerId', customerId)
      fd.set('weightOz', String(weightOz))
      const result = await getInvoiceShippingRatesAction(fd)
      if (result.error && !result.rates?.length) {
        setRateError(result.error)
        setRates([])
        return
      }
      setRateError(result.error ?? null)
      setRates(result.rates ?? [])
      setShipmentId(result.shipmentId ?? '')
      const free = (result.rates ?? []).find((r) => r.id === 'free')
      setSelectedRateId(free?.id ?? result.rates?.[0]?.id ?? '')
    })
  }

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="customerType" value={customerType} />
      <input type="hidden" name="discountType" value={discountType} />
      <input type="hidden" name="discountValue" value={String(discountValue)} />
      <input type="hidden" name="linesJson" value={JSON.stringify(lines)} />
      <input type="hidden" name="rateId" value={selectedRate?.id ?? ''} />
      <input type="hidden" name="carrier" value={selectedRate?.carrier ?? ''} />
      <input type="hidden" name="service" value={selectedRate?.service ?? ''} />
      <input type="hidden" name="shippingCents" value={String(selectedRate?.rateCents ?? 0)} />
      <input type="hidden" name="shipmentId" value={shipmentId} />

      {state?.error && <Alert variant="error">{state.error}</Alert>}
      {wholesaleBlocked && (
        <Alert variant="warning">
          This customer needs a resale certificate on file before a wholesale invoice.{' '}
          <Link href={`/partner/customers/${customerId}`}>Add resale docs</Link>
        </Alert>
      )}

      <Card className="space-y-4">
        <h2 className="text-lg">Customer & order type</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="customerSelect" required>
              Customer
            </Label>
            <select
              id="customerSelect"
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value)
                setRates([])
                setSelectedRateId('')
              }}
              required
            >
              <option value="">Select customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name} ({c.email})
                </option>
              ))}
            </select>
            <p className="text-xs text-pe-brown mt-1">
              <Link href="/partner/customers/new">Add a new customer</Link>
            </p>
          </div>
          <div>
            <Label required>Order type</Label>
            <div className="space-y-2 mt-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="customerTypeUi"
                  checked={customerType === 'direct_to_customer'}
                  onChange={() => setCustomerType('direct_to_customer')}
                />
                Direct to Customer (taxed, retail price)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="customerTypeUi"
                  checked={customerType === 'retail_wholesale'}
                  onChange={() => setCustomerType('retail_wholesale')}
                />
                Retail Wholesale (tax exempt, wholesale price)
              </label>
            </div>
          </div>
        </div>
      </Card>

      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg">Line items</h2>
          <Button type="button" variant="secondary" onClick={addLine}>
            Add line
          </Button>
        </div>
        {lines.map((line, index) => {
          const p = productMap.get(line.productId)
          const unit =
            customerType === 'retail_wholesale' ? (p?.wholesale_cents ?? 0) : (p?.retail_cents ?? 0)
          return (
            <div key={index} className="grid sm:grid-cols-12 gap-3 items-end border-b border-pe-beige pb-4">
              <div className="sm:col-span-6">
                <Label>Product</Label>
                <select
                  value={line.productId}
                  onChange={(e) => updateLine(index, { productId: e.target.value })}
                >
                  {products.map((prod) => (
                    <option key={prod.id} value={prod.id}>
                      {prod.name} ({prod.sku})
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <Label>Qty</Label>
                <input
                  type="number"
                  min={1}
                  value={line.quantity}
                  onChange={(e) =>
                    updateLine(index, { quantity: Math.max(1, Number(e.target.value) || 1) })
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Unit</Label>
                <p className="py-2 text-sm">{formatCurrency(unit)}</p>
              </div>
              <div className="sm:col-span-2 flex gap-2 items-center">
                <p className="text-sm font-medium">{formatCurrency(unit * line.quantity)}</p>
                {lines.length > 1 && (
                  <Button type="button" variant="ghost" onClick={() => removeLine(index)}>
                    Remove
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </Card>

      <Card className="space-y-4">
        <h2 className="text-lg">Discount (products only)</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <Label>Type</Label>
            <select
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as typeof discountType)}
            >
              <option value="none">None</option>
              <option value="percent">Percent off</option>
              <option value="amount">Dollar amount off</option>
            </select>
          </div>
          <div>
            <Label>Value</Label>
            <input
              type="number"
              min={0}
              step={discountType === 'percent' ? 1 : 0.01}
              value={discountValue}
              disabled={discountType === 'none'}
              onChange={(e) => setDiscountValue(Number(e.target.value) || 0)}
            />
          </div>
          <div>
            <Label>Discount</Label>
            <p className="py-2 text-sm">−{formatCurrency(discountCents)}</p>
          </div>
        </div>
      </Card>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg">Shipping</h2>
            <p className="text-xs text-pe-brown">
              Quoted from your fulfillment address · package weight ~{weightOz.toFixed(1)} oz
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={!customerId || weightOz <= 0 || ratesPending}
            onClick={fetchRates}
          >
            {ratesPending ? 'Getting rates…' : 'Get shipping rates'}
          </Button>
        </div>
        {rateError && <Alert variant="warning">{rateError}</Alert>}
        {rates.length > 0 && (
          <div className="space-y-2">
            {rates.map((rate) => (
              <label
                key={rate.id}
                className="flex items-center gap-3 border border-pe-beige rounded-sm px-3 py-2 text-sm cursor-pointer"
              >
                <input
                  type="radio"
                  name="rateUi"
                  checked={selectedRateId === rate.id}
                  onChange={() => setSelectedRateId(rate.id)}
                />
                <span className="flex-1">
                  {rate.carrier} {rate.service}
                  {rate.deliveryDays != null ? ` · ~${rate.deliveryDays} days` : ''}
                </span>
                <span className="font-medium">
                  {rate.rateCents === 0 ? 'Free' : formatCurrency(rate.rateCents)}
                </span>
              </label>
            ))}
          </div>
        )}
      </Card>

      <Card className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>
        {discountCents > 0 && (
          <div className="flex justify-between text-pe-brown">
            <span>Discount</span>
            <span>−{formatCurrency(discountCents)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>Shipping</span>
          <span>
            {selectedRate
              ? selectedRate.rateCents === 0
                ? 'Free'
                : formatCurrency(selectedRate.rateCents)
              : '—'}
          </span>
        </div>
        <div className="flex justify-between text-pe-brown">
          <span>Tax</span>
          <span>
            {customerType === 'retail_wholesale'
              ? '$0.00 (exempt)'
              : 'Calculated on create (destination)'}
          </span>
        </div>
        <div className="flex justify-between text-base font-medium pt-2 border-t border-pe-beige">
          <span>Products + shipping</span>
          <span>{formatCurrency(afterDiscount + (selectedRate?.rateCents ?? 0))}</span>
        </div>
      </Card>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          name="sendNow"
          value="1"
          disabled={pending || !customerId || !selectedRate || !!wholesaleBlocked}
          className="inline-flex items-center justify-center px-5 py-2.5 text-sm tracking-wide transition-colors rounded-sm cursor-pointer disabled:cursor-not-allowed bg-pe-gold text-white hover:bg-pe-brown disabled:opacity-50"
        >
          {pending ? 'Creating…' : 'Create & email invoice'}
        </button>
        <button
          type="submit"
          name="sendNow"
          value="0"
          disabled={pending || !customerId || !selectedRate || !!wholesaleBlocked}
          className="inline-flex items-center justify-center px-5 py-2.5 text-sm tracking-wide transition-colors rounded-sm cursor-pointer disabled:cursor-not-allowed bg-pe-cream text-pe-dark-brown border border-pe-beige hover:bg-pe-beige disabled:opacity-50"
        >
          Save draft
        </button>
        <Link href="/partner/invoices">
          <Button type="button" variant="ghost">
            Cancel
          </Button>
        </Link>
      </div>
    </form>
  )
}
