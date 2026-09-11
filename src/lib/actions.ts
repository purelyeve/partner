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
import {
  appUrl,
  emailShell,
  notifyCompany,
  partnerApprovalReadyEmailHtml,
  sendEmail,
} from '@/lib/email'
import { formatCurrency, generateOrderNumber } from '@/lib/utils'
import {
  buyCompanyLabelsForOrder,
  createEasyPostShipmentId,
  getPackageShippingRates,
  parcelFromPackage,
} from '@/lib/easypost'
import { getStripe } from '@/lib/stripe'
import { fulfillmentAddress, hasCompleteShipToAddress } from '@/lib/auth'
import { partnerCanAccessPackage } from '@/lib/catalog-visibility'
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

  await notifyCompany({
    subject: `New Partner Portal registration — ${data.fullName}`,
    html: emailShell(
      'New Partner registration',
      `<p><strong>${data.fullName}</strong> (${data.email}) submitted a Partner Portal registration.</p>
       <p>Business: ${data.businessName || 'Personal'}</p>
       <p>Resale certificate #: ${data.certificateNumber}</p>
       <p><a href="${appUrl()}/admin/distributors/${distributor.id}">Review in admin</a></p>`,
    ),
  })

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

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Sign in failed. Please try again.' }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()

  // Do not call redirect() here — useActionState pending never clears when redirect throws.
  return {
    success: true,
    redirectTo: profile?.role === 'admin' ? '/admin' : '/partner',
  }
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
    redirectTo: `${appUrl()}/auth/callback?next=/reset-password`,
  })
  if (error) return { error: error.message }
  return { success: true, message: 'If that email is registered, a reset link has been sent.' }
}

export async function resetPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const password = String(formData.get('password') ?? '')
  if (password.length < 8) return { error: 'Password must be at least 8 characters' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return {
      error:
        'Your reset link expired or the session is missing. Request a new reset email and open the latest link.',
    }
  }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { error: error.message }

  await supabase.auth.signOut()
  return { success: true, redirectTo: '/login?reset=1' }
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

  if (decision === 'approved') {
    // Client verbiage: send the full “approved to order” email when admin Approves.
    await sendEmail({
      to: profile.email,
      subject: 'Congratulations — your Purely Eve Partner registration is approved',
      html: partnerApprovalReadyEmailHtml({
        fullName: profile.full_name,
        portalLoginUrl: `${appUrl()}/login`,
      }),
    })
  } else {
    const subject =
      decision === 'declined'
        ? 'Update on your Purely Eve Partner application'
        : 'Your Purely Eve Partner account status has changed'
    await sendEmail({
      to: profile.email,
      subject,
      html: emailShell(
        subject,
        `<p>Dear ${profile.full_name},</p><p>Your application status is now: <strong>${decision}</strong>.</p>${note ? `<p>Note: ${note}</p>` : ''}`,
      ),
    })
  }

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

  const distRow = doc.distributors as {
    id: string
    profiles: { email: string; full_name: string }
  }
  const profiles = distRow.profiles

  if (doc.kind === 'resale_certificate' && status === 'accepted') {
    const { data: fresh } = await admin
      .from('distributors')
      .select('application_status, resale_accepted_at')
      .eq('id', doc.distributor_id)
      .single()

    // Full approval letter is sent on Approve. On resale accept, only nudge if they can order now.
    if (fresh?.application_status === 'approved' && fresh.resale_accepted_at) {
      await sendEmail({
        to: profiles.email,
        subject: 'Your resale documentation is accepted — you can order inventory',
        html: emailShell(
          'Ready to order inventory',
          `<p>Dear ${profiles.full_name},</p>
           <p>Your resale documentation has been accepted. You can now place your opening inventory package order in the Partner Portal.</p>
           <p style="margin:24px 0;"><a href="${appUrl()}/partner/packages" style="background:#3a2108;color:#f5f0e8;padding:12px 20px;text-decoration:none;display:inline-block;">Order inventory packages</a></p>
           ${note ? `<p>Note: ${note}</p>` : ''}`,
        ),
      })
    } else {
      await sendEmail({
        to: profiles.email,
        subject: 'Your resale certificate has been accepted',
        html: emailShell(
          'Document review update',
          `<p>Dear ${profiles.full_name},</p><p>Your resale certificate was <strong>accepted</strong>.</p>${note ? `<p>Note: ${note}</p>` : ''}`,
        ),
      })
    }
  } else {
    await sendEmail({
      to: profiles.email,
      subject: `Your resale certificate has been ${status}`,
      html: emailShell(
        'Document review update',
        `<p>Dear ${profiles.full_name},</p><p>Your resale certificate was <strong>${status}</strong>.</p>${note ? `<p>Note: ${note}</p>` : ''}`,
      ),
    })
  }

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

  const allowed = await partnerCanAccessPackage(supabase, distributor.id, packageId)
  if (!allowed) return { error: 'This package is not available on your account.' }

  const addr = fulfillmentAddress(distributor)
  const result = await getPackageShippingRates({
    to: {
      name: addr.name,
      street1: addr.line1,
      street2: addr.line2,
      city: addr.city,
      state: addr.state,
      zip: addr.postal_code,
      country: addr.country,
    },
    parcel: parcelFromPackage(pkg),
  })

  if (!result.ok) return { error: result.error }

  return {
    rates: result.rates,
    shipmentId: result.shipmentId,
    package: pkg,
    address: addr,
  }
}

export async function createPackageCheckoutAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const packageId = String(formData.get('packageId') ?? '')
  const rateId = String(formData.get('rateId') ?? '')
  const carrier = String(formData.get('carrier') ?? '')
  const service = String(formData.get('service') ?? '')
  const shippingCents = Number(formData.get('shippingCents') ?? 0)
  const shipmentIdFromRates = String(formData.get('shipmentId') ?? '').trim()

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

  const allowed = await partnerCanAccessPackage(supabase, distributor.id, packageId)
  if (!allowed) return { error: 'This package is not available on your account.' }

  const addr = fulfillmentAddress(distributor)
  const subtotal = pkg.price_cents
  const total = subtotal + shippingCents
  const orderNumber = generateOrderNumber()

  // Prefer the shipment from the live rate quote. Fake fallback rate ids cannot be purchased.
  if (rateId.startsWith('fallback-')) {
    return {
      error:
        'Shipping rates are not available from EasyPost right now. Confirm USPS/UPS are connected in EasyPost test mode, then select shipping again.',
    }
  }

  let shipmentId = shipmentIdFromRates
  if (!shipmentId) {
    shipmentId =
      (await createEasyPostShipmentId({
        to: {
          name: addr.name,
          street1: addr.line1,
          street2: addr.line2,
          city: addr.city,
          state: addr.state,
          zip: addr.postal_code,
          country: addr.country,
        },
        parcel: parcelFromPackage(pkg),
      })) ?? ''
  }

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
      easypost_shipment_id: shipmentId,
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

export async function adminBuyLabelAndFulfillAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const orderId = String(formData.get('orderId') ?? '')

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }

  const admin = createAdminClient()
  const { data: order } = await admin
    .from('package_orders')
    .select(`*, distributors(${DISTRIBUTOR_PROFILE}(email, full_name)), inventory_packages(*)`)
    .eq('id', orderId)
    .single()

  if (!order || order.status !== 'paid') {
    return { error: 'Order not eligible for label purchase' }
  }

  const pkg = order.inventory_packages as {
    weight_oz: number
    length_in?: number | null
    width_in?: number | null
    height_in?: number | null
    box_count?: number | null
  } | null

  if (!pkg) return { error: 'Package details missing for this order' }

  const parcel = parcelFromPackage(pkg)
  const purchased = await buyCompanyLabelsForOrder({
    to: {
      name: order.ship_to_name,
      street1: order.ship_to_line1,
      street2: order.ship_to_line2,
      city: order.ship_to_city,
      state: order.ship_to_state,
      zip: order.ship_to_postal_code,
      country: order.ship_to_country || 'US',
    },
    parcel,
    carrier: order.shipping_carrier || 'USPS',
    service: order.shipping_service || 'Ground Advantage',
    easypostShipmentId: order.easypost_shipment_id || undefined,
    easypostRateId: order.easypost_rate_id || undefined,
  })

  if (!purchased.ok) return { error: purchased.error }

  const labelUrls = purchased.labels.map((l) => l.labelUrl)
  const trackingCodes = purchased.labels.map((l) => l.trackingCode).filter(Boolean)
  const storedPaths: string[] = []

  for (let i = 0; i < purchased.labels.length; i++) {
    const label = purchased.labels[i]
    try {
      const fileRes = await fetch(label.labelUrl)
      if (fileRes.ok) {
        const bytes = Buffer.from(await fileRes.arrayBuffer())
        const contentType = fileRes.headers.get('content-type') || 'application/pdf'
        const ext = contentType.includes('png') ? 'png' : contentType.includes('jpeg') ? 'jpg' : 'pdf'
        const path = `package-orders/${orderId}/label-${i + 1}.${ext}`
        const { error: uploadError } = await admin.storage
          .from('shipping-labels')
          .upload(path, bytes, { contentType, upsert: true })
        if (!uploadError) storedPaths.push(path)
      }
    } catch (err) {
      console.error('[label] storage upload failed', err)
    }
  }

  const primaryLabelUrl = labelUrls[0] || ''
  const tracking = trackingCodes.join(', ')

  await admin
    .from('package_orders')
    .update({
      tracking_code: tracking,
      label_url: primaryLabelUrl,
      label_urls: labelUrls,
      easypost_shipment_id: purchased.labels.map((l) => l.shipmentId).join(','),
      easypost_rate_id: purchased.labels.map((l) => l.rateId).join(','),
      shipping_carrier: purchased.labels[0]?.carrier || order.shipping_carrier,
      shipping_service:
        purchased.labels.length > 1
          ? `${purchased.labels[0]?.service || order.shipping_service} (${purchased.labels.length} boxes)`
          : purchased.labels[0]?.service || order.shipping_service,
    })
    .eq('id', orderId)

  await logAudit({
    actorId: user.id,
    action: 'package_order_label_purchased',
    entityType: 'package_order',
    entityId: orderId,
    detail: {
      tracking,
      labelUrls,
      storedPaths,
      boxes: purchased.labels.length,
    },
  })

  revalidatePath('/admin/orders')
  revalidatePath('/admin')
  const fallbackNote = purchased.note ? ` ${purchased.note}` : ''
  return {
    success: true,
    message: `Label purchased. Print it, then mark the order fulfilled.${fallbackNote}`,
  }
}

/** Signed URL so admin can reprint a stored or EasyPost label PDF. */
export async function getPackageLabelSignedUrlAction(orderId: string): Promise<{
  url?: string
  error?: string
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Not authorized' }

  const admin = createAdminClient()
  const { data: order } = await admin
    .from('package_orders')
    .select('label_url, label_urls')
    .eq('id', orderId)
    .single()

  if (!order) return { error: 'Order not found' }

  const urls = (order.label_urls as string[] | null)?.filter(Boolean) ?? []
  const url = urls[0] || order.label_url
  if (!url) return { error: 'No label on file for this order' }
  return { url }
}

export async function adminFulfillOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const orderId = String(formData.get('orderId') ?? '')
  const trackingInput = String(formData.get('tracking') ?? '').trim()

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

  const tracking = trackingInput || order.tracking_code || ''

  await admin
    .from('package_orders')
    .update({
      status: 'fulfilled',
      fulfilled_at: new Date().toISOString(),
      tracking_code: tracking,
    })
    .eq('id', orderId)

  await logAudit({
    actorId: user.id,
    action: 'package_order_fulfilled',
    entityType: 'package_order',
    entityId: orderId,
    detail: { tracking },
  })

  const profiles = (order.distributors as { profiles: { email: string; full_name: string } }).profiles
  await sendEmail({
    to: profiles.email,
    subject: `Your inventory order ${order.order_number} has shipped`,
    html: emailShell(
      'Order shipped',
      `<p>Dear ${profiles.full_name},</p>
       <p>Your inventory package order <strong>${order.order_number}</strong> has shipped.</p>
       ${tracking ? `<p>Tracking: <strong>${tracking}</strong></p>` : ''}
       <p><a href="${appUrl()}/login">Sign in to the Partner Portal</a> to view your order.</p>`,
    ),
  })

  revalidatePath('/admin/orders')
  revalidatePath('/admin')
  return { success: true, message: 'Order marked fulfilled.' }
}

/** Admin: cancel an unpaid inventory package order (no Stripe charge yet). */
export async function adminCancelPackageOrderAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const orderId = String(formData.get('orderId') ?? '')
  const reason = String(formData.get('reason') ?? '').trim()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Not authorized' }

  const { data: order } = await admin.from('package_orders').select('*').eq('id', orderId).single()
  if (!order) return { error: 'Order not found.' }
  if (!['draft', 'awaiting_payment'].includes(order.status)) {
    return { error: 'Only unpaid package orders can be cancelled this way. Use Refund for paid orders.' }
  }

  await admin
    .from('package_orders')
    .update({
      status: 'cancelled',
      cancel_reason: reason.slice(0, 500) || 'Cancelled by admin before payment',
    })
    .eq('id', orderId)

  await logAudit({
    actorId: user.id,
    action: 'package_order_cancelled',
    entityType: 'package_order',
    entityId: orderId,
    detail: { reason },
  })

  revalidatePath('/admin/orders')
  return { success: true, message: 'Package order cancelled.' }
}

/**
 * Admin: refund a paid (or fulfilled) inventory package order on the company Stripe account
 * and reverse the stock that was credited to the Partner.
 */
export async function adminRefundPackageOrderAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const orderId = String(formData.get('orderId') ?? '')
  const reason = String(formData.get('reason') ?? '').trim()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Not authorized' }

  const { data: order } = await admin
    .from('package_orders')
    .select(`*, distributors(${DISTRIBUTOR_PROFILE}(email, full_name))`)
    .eq('id', orderId)
    .single()

  if (!order) return { error: 'Order not found.' }
  if (!['paid', 'fulfilled'].includes(order.status)) {
    return { error: 'Only paid or fulfilled package orders can be refunded.' }
  }
  if (order.refunded_at) return { error: 'This package order was already refunded.' }

  const { reverseInventoryForRefundedPackageOrder } = await import('@/lib/inventory')

  if (order.stripe_payment_intent_id) {
    const stripe = getStripe()
    try {
      const refund = await stripe.refunds.create({
        payment_intent: order.stripe_payment_intent_id,
        reason: 'requested_by_customer',
        metadata: {
          package_order_id: order.id,
          order_number: order.order_number,
          cancel_reason: reason.slice(0, 200),
        },
      })

      await admin
        .from('package_orders')
        .update({
          status: 'cancelled',
          refunded_at: new Date().toISOString(),
          stripe_refund_id: refund.id,
          cancel_reason: reason.slice(0, 500) || 'Refunded by admin',
        })
        .eq('id', orderId)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Stripe refund failed'
      console.error('[package refund]', message)
      return { error: message }
    }
  } else {
    // Test orders created without Stripe still need stock reverse + cancel
    await admin
      .from('package_orders')
      .update({
        status: 'cancelled',
        refunded_at: new Date().toISOString(),
        cancel_reason: reason.slice(0, 500) || 'Cancelled/refunded by admin (no Stripe charge)',
      })
      .eq('id', orderId)
  }

  try {
    await reverseInventoryForRefundedPackageOrder(orderId)
  } catch (err) {
    console.error('[package refund] inventory reverse', err)
  }

  const profiles = (order.distributors as { profiles: { email: string; full_name: string } } | null)
    ?.profiles
  if (profiles?.email) {
    await sendEmail({
      to: profiles.email,
      subject: `Refund processed — order ${order.order_number}`,
      html: emailShell(
        'Inventory order refunded',
        `<p>Dear ${profiles.full_name},</p>
         <p>Your inventory package order <strong>${order.order_number}</strong> (${formatCurrency(order.total_cents)}) has been refunded.</p>
         <p>Stock from that package has been removed from your on-hand inventory.</p>
         <p>Funds typically return to the original payment method in a few business days.</p>`,
      ),
    })
  }

  await logAudit({
    actorId: user.id,
    action: 'package_order_refunded',
    entityType: 'package_order',
    entityId: orderId,
    detail: { reason, amount: order.total_cents },
  })

  revalidatePath('/admin/orders')
  revalidatePath('/admin')
  revalidatePath('/admin/reports')
  return {
    success: true,
    message: `Refunded ${formatCurrency(order.total_cents)} and reversed Partner stock.`,
  }
}

/** Admin: create a Paid (unfulfilled) Starter package order for label-flow testing. */
export async function adminCreateTestPaidOrderAction(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Not authorized' }

  let { data: dist } = await admin
    .from('distributors')
    .select('*')
    .eq('application_status', 'approved')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!dist) {
    const fallback = await admin
      .from('distributors')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    dist = fallback.data
  }

  if (!dist) return { error: 'No partners found. Register a partner first.' }

  const { data: pkg } = await admin
    .from('inventory_packages')
    .select('*')
    .eq('sku', 'PE-PKG-START')
    .eq('is_active', true)
    .maybeSingle()

  if (!pkg) return { error: 'Starter package not found.' }

  const addr = fulfillmentAddress(dist)
  if (!hasCompleteShipToAddress(dist)) {
    return { error: 'Selected partner needs a complete ship-to address in their profile.' }
  }

  const shippingCents = 1500
  const orderNumber = generateOrderNumber()
  const { data: order, error } = await admin
    .from('package_orders')
    .insert({
      order_number: orderNumber,
      distributor_id: dist.id,
      package_id: pkg.id,
      sku_snapshot: pkg.sku,
      name_snapshot: pkg.name,
      unit_count_snapshot: pkg.unit_count,
      unit_price_cents: pkg.price_cents,
      quantity: 1,
      subtotal_cents: pkg.price_cents,
      shipping_cents: shippingCents,
      tax_cents: 0,
      total_cents: pkg.price_cents + shippingCents,
      ship_to_name: addr.name,
      ship_to_line1: addr.line1,
      ship_to_line2: addr.line2,
      ship_to_city: addr.city,
      ship_to_state: addr.state,
      ship_to_postal_code: addr.postal_code,
      ship_to_country: addr.country,
      shipping_carrier: 'USPS',
      shipping_service: 'Ground Advantage',
      status: 'paid',
      paid_at: new Date().toISOString(),
      tracking_code: '',
      label_url: '',
      label_urls: [],
    })
    .select('order_number')
    .single()

  if (error || !order) return { error: error?.message ?? 'Could not create test order' }

  await logAudit({
    actorId: user.id,
    action: 'package_order_test_created',
    entityType: 'package_order',
    entityId: dist.id,
    detail: { order_number: order.order_number },
  })

  revalidatePath('/admin/orders')
  revalidatePath('/admin')
  return {
    success: true,
    message: `Test Paid order ${order.order_number} created. Filter Status: Paid to buy a label and mark fulfilled.`,
  }
}

/** Permanently delete a partner/applicant account and related data. */
export async function adminDeleteDistributorAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const distributorId = String(formData.get('distributorId') ?? '')
  const confirm = String(formData.get('confirm') ?? '')
  if (!distributorId) return { error: 'Missing distributor' }
  if (confirm !== 'DELETE') {
    return { error: 'Type DELETE to confirm permanent removal.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }

  const admin = createAdminClient()
  const { data: actor } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (actor?.role !== 'admin') return { error: 'Not authorized' }

  const { data: dist } = await admin
    .from('distributors')
    .select(`id, profile_id, ${DISTRIBUTOR_PROFILE}(email, full_name, role)`)
    .eq('id', distributorId)
    .single()

  if (!dist) return { error: 'Distributor not found' }

  const profile = dist.profiles as unknown as { email: string; full_name: string; role: string }
  if (!profile?.email) return { error: 'Partner profile not found' }
  if (profile.role === 'admin') {
    return { error: 'Cannot delete an admin account from here.' }
  }

  const { data: docs } = await admin
    .from('distributor_documents')
    .select('storage_path')
    .eq('distributor_id', distributorId)

  const paths = (docs ?? []).map((d) => d.storage_path).filter(Boolean)
  if (paths.length) {
    await admin.storage.from('distributor-documents').remove(paths)
  }

  // package_orders reference distributors with ON DELETE RESTRICT
  await admin.from('package_orders').delete().eq('distributor_id', distributorId)

  const { error: delAuthError } = await admin.auth.admin.deleteUser(dist.profile_id)
  if (delAuthError) {
    // Fallback if auth delete fails: remove distributor row after orders cleared
    await admin.from('distributors').delete().eq('id', distributorId)
    await admin.from('profiles').delete().eq('id', dist.profile_id)
  }

  await logAudit({
    actorId: user.id,
    action: 'distributor_deleted',
    entityType: 'distributor',
    entityId: distributorId,
    detail: { email: profile.email, full_name: profile.full_name },
  })

  revalidatePath('/admin/distributors')
  revalidatePath('/admin')
  revalidatePath('/admin/orders')
  redirect('/admin/distributors')
}
