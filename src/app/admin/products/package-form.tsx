'use client'

import { useActionState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Alert, Button, Card, Label } from '@/components/ui'
import { adminDeletePackageAction, adminSavePackageAction } from '@/lib/package-actions'
import type { InventoryPackage } from '@/lib/types'

export default function PackageForm({ pkg }: { pkg?: InventoryPackage }) {
  const [state, action, pending] = useActionState(adminSavePackageAction, null)
  const [deleteState, deleteAction, deletePending] = useActionState(adminDeletePackageAction, null)

  return (
    <div className="space-y-6 max-w-2xl">
      <form action={action} className="space-y-6">
        {pkg?.id && <input type="hidden" name="id" value={pkg.id} />}

        {state?.error && <Alert variant="error">{state.error}</Alert>}
        {state?.success && <Alert variant="success">{state.message ?? 'Saved.'}</Alert>}

        <Card className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="sku" required>
                SKU
              </Label>
              <input id="sku" name="sku" defaultValue={pkg?.sku ?? ''} required />
            </div>
            <div>
              <Label htmlFor="sortOrder">Sort order</Label>
              <input
                id="sortOrder"
                name="sortOrder"
                type="number"
                defaultValue={pkg?.sort_order ?? 0}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="name" required>
                Name
              </Label>
              <input id="name" name="name" defaultValue={pkg?.name ?? ''} required />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                name="description"
                rows={3}
                defaultValue={pkg?.description ?? ''}
              />
            </div>
            <div>
              <Label htmlFor="unitCount" required>
                Serums in package
              </Label>
              <input
                id="unitCount"
                name="unitCount"
                type="number"
                min="1"
                step="1"
                defaultValue={pkg?.unit_count ?? 20}
                required
              />
              <p className="text-xs text-pe-brown mt-1">
                Credited to Partner inventory when the package order is paid.
              </p>
            </div>
            <div>
              <Label htmlFor="price" required>
                Package price ($)
              </Label>
              <input
                id="price"
                name="price"
                type="number"
                step="0.01"
                min="0"
                defaultValue={pkg ? (pkg.price_cents / 100).toFixed(2) : '560.00'}
                required
              />
              <p className="text-xs text-pe-brown mt-1">Plus shipping at checkout. Not taxed.</p>
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
                defaultValue={pkg?.weight_oz ?? 160}
                required
              />
            </div>
            <div>
              <Label htmlFor="boxCount" required>
                Box count
              </Label>
              <input
                id="boxCount"
                name="boxCount"
                type="number"
                min="1"
                step="1"
                defaultValue={pkg?.box_count ?? 1}
                required
              />
            </div>
            <div>
              <Label htmlFor="lengthIn" required>
                Length (in)
              </Label>
              <input
                id="lengthIn"
                name="lengthIn"
                type="number"
                step="0.1"
                min="0.1"
                defaultValue={pkg?.length_in ?? 14}
                required
              />
            </div>
            <div>
              <Label htmlFor="widthIn" required>
                Width (in)
              </Label>
              <input
                id="widthIn"
                name="widthIn"
                type="number"
                step="0.1"
                min="0.1"
                defaultValue={pkg?.width_in ?? 14}
                required
              />
            </div>
            <div>
              <Label htmlFor="heightIn" required>
                Height (in)
              </Label>
              <input
                id="heightIn"
                name="heightIn"
                type="number"
                step="0.1"
                min="0.1"
                defaultValue={pkg?.height_in ?? 4}
                required
              />
            </div>
            <div className="sm:col-span-2 space-y-2">
              <Label htmlFor="imageFile">Package photo</Label>
              {pkg?.image_path ? (
                <div className="flex items-center gap-3">
                  <Image
                    src={pkg.image_path}
                    alt=""
                    width={64}
                    height={64}
                    className="rounded-sm object-cover bg-pe-cream"
                    unoptimized={pkg.image_path.startsWith('http')}
                  />
                  <p className="text-xs text-pe-brown break-all">{pkg.image_path}</p>
                </div>
              ) : null}
              <input
                id="imageFile"
                name="imageFile"
                type="file"
                accept="image/jpeg,image/png,image/webp"
              />
              <input
                type="hidden"
                name="imagePath"
                value={pkg?.image_path || '/brand/serum-temp.png'}
              />
              <p className="text-xs text-pe-brown">
                JPG, PNG, or WebP up to 5 MB. Leave empty to keep the current image.
              </p>
            </div>
            <div className="sm:col-span-2 flex items-center gap-2">
              <input
                id="isActive"
                name="isActive"
                type="checkbox"
                defaultChecked={pkg?.is_active ?? true}
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
                defaultChecked={pkg?.visible_to_all ?? true}
              />
              <div>
                <Label htmlFor="visibleToAll" className="mb-0">
                  Visible to all Partners
                </Label>
                <p className="text-xs text-pe-brown mt-1">
                  Uncheck to choose specific Partners. After unchecking, no one is selected until you
                  assign them.
                </p>
              </div>
            </div>
          </div>
        </Card>

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : pkg ? 'Save package' : 'Create package'}
          </Button>
          <Link href="/admin/products">
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </Link>
        </div>
      </form>

      {pkg?.id && (
        <Card className="space-y-3 border-red-200">
          <h2 className="text-lg text-red-800">Delete package</h2>
          <p className="text-sm text-pe-brown">
            Only packages with no Partner orders can be deleted. Otherwise deactivate the package
            above.
          </p>
          {deleteState?.error && <Alert variant="error">{deleteState.error}</Alert>}
          <form action={deleteAction}>
            <input type="hidden" name="packageId" value={pkg.id} />
            <Button type="submit" variant="danger" disabled={deletePending}>
              {deletePending ? 'Deleting…' : 'Delete package'}
            </Button>
          </form>
        </Card>
      )}
    </div>
  )
}
