'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Alert, Button, Card, Label } from '@/components/ui'
import { adminSaveProductAction } from '@/lib/product-actions'
import type { Product } from '@/lib/types'

export default function ProductForm({ product }: { product?: Product }) {
  const [state, action, pending] = useActionState(adminSaveProductAction, null)

  return (
    <form action={action} className="space-y-6 max-w-2xl">
      {product?.id && <input type="hidden" name="id" value={product.id} />}

      {state?.error && <Alert variant="error">{state.error}</Alert>}
      {state?.success && <Alert variant="success">{state.message ?? 'Saved.'}</Alert>}

      <Card className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="sku" required>
              SKU
            </Label>
            <input id="sku" name="sku" defaultValue={product?.sku ?? ''} required />
          </div>
          <div>
            <Label htmlFor="sortOrder">Sort order</Label>
            <input
              id="sortOrder"
              name="sortOrder"
              type="number"
              defaultValue={product?.sort_order ?? 0}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="name" required>
              Name
            </Label>
            <input id="name" name="name" defaultValue={product?.name ?? ''} required />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              name="description"
              rows={3}
              defaultValue={product?.description ?? ''}
            />
          </div>
          <div>
            <Label htmlFor="retailPrice" required>
              Retail price ($)
            </Label>
            <input
              id="retailPrice"
              name="retailPrice"
              type="number"
              step="0.01"
              min="0"
              defaultValue={product ? (product.retail_cents / 100).toFixed(2) : '84.00'}
              required
            />
          </div>
          <div>
            <Label htmlFor="wholesalePrice" required>
              Wholesale price ($)
            </Label>
            <input
              id="wholesalePrice"
              name="wholesalePrice"
              type="number"
              step="0.01"
              min="0"
              defaultValue={product ? (product.wholesale_cents / 100).toFixed(2) : '42.00'}
              required
            />
          </div>
          <div>
            <Label htmlFor="weightOz" required>
              Weight (oz)
            </Label>
            <input
              id="weightOz"
              name="weightOz"
              type="number"
              step="0.1"
              min="0.1"
              defaultValue={product?.weight_oz ?? 6.8}
              required
            />
          </div>
          <div>
            <Label htmlFor="imagePath">Image path</Label>
            <input
              id="imagePath"
              name="imagePath"
              defaultValue={product?.image_path || '/brand/serum-temp.png'}
            />
            <p className="text-xs text-pe-brown mt-1">Public path, e.g. /brand/serum-temp.png</p>
          </div>
          <div className="sm:col-span-2 flex items-center gap-2">
            <input
              id="isActive"
              name="isActive"
              type="checkbox"
              defaultChecked={product?.is_active ?? true}
            />
            <Label htmlFor="isActive" className="mb-0">
              Active (visible to Partners when assigned)
            </Label>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : product ? 'Save product' : 'Create product'}
        </Button>
        <Link href="/admin/products">
          <Button type="button" variant="secondary">
            Cancel
          </Button>
        </Link>
      </div>
    </form>
  )
}
