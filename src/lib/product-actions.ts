'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { ActionState } from '@/lib/action-state'
import { logAudit } from '@/lib/admin'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth'

export async function adminSaveProductAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin()
  const id = String(formData.get('id') ?? '')
  const sku = String(formData.get('sku') ?? '').trim().toUpperCase()
  const name = String(formData.get('name') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const retailCents = Math.round(Number(formData.get('retailPrice') ?? 0) * 100)
  const wholesaleCents = Math.round(Number(formData.get('wholesalePrice') ?? 0) * 100)
  const weightOz = Number(formData.get('weightOz') ?? 0)
  let imagePath = String(formData.get('imagePath') ?? '').trim()
  const sortOrder = Number(formData.get('sortOrder') ?? 0)
  const isActive = formData.get('isActive') === 'on'
  const imageFile = formData.get('imageFile') as File | null

  if (!sku || !name) return { error: 'SKU and name are required.' }
  if (retailCents < 0 || wholesaleCents < 0) return { error: 'Prices must be valid.' }
  if (weightOz <= 0) return { error: 'Weight must be greater than zero.' }

  const admin = createAdminClient()

  if (imageFile && imageFile.size > 0) {
    if (imageFile.size > 5 * 1024 * 1024) return { error: 'Image must be 5 MB or smaller.' }
    const ext = imageFile.name.split('.').pop()?.toLowerCase() || 'jpg'
    if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      return { error: 'Use a JPG, PNG, or WebP image.' }
    }
    const path = `products/${sku.toLowerCase()}-${Date.now()}.${ext}`
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
    retail_cents: retailCents,
    wholesale_cents: wholesaleCents,
    weight_oz: weightOz,
    image_path: imagePath,
    sort_order: sortOrder,
    is_active: isActive,
  }

  if (id) {
    const { error } = await admin.from('products').update(payload).eq('id', id)
    if (error) return { error: error.message }
  } else {
    const { error } = await admin.from('products').insert(payload)
    if (error) return { error: error.message }
  }

  revalidatePath('/admin/products')
  return { success: true, message: id ? 'Product updated.' : 'Product created.' }
}

export async function adminDeleteProductAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin()
  const productId = String(formData.get('productId') ?? '')
  if (!productId) return { error: 'Missing product.' }

  const admin = createAdminClient()
  const { data: product } = await admin.from('products').select('sku, name').eq('id', productId).single()
  const { error } = await admin.from('products').delete().eq('id', productId)
  if (error) return { error: error.message }

  await logAudit({
    actorId: null,
    action: 'product_deleted',
    entityType: 'products',
    entityId: productId,
    detail: { sku: product?.sku, name: product?.name },
  })

  revalidatePath('/admin/products')
  redirect('/admin/products')
}

export async function adminToggleProductAssignmentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin()
  const productId = String(formData.get('productId') ?? '')
  const distributorId = String(formData.get('distributorId') ?? '')
  const assign = formData.get('assign') === '1'

  if (!productId || !distributorId) return { error: 'Missing product or distributor.' }

  const admin = createAdminClient()
  if (assign) {
    const { error } = await admin.from('distributor_product_assignments').upsert(
      { product_id: productId, distributor_id: distributorId },
      { onConflict: 'distributor_id,product_id' },
    )
    if (error) return { error: error.message }
  } else {
    const { error } = await admin
      .from('distributor_product_assignments')
      .delete()
      .eq('product_id', productId)
      .eq('distributor_id', distributorId)
    if (error) return { error: error.message }
  }

  revalidatePath(`/admin/products/${productId}`)
  return { success: true }
}

export async function partnerAdjustInventoryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const sku = String(formData.get('sku') ?? '').trim()
  const quantity = Number(formData.get('quantity') ?? 0)
  if (!sku) return { error: 'Missing SKU.' }
  if (!Number.isFinite(quantity) || quantity < 0) return { error: 'Quantity must be zero or greater.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }

  const { data: distributor } = await supabase
    .from('distributors')
    .select('id')
    .eq('profile_id', user.id)
    .single()
  if (!distributor) return { error: 'Distributor not found' }

  const { data: existing } = await supabase
    .from('distributor_inventory')
    .select('quantity_on_hand')
    .eq('distributor_id', distributor.id)
    .eq('sku', sku)
    .maybeSingle()

  const prev = existing?.quantity_on_hand ?? 0
  const delta = Math.round(quantity) - prev

  const { error } = await supabase.from('distributor_inventory').upsert(
    {
      distributor_id: distributor.id,
      sku,
      quantity_on_hand: Math.round(quantity),
      low_stock_threshold: 10,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'distributor_id,sku' },
  )
  if (error) return { error: error.message }

  if (delta !== 0) {
    await supabase.from('inventory_movements').insert({
      distributor_id: distributor.id,
      sku,
      delta,
      reason: 'manual_adjustment',
      created_by: user.id,
    })
  }

  await logAudit({
    actorId: user.id,
    action: 'inventory_adjusted',
    entityType: 'distributor_inventory',
    entityId: distributor.id,
    detail: { sku, quantity: Math.round(quantity), delta },
  })

  revalidatePath('/partner/inventory')
  revalidatePath('/partner')
  return { success: true, message: 'Inventory updated.' }
}

export async function partnerDeleteCustomerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const customerId = String(formData.get('customerId') ?? '')
  if (!customerId) return { error: 'Missing customer.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }

  const { data: distributor } = await supabase
    .from('distributors')
    .select('id')
    .eq('profile_id', user.id)
    .single()
  if (!distributor) return { error: 'Distributor not found' }

  const { count } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', customerId)
    .eq('distributor_id', distributor.id)

  if ((count ?? 0) > 0) {
    return {
      error: 'This customer has invoices. Cancel or keep them for records; deletion is blocked while invoices exist.',
    }
  }

  const { error } = await supabase
    .from('customers')
    .delete()
    .eq('id', customerId)
    .eq('distributor_id', distributor.id)

  if (error) return { error: error.message }

  revalidatePath('/partner/customers')
  redirect('/partner/customers')
}
