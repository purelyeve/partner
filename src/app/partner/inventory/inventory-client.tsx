'use client'

import { useActionState } from 'react'
import Image from 'next/image'
import { Alert, Badge, Button, Card, Label } from '@/components/ui'
import { partnerAdjustInventoryAction } from '@/lib/product-actions'
import { formatCurrency } from '@/lib/utils'
import { LOW_STOCK_THRESHOLD } from '@/lib/constants'
import type { Product } from '@/lib/types'

type Row = {
  product: Product
  quantity: number
  threshold: number
}

function AdjustForm({ sku, quantity }: { sku: string; quantity: number }) {
  const [state, action, pending] = useActionState(partnerAdjustInventoryAction, null)

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="sku" value={sku} />
      <div>
        <Label htmlFor={`qty-${sku}`}>On hand</Label>
        <input
          id={`qty-${sku}`}
          name="quantity"
          type="number"
          min={0}
          defaultValue={quantity}
          className="w-24"
          required
        />
      </div>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? 'Saving…' : 'Update'}
      </Button>
      {state?.error && <span className="text-xs text-red-600 w-full">{state.error}</span>}
      {state?.success && (
        <span className="text-xs text-green-700 w-full">{state.message ?? 'Saved'}</span>
      )}
    </form>
  )
}

export default function InventoryClient({ rows }: { rows: Row[] }) {
  const low = rows.filter((r) => r.quantity <= (r.threshold || LOW_STOCK_THRESHOLD))

  return (
    <div className="space-y-6">
      {low.length > 0 && (
        <Alert variant="warning">
          Low stock on {low.map((r) => r.product.name).join(', ')} (threshold{' '}
          {LOW_STOCK_THRESHOLD} units).
        </Alert>
      )}

      <div className="grid gap-4">
        {rows.map(({ product, quantity, threshold }) => {
          const isLow = quantity <= (threshold || LOW_STOCK_THRESHOLD)
          return (
            <Card key={product.id} className="flex flex-col sm:flex-row gap-4 sm:items-center">
              {product.image_path ? (
                <Image
                  src={product.image_path}
                  alt=""
                  width={72}
                  height={72}
                  className="rounded-sm object-cover bg-pe-cream"
                />
              ) : null}
              <div className="flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg">{product.name}</h2>
                  {isLow && <Badge tone="warning">Low stock</Badge>}
                </div>
                <p className="text-xs font-mono text-pe-brown">{product.sku}</p>
                <p className="text-sm text-pe-brown">
                  Retail {formatCurrency(product.retail_cents)} · Wholesale{' '}
                  {formatCurrency(product.wholesale_cents)} · {product.weight_oz} oz
                </p>
              </div>
              <AdjustForm sku={product.sku} quantity={quantity} />
            </Card>
          )
        })}
      </div>
    </div>
  )
}
