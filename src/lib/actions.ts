'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import type { ActionState } from '@/lib/action-state'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { encryptTaxId, taxIdLast4 } from '@/lib/crypto'
import { maybePromoteAdmin, logAudit } from '@/lib/admin'
import { AGREEMENT_VERSION, DISTRIBUTOR_PROFILE } from '@/lib/constants'
import { emailShell, sendEmail } from '@/lib/email'
import { generateOrderNumber } from '@/lib/utils'
import { getPackageShippingRates, createEasyPostShipmentId } from '@/lib/easypost'
import { getStripe } from '@/lib/stripe'
import { fulfillmentAddress, hasCompleteShipToAddress } from '@/lib/auth'
import type { ApplicationStatus, DocumentStatus } from '@/lib/types'

const RESALE_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'])
const RESALE_EXT = /\.(pdf|jpe?g|png)$/i

const registerSchema = z.object({
  email: z.email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(2),
  phone: z.string().min(7),
  businessName: z.string().optional(),
  businessStructure: z.enum(['sole_proprietor', 'llc', 'corporation', 'other']).optional(),
  businessStructureOther: z.string().optional(),
  mailingLine1: z.string().min(3, 'Street address is required'),
  mailingLine2: z.string().optional(),
  mailingCity: z.string().min(2, 'City is required'),
  mailingState: z.string().length(2, 'State is required'),
  mailingPostalCode: z.string().min(5, 'ZIP code is required'),
  taxId: z.string().optional(),
  certificateNumber: z.string().min(2, 'Sales tax license / seller\'s permit number is required'),
  agreeToTerms: z.literal('yes', { error: 'You must agree to the Partner Terms & Wholesale Agreement' }),
})

async function requestMeta() {
  const h = await headers()
  const forwarded = h.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() || h.get('x-real-ip') || ''
  const userAgent = h.get('user-agent') || ''
  return { ip, userAgent }
}

export async function registerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = registerSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    fullName: formData.get('fullName'),
    phone: formData.get('phone'),
    businessName: String(formData.get('businessName') ?? '').trim() || undefined,
    businessStructure: String(formData.get('businessStructure') ?? '').trim() || undefined,
    businessStructureOther: formData.get('businessStructureOther') || '',
    mailingLine1: formData.get('mailingLine1'),
    mailingLine2: formData.get('mailingLine2') || '',
    mailingCity: formData.get('mailingCity'),
    mailingState: formData.get('mailingState'),
    mailingPostalCode: formData.get('mailingPostalCode'),
    taxId: String(formData.get('taxId') ?? '').trim() || undefined,
    certificateNumber: formData.get('certificateNumber'),
    agreeToTerms: formData.get('agreeToTerms'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const data = parsed.data
  const resaleFile = formData.get('resaleFile') as File | null
  if (!resaleFile || resaleFile.size === 0) {
    return { error: 'Please upload your resale documentation.' }
  }
  if (resaleFile.size > 10 * 1024 * 1024) {
    return { error: 'Resale document must be 10 MB or smaller.' }
  }
  const mimeOk = !resaleFile.type || RESALE_MIME.has(resaleFile.type) || resaleFile.type === 'image/jpg'
  const nameOk = RESALE_EXT.test(resaleFile.name)
  if (!mimeOk && !nameOk) {
    return { error: 'Resale document must be a PDF, JPG, JPEG, or PNG.' }
  }

  let taxCiphertext: string | null = null
  let last4: string | null = null
  if (data.taxId) {
    try {
      taxCiphertext = encryptTaxId(data.taxId)
      last4 = taxIdLast4(data.taxId)
    } catch {
      return { error: 'Server encryption is not configured. Contact support.' }
    }
  }

  const supabase = await createClient()
  const { ip, userAgent } = await requestMeta()
  const acceptedAt = new Date().toISOString()

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: data.email,
    password: data.password,
    options: {
      data: { full_name: data.fullName, phone: data.phone },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  })

  if (authError) return { error: authError.message }
  if (!authData.user) return { error: 'Registration failed' }

  // Email confirmation is required, so signUp does not return a session.
  // Use the service-role client for trusted server-side inserts and storage.
  const admin = createAdminClient()
  const { data: distributor, error: distError } = await admin
    .from('distributors')
    .insert({
      profile_id: authData.user.id,
      business_name: data.businessName ?? '',
      business_structure: data.businessStructure ?? 'sole_proprietor',
      business_structure_other: data.businessStructureOther ?? '',
      mailing_line1: data.mailingLine1,
      mailing_line2: data.mailingLine2 ?? '',
      mailing_city: data.mailingCity,
      mailing_state: data.mailingState,
      mailing_postal_code: data.mailingPostalCode,
      mailing_country: 'US',
      fulfillment_same_as_mailing: true,
      tax_id_ciphertext: taxCiphertext,
      tax_id_last4: last4,
      resale_certificate_number: data.certificateNumber,
      application_status: 'pending',
      application_submitted_at: acceptedAt,
      agreement_signed_at: acceptedAt,
    })
    .select('id')
    .single()

  if (distError || !distributor) {
    await admin.auth.admin.deleteUser(authData.user.id)
    return { error: distError?.message ?? 'Could not create partner profile' }
  }

  const storagePath = `${authData.user.id}/resale/${Date.now()}-${resaleFile.name.replace(/[^\w.\-]+/g, '_')}`
  const fileBuffer = Buffer.from(await resaleFile.arrayBuffer())
  const { error: uploadError } = await admin.storage
    .from('distributor-documents')
    .upload(storagePath, fileBuffer, {
      contentType: resaleFile.type || 'application/octet-stream',
      upsert: false,
    })

  if (uploadError) {
    await admin.from('distributors').delete().eq('id', distributor.id)
    await admin.auth.admin.deleteUser(authData.user.id)
    return { error: uploadError.message }
  }

  const { error: docError } = await admin.from('distributor_documents').insert({
    distributor_id: distributor.id,
    kind: 'resale_certificate',
    storage_path: storagePath,
    file_name: resaleFile.name,
    mime_type: resaleFile.type,
    size_bytes: resaleFile.size,
    status: 'pending',
  })

  if (docError) {
    await admin.storage.from('distributor-documents').remove([storagePath])
    await admin.from('distributors').delete().eq('id', distributor.id)
    await admin.auth.admin.deleteUser(authData.user.id)
    return { error: docError.message }
  }

  const { error: acceptError } = await admin.from('agreement_acceptances').insert({
    distributor_id: distributor.id,
    agreement_version: AGREEMENT_VERSION,
    full_name_typed: data.fullName,
    business_name: data.businessName ?? '',
    email: data.email,
    account_id: authData.user.id,
    checkbox_accepted: true,
    accepted_at: acceptedAt,
    ip_address: ip,
    user_agent: userAgent,
  })

  if (acceptError) {
    await admin.storage.from('distributor-documents').remove([storagePath])
    await admin.from('distributors').delete().eq('id', distributor.id)
    await admin.auth.admin.deleteUser(authData.user.id)
    return { error: acceptError.message }
  }

  await maybePromoteAdmin(authData.user.id, data.email)

  return {
    success: true,
    message:
      'Check your email to verify your account, then sign in. Purely Eve will review your registration and resale documentation before wholesale purchasing is activated.',
  }
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')
  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: error.message }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', (await supabase.auth.getUser()).data.user!.id)
    .single()

  if (profile?.role === 'admin') redirect('/admin')
  redirect('/partner')
}

export async function logoutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export async function forgotPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get('email') ?? '')
  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
  })
  if (error) return { error: error.message }
  return { success: true, message: 'If that email is registered, a reset link has been sent.' }
}

export async function resetPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const password = String(formData.get('password') ?? '')
  if (password.length < 8) return { error: 'Password must be at least 8 characters' }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { error: error.message }
  redirect('/login?reset=1')
}

/** Dev-only: smoke-test Resend from the home page. */
export async function sendTestEmailAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (process.env.NODE_ENV === 'production') {
    return { error: 'Test email is not available in production.' }
  }
  if (!process.env.RESEND_API_KEY) {
    return { error: 'RESEND_API_KEY is not set in .env.local' }
  }

  const email = String(formData.get('email') ?? '').trim()
  if (!email || !email.includes('@')) return { error: 'Enter a valid email address.' }

  const result = await sendEmail({
    to: email,
    subject: 'Purely Eve — Resend test',
    html: emailShell(
      'Resend test',
      `<p>This is a test email from the Purely Eve Partner Portal.</p><p>If you received this, Resend is configured correctly.</p><p>From: ${process.env.EMAIL_FROM ?? '(default)'}</p>`,
    ),
  })

  if (!result.ok) return { error: result.error ?? 'Failed to send test email.' }
  return { success: true, message: `Test email sent to ${email}. Check inbox and Resend → Emails.` }
}

export async function uploadResaleDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const file = formData.get('file') as File | null
  const certificateNumber = String(formData.get('certificateNumber') ?? '').trim()
  const resaleState = String(formData.get('resaleState') ?? '').trim()

  if (!file || file.size === 0) return { error: 'Please upload your resale certificate.' }
  if (!certificateNumber) return { error: 'Certificate number is required.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }

  const { data: distributor } = await supabase
    .from('distributors')
    .select('id, application_status, agreement_signed_at')
    .eq('profile_id', user.id)
    .single()

  if (!distributor) return { error: 'Partner profile not found.' }
  if (distributor.application_status === 'declined' || distributor.application_status === 'removed') {
    return { error: 'This account cannot upload documents.' }
  }

  const path = `${user.id}/resale/${Date.now()}-${file.name}`
  const { error: uploadError } = await supabase.storage
    .from('distributor-documents')
    .upload(path, file, { upsert: false })

  if (uploadError) return { error: uploadError.message }

  await supabase.from('distributor_documents').insert({
    distributor_id: distributor.id,
    kind: 'resale_certificate',
    storage_path: path,
    file_name: file.name,
    mime_type: file.type,
    size_bytes: file.size,
    status: 'pending',
  })

  await supabase
    .from('distributors')
    .update({
      resale_certificate_number: certificateNumber,
      resale_state: resaleState,
    })
    .eq('id', distributor.id)

  revalidatePath('/partner')
  return { success: true, message: 'Resale certificate submitted for review.' }
}

export async function updateProfileAction(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }

  const fullName = String(formData.get('fullName') ?? '')
  const phone = String(formData.get('phone') ?? '')
  const sameAsMailing = formData.get('fulfillmentSameAsMailing') === 'on'

  await supabase.from('profiles').update({ full_name: fullName, phone }).eq('id', user.id)

  const distUpdate = {
    business_name: String(formData.get('businessName') ?? ''),
    mailing_line1: String(formData.get('mailingLine1') ?? ''),
    mailing_line2: String(formData.get('mailingLine2') ?? ''),
    mailing_city: String(formData.get('mailingCity') ?? ''),
    mailing_state: String(formData.get('mailingState') ?? ''),
    mailing_postal_code: String(formData.get('mailingPostalCode') ?? ''),
    fulfillment_same_as_mailing: sameAsMailing,
    fulfillment_line1: sameAsMailing ? '' : String(formData.get('fulfillmentLine1') ?? ''),
    fulfillment_line2: sameAsMailing ? '' : String(formData.get('fulfillmentLine2') ?? ''),
    fulfillment_city: sameAsMailing ? '' : String(formData.get('fulfillmentCity') ?? ''),
    fulfillment_state: sameAsMailing ? '' : String(formData.get('fulfillmentState') ?? ''),
    fulfillment_postal_code: sameAsMailing ? '' : String(formData.get('fulfillmentPostalCode') ?? ''),
  }

  const { error } = await supabase
    .from('distributors')
    .update(distUpdate)
    .eq('profile_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/partner/profile')
  return { success: true, message: 'Profile updated.' }
}

// ---------------------------------------------------------------------------
// Admin actions
// ---------------------------------------------------------------------------

export async function adminDecideApplicationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const distributorId = String(formData.get('distributorId') ?? '')
  const decision = String(formData.get('decision') ?? '') as ApplicationStatus
  const note = String(formData.get('note') ?? '')

  if (!['approved', 'declined', 'suspended', 'removed'].includes(decision)) {
    return { error: 'Invalid decision' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }

  const admin = createAdminClient()
  const { data: dist } = await admin
    .from('distributors')
    .select(`*, ${DISTRIBUTOR_PROFILE}(email, full_name)`)
    .eq('id', distributorId)
    .single()

  if (!dist) return { error: 'Distributor not found' }

  await admin
    .from('distributors')
    .update({
      application_status: decision,
      application_decided_at: new Date().toISOString(),
      application_decided_by: user.id,
      application_decision_note: note,
    })
    .eq('id', distributorId)

  await logAudit({
    actorId: user.id,
    action: `application_${decision}`,
    entityType: 'distributor',
    entityId: distributorId,
    detail: { note },
  })

  const profile = dist.profiles as { email: string; full_name: string }
  const subject =
    decision === 'approved'
      ? 'Your Purely Eve Partner application has been approved'
      : decision === 'declined'
        ? 'Update on your Purely Eve Partner application'
        : 'Your Purely Eve Partner account status has changed'

  const body =
    decision === 'approved'
      ? `<p>Dear ${profile.full_name},</p><p>Your Partner registration has been approved. Once your resale documentation is accepted, you can purchase wholesale inventory packages from your Partner Portal.</p><p><a href="${process.env.NEXT_PUBLIC_APP_URL}/login">Sign in to the Partner Portal</a></p>`
      : `<p>Dear ${profile.full_name},</p><p>Your application status is now: <strong>${decision}</strong>.</p>${note ? `<p>Note: ${note}</p>` : ''}`

  await sendEmail({ to: profile.email, subject, html: emailShell(subject, body) })

  revalidatePath('/admin')
  return { success: true }
}

export async function adminReviewDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const documentId = String(formData.get('documentId') ?? '')
  const status = String(formData.get('status') ?? '') as DocumentStatus
  const note = String(formData.get('note') ?? '')

  if (!['accepted', 'rejected'].includes(status)) return { error: 'Invalid status' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }

  const admin = createAdminClient()
  const { data: doc } = await admin
    .from('distributor_documents')
    .select(`*, distributors(id, profile_id, ${DISTRIBUTOR_PROFILE}(email, full_name))`)
    .eq('id', documentId)
    .single()

  if (!doc) return { error: 'Document not found' }

  await admin
    .from('distributor_documents')
    .update({
      status,
      review_note: note,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    })
    .eq('id', documentId)

  if (doc.kind === 'resale_certificate' && status === 'accepted') {
    await admin
      .from('distributors')
      .update({ resale_accepted_at: new Date().toISOString() })
      .eq('id', doc.distributor_id)
  }

  if (doc.kind === 'resale_certificate' && status === 'rejected') {
    await admin
      .from('distributors')
      .update({ resale_accepted_at: null })
      .eq('id', doc.distributor_id)
  }

  const profiles = (doc.distributors as { profiles: { email: string; full_name: string } }).profiles
  await sendEmail({
    to: profiles.email,
    subject: `Your resale certificate has been ${status}`,
    html: emailShell(
      'Document review update',
      `<p>Dear ${profiles.full_name},</p><p>Your resale certificate was <strong>${status}</strong>.</p>${note ? `<p>Note: ${note}</p>` : ''}`,
    ),
  })

  revalidatePath('/admin')
  return { success: true }
}

// ---------------------------------------------------------------------------
// Package purchase
// ---------------------------------------------------------------------------

export async function getShippingRatesAction(formData: FormData) {
  const packageId = String(formData.get('packageId') ?? '')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }

  const { data: distributor } = await supabase
    .from('distributors')
    .select('*')
    .eq('profile_id', user.id)
    .single()

  if (!distributor) return { error: 'Distributor not found' }

  if (!hasCompleteShipToAddress(distributor)) {
    return {
      error: 'Add your mailing or fulfillment address in Profile before requesting shipping rates.',
    }
  }

  const { data: pkg } = await supabase
    .from('inventory_packages')
    .select('*')
    .eq('id', packageId)
    .single()

  if (!pkg) return { error: 'Package not found' }

  const addr = fulfillmentAddress(distributor)
  const rates = await getPackageShippingRates({
    to: {
      name: addr.name,
      street1: addr.line1,
      street2: addr.line2,
      city: addr.city,
      state: addr.state,
      zip: addr.postal_code,
      country: addr.country,
    },
    weightOz: pkg.weight_oz,
  })

  return { rates, package: pkg, address: addr }
}

export async function createPackageCheckoutAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const packageId = String(formData.get('packageId') ?? '')
  const rateId = String(formData.get('rateId') ?? '')
  const carrier = String(formData.get('carrier') ?? '')
  const service = String(formData.get('service') ?? '')
  const shippingCents = Number(formData.get('shippingCents') ?? 0)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }

  const { data: distributor } = await supabase
    .from('distributors')
    .select('*')
    .eq('profile_id', user.id)
    .single()

  if (!distributor) return { error: 'Distributor not found' }

  if (
    distributor.application_status !== 'approved' ||
    !distributor.agreement_signed_at ||
    !distributor.resale_accepted_at
  ) {
    return { error: 'Complete onboarding before purchasing inventory.' }
  }

  if (!hasCompleteShipToAddress(distributor)) {
    return { error: 'Add your mailing or fulfillment address in Profile before purchasing inventory.' }
  }

  const { data: pkg } = await supabase
    .from('inventory_packages')
    .select('*')
    .eq('id', packageId)
    .eq('is_active', true)
    .single()

  if (!pkg) return { error: 'Package not found' }

  const addr = fulfillmentAddress(distributor)
  const subtotal = pkg.price_cents
  const total = subtotal + shippingCents
  const orderNumber = generateOrderNumber()

  const shipmentId = await createEasyPostShipmentId({
    to: {
      name: addr.name,
      street1: addr.line1,
      street2: addr.line2,
      city: addr.city,
      state: addr.state,
      zip: addr.postal_code,
      country: addr.country,
    },
    weightOz: pkg.weight_oz,
  })

  const { data: order, error: orderError } = await supabase
    .from('package_orders')
    .insert({
      order_number: orderNumber,
      distributor_id: distributor.id,
      package_id: pkg.id,
      sku_snapshot: pkg.sku,
      name_snapshot: pkg.name,
      unit_count_snapshot: pkg.unit_count,
      unit_price_cents: pkg.price_cents,
      quantity: 1,
      subtotal_cents: subtotal,
      shipping_cents: shippingCents,
      tax_cents: 0,
      total_cents: total,
      ship_to_name: addr.name,
      ship_to_line1: addr.line1,
      ship_to_line2: addr.line2,
      ship_to_city: addr.city,
      ship_to_state: addr.state,
      ship_to_postal_code: addr.postal_code,
      ship_to_country: addr.country,
      shipping_carrier: carrier,
      shipping_service: service,
      easypost_shipment_id: shipmentId ?? '',
      easypost_rate_id: rateId,
      status: 'awaiting_payment',
    })
    .select('id')
    .single()

  if (orderError || !order) return { error: orderError?.message ?? 'Could not create order' }

  const stripe = getStripe()
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/partner/packages/success?order=${order.id}`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/partner/packages?cancelled=1`,
    customer_email: user.email,
    metadata: {
      order_id: order.id,
      order_number: orderNumber,
      type: 'package_order',
    },
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: { name: pkg.name, description: pkg.sku },
          unit_amount: subtotal,
        },
        quantity: 1,
      },
      {
        price_data: {
          currency: 'usd',
          product_data: { name: `Shipping — ${carrier} ${service}` },
          unit_amount: shippingCents,
        },
        quantity: 1,
      },
    ],
  })

  await supabase
    .from('package_orders')
    .update({ stripe_checkout_session_id: session.id })
    .eq('id', order.id)

  if (!session.url) return { error: 'Could not create checkout session' }
  redirect(session.url)
}

export async function adminFulfillOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const orderId = String(formData.get('orderId') ?? '')
  const tracking = String(formData.get('tracking') ?? '')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }

  const admin = createAdminClient()
  const { data: order } = await admin
    .from('package_orders')
    .select(`*, distributors(${DISTRIBUTOR_PROFILE}(email, full_name))`)
    .eq('id', orderId)
    .single()

  if (!order || order.status !== 'paid') return { error: 'Order not eligible for fulfillment' }

  await admin
    .from('package_orders')
    .update({
      status: 'fulfilled',
      fulfilled_at: new Date().toISOString(),
      tracking_code: tracking,
    })
    .eq('id', orderId)

  const profiles = (order.distributors as { profiles: { email: string; full_name: string } }).profiles
  await sendEmail({
    to: profiles.email,
    subject: `Your inventory order ${order.order_number} has shipped`,
    html: emailShell(
      'Order shipped',
      `<p>Dear ${profiles.full_name},</p><p>Your inventory package order <strong>${order.order_number}</strong> has shipped.${tracking ? ` Tracking: ${tracking}` : ''}</p>`,
    ),
  })

  revalidatePath('/admin/orders')
  return { success: true }
}
