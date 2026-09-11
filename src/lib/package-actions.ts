'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { ActionState } from '@/lib/action-state'
import { logAudit } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth'

export async function adminSavePackageAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin()
  const id = String(formData.get('id') ?? '')
  const sku = String(formData.get('sku') ?? '').trim().toUpperCase()
  const name = String(formData.get('name') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const unitCount = Math.round(Number(formData.get('unitCount') ?? 0))
  const priceCents = Math.round(Number(formData.get('price') ?? 0) * 100)
  const weightOz = Number(formData.get('weightOz') ?? 0)
  const lengthIn = Number(formData.get('lengthIn') ?? 14)
  const widthIn = Number(formData.get('widthIn') ?? 14)
  const heightIn = Number(formData.get('heightIn') ?? 4)
  const boxCount = Math.max(1, Math.round(Number(formData.get('boxCount') ?? 1)))
  let imagePath = String(formData.get('imagePath') ?? '').trim()
  const sortOrder = Number(formData.get('sortOrder') ?? 0)
  const isActive = formData.get('isActive') === 'on'
  const visibleToAll = formData.get('visibleToAll') === 'on'
  const imageFile = formData.get('imageFile') as File | null

  if (!sku || !name) return { error: 'SKU and name are required.' }
  if (unitCount <= 0) return { error: 'Unit count (serums in package) must be greater than zero.' }
  if (priceCents < 0) return { error: 'Price must be valid.' }
  if (weightOz <= 0) return { error: 'Weight must be greater than zero.' }
  if (lengthIn <= 0 || widthIn <= 0 || heightIn <= 0) {
    return { error: 'Box dimensions must be greater than zero.' }
  }

  const admin = createAdminClient()

  if (imageFile && imageFile.size > 0) {
    if (imageFile.size > 5 * 1024 * 1024) return { error: 'Image must be 5 MB or smaller.' }
    const ext = imageFile.name.split('.').pop()?.toLowerCase() || 'jpg'
    if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      return { error: 'Use a JPG, PNG, or WebP image.' }
    }
    const path = `packages/${sku.toLowerCase()}-${Date.now()}.${ext}`
    const buf = Buffer.from(await imageFile.arrayBuffer())
    const { error: upErr } = await admin.storage.from('product-images').upload(path, buf, {
      contentType: imageFile.type || 'image/jpeg',
      upsert: true,
    })
    if (upErr) return { error: `Image upload failed: ${upErr.message}` }
    const { data: pub } = admin.storage.from('product-images').getPublicUrl(path)
    imagePath = pub.publicUrl
  }

  if (!imagePath) imagePath = '/brand/serum-temp.png'

  const payload = {
    sku,
    name,
    description,
    unit_count: unitCount,
    price_cents: priceCents,
    weight_oz: weightOz,
    length_in: lengthIn,
    width_in: widthIn,
    height_in: heightIn,
    box_count: boxCount,
    image_path: imagePath,
    sort_order: sortOrder,
    is_active: isActive,
    visible_to_all: visibleToAll,
  }

  let packageId = id
  let wasVisibleToAll = true
  if (id) {
    const { data: prev } = await admin
      .from('inventory_packages')
      .select('visible_to_all')
      .eq('id', id)
      .maybeSingle()
    wasVisibleToAll = prev?.visible_to_all !== false
    const { error } = await admin.from('inventory_packages').update(payload).eq('id', id)
    if (error) return { error: error.message }
  } else {
    const { data: created, error } = await admin
      .from('inventory_packages')
      .insert(payload)
      .select('id')
      .single()
    if (error) return { error: error.message }
    packageId = created.id
  }

  // Switching off "visible to all" starts with nobody assigned.
  if (!visibleToAll && wasVisibleToAll && packageId) {
    await admin.from('distributor_package_assignments').delete().eq('package_id', packageId)
  }

  revalidatePath('/admin/products')
  revalidatePath('/partner/packages')
  if (packageId) revalidatePath(`/admin/products/packages/${packageId}`)
  return { success: true, message: id ? 'Package updated.' : 'Package created.' }
}

export async function adminDeletePackageAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin()
  const packageId = String(formData.get('packageId') ?? '')
  if (!packageId) return { error: 'Missing package.' }

  const admin = createAdminClient()
  const { data: pkg } = await admin
    .from('inventory_packages')
    .select('sku, name')
    .eq('id', packageId)
    .single()

  const { count } = await admin
    .from('package_orders')
    .select('id', { count: 'exact', head: true })
    .eq('package_id', packageId)

  if ((count ?? 0) > 0) {
    return {
      error:
        'This package has existing Partner orders. Deactivate it instead of deleting so order history stays intact.',
    }
  }

  const { error } = await admin.from('inventory_packages').delete().eq('id', packageId)
  if (error) return { error: error.message }

  await logAudit({
    actorId: null,
    action: 'package_deleted',
    entityType: 'inventory_packages',
    entityId: packageId,
    detail: { sku: pkg?.sku, name: pkg?.name },
  })

  revalidatePath('/admin/products')
  revalidatePath('/partner/packages')
  redirect('/admin/products')
}

export async function adminTogglePackageAssignmentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin()
  const packageId = String(formData.get('packageId') ?? '')
  const distributorId = String(formData.get('distributorId') ?? '')
  const assign = formData.get('assign') === '1'

  if (!packageId || !distributorId) return { error: 'Missing package or distributor.' }

  const admin = createAdminClient()
  if (assign) {
    const { error } = await admin.from('distributor_package_assignments').upsert(
      { package_id: packageId, distributor_id: distributorId },
      { onConflict: 'distributor_id,package_id' },
    )
    if (error) return { error: error.message }
  } else {
    const { error } = await admin
      .from('distributor_package_assignments')
      .delete()
      .eq('package_id', packageId)
      .eq('distributor_id', distributorId)
    if (error) return { error: error.message }
  }

  revalidatePath(`/admin/products/packages/${packageId}`)
  revalidatePath('/partner/packages')
  return { success: true, message: assign ? 'Partner can see this package.' : 'Partner removed.' }
}

export async function adminClearPackageAssignmentsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin()
  const packageId = String(formData.get('packageId') ?? '')
  if (!packageId) return { error: 'Missing package.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('distributor_package_assignments')
    .delete()
    .eq('package_id', packageId)
  if (error) return { error: error.message }

  revalidatePath(`/admin/products/packages/${packageId}`)
  revalidatePath('/partner/packages')
  return { success: true, message: 'All Partners removed. Assign only who should see this package.' }
}
