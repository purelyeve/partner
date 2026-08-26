/**
 * Create a Paid (not fulfilled) inventory package order for admin label testing.
 *
 * Usage: node scripts/create-test-paid-order.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { randomBytes } from 'crypto'

function loadEnvLocal() {
  const path = resolve(process.cwd(), '.env.local')
  const text = readFileSync(path, 'utf8')
  const env = {}
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

function orderNumber() {
  const d = new Date()
  const y = String(d.getFullYear()).slice(2)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const suffix = randomBytes(3).toString('hex').toUpperCase()
  return `PE-${y}${m}${day}-${suffix}`
}

async function main() {
  const env = loadEnvLocal()
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error('Missing Supabase env in .env.local')
    process.exit(1)
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Prefer an approved partner; otherwise any distributor with an address.
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

  if (!dist) {
    console.error('No distributors found. Register a partner first.')
    process.exit(1)
  }

  const { data: pkg } = await admin
    .from('inventory_packages')
    .select('*')
    .eq('sku', 'PE-PKG-START')
    .eq('is_active', true)
    .maybeSingle()

  if (!pkg) {
    console.error('Starter package PE-PKG-START not found.')
    process.exit(1)
  }

  const shipName = dist.business_name?.trim() || 'Test Partner'
  const line1 = dist.fulfillment_same_as_mailing
    ? dist.mailing_line1
    : dist.fulfillment_line1 || dist.mailing_line1
  const line2 = dist.fulfillment_same_as_mailing
    ? dist.mailing_line2
    : dist.fulfillment_line2 || dist.mailing_line2
  const city = dist.fulfillment_same_as_mailing
    ? dist.mailing_city
    : dist.fulfillment_city || dist.mailing_city
  const state = dist.fulfillment_same_as_mailing
    ? dist.mailing_state
    : dist.fulfillment_state || dist.mailing_state
  const zip = dist.fulfillment_same_as_mailing
    ? dist.mailing_postal_code
    : dist.fulfillment_postal_code || dist.mailing_postal_code

  if (!line1 || !city || !state || !zip) {
    console.error('Distributor is missing a ship-to address. Update their profile first.')
    process.exit(1)
  }

  const shippingCents = 1500
  const subtotal = pkg.price_cents
  const total = subtotal + shippingCents
  const number = orderNumber()

  const { data: order, error } = await admin
    .from('package_orders')
    .insert({
      order_number: number,
      distributor_id: dist.id,
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
      ship_to_name: shipName,
      ship_to_line1: line1,
      ship_to_line2: line2 || '',
      ship_to_city: city,
      ship_to_state: state,
      ship_to_postal_code: zip,
      ship_to_country: 'US',
      shipping_carrier: 'USPS',
      shipping_service: 'Ground Advantage',
      status: 'paid',
      paid_at: new Date().toISOString(),
      tracking_code: '',
      label_url: '',
      label_urls: [],
    })
    .select('id, order_number, status')
    .single()

  if (error) throw error

  console.log('\nTest Paid order created (not fulfilled):')
  console.log(`  Order:  ${order.order_number}`)
  console.log(`  Status: ${order.status}`)
  console.log(`  Partner distributor id: ${dist.id}`)
  console.log('\nAdmin → Inventory orders → filter Status: Paid')
  console.log('You should see Buy & print label and Mark fulfilled.\n')
}

main().catch((err) => {
  console.error('\nFailed:', err.message ?? err)
  process.exit(1)
})
