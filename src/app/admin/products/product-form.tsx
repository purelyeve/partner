'use client'

import { useActionState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Alert, Button, Card, Label } from '@/components/ui'
import { adminDeleteProductAction, adminSaveProductAction } from '@/lib/product-actions'
import type { Product } from '@/lib/types'

export default function ProductForm({ product }: { product?: Product }) {
  const [state, action, pending] = useActionState(adminSaveProductAction, null)
  const [deleteState, deleteAction, deletePending] = useActionState(adminDeleteProductAction, null)

  return (
    <div className="space-y-6 max-w-2xl">
      <form action={action} className="space-y-6">
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
            <div className="sm:col-span-2 space-y-2">
              <Label htmlFor="imageFile">Product photo</Label>
              {product?.image_path ? (
                <div className="flex items-center gap-3">
                  <Image
                    src={product.image_path}
                    alt=""
                    width={64}
                    height={64}
                    className="rounded-sm object-cover bg-pe-cream"
                    unoptimized={product.image_path.startsWith('http')}
                  />
                  <p className="text-xs text-pe-brown break-all">{product.image_path}</p>
                </div>
              ) : null}
              <input id="imageFile" name="imageFile" type="file" accept="image/jpeg,image/png,image/webp" />
              <input type="hidden" name="imagePath" value={product?.image_path || '/brand/serum-temp.png'} />
              <p className="text-xs text-pe-brown">JPG, PNG, or WebP up to 5 MB. Leave empty to keep the current image.</p>
            </div>
            <div className="sm:col-span-2 flex items-center gap-2">
              <input
                id="isActive"
                name="isActive"
                type="checkbox"
                defaultChecked={product?.is_active ?? true}
              />
              <Label htmlFor="isActive" className="mb-0">
                Active (in catalog)
              </Label>
            </div>
            <div className="sm:col-span-2 flex items-start gap-2">
              <input
                id="visibleToAll"
                name="visibleToAll"
                type="checkbox"
                className="mt-1"
                defaultChecked={product?.visible_to_all ?? true}
              />
              <div>
                <Label htmlFor="visibleToAll" className="mb-0">
                  Visible to all Partners
                </Label>
                <p className="text-xs text-pe-brown mt-1">
                  Uncheck to choose specific Partners on this product&apos;s page after saving.
                </p>
              </div>
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

      {product?.id && (
        <Card className="space-y-3 border-red-200">
          <h2 className="text-lg text-red-800">Delete product</h2>
          <p className="text-sm text-pe-brown">
            Removes this SKU from the catalog and Partner assignments. Past invoice line items keep
            their name/price snapshots.
          </p>
          {deleteState?.error && <Alert variant="error">{deleteState.error}</Alert>}
          <form action={deleteAction}>
            <input type="hidden" name="productId" value={product.id} />
            <Button type="submit" variant="danger" disabled={deletePending}>
              {deletePending ? 'Deleting…' : 'Delete product'}
            </Button>
          </form>
        </Card>
      )}
    </div>
  )
}
