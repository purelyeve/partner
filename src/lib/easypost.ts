import type { ShippingRate } from './types'

const EASYPOST_API = 'https://api.easypost.com/v2'

interface EasyPostAddress {
  name?: string
  company?: string
  phone?: string
  street1: string
  street2?: string
  city: string
  state: string
  zip: string
  country?: string
}

export interface ParcelSpec {
  weightOz: number
  lengthIn: number
  widthIn: number
  heightIn: number
  /** Growth package ships as two identical boxes; rates are doubled. */
  boxCount: number
}

/** Allowed carrier/service pairs for company → Partner inventory shipping. */
const ALLOWED_SHIPPING: Array<{ carrier: RegExp; service: RegExp }> = [
  { carrier: /^usps$/i, service: /ground\s*advantage|^ground$/i },
  { carrier: /^usps$/i, service: /priority(?!\s*mail\s*express)/i },
  { carrier: /^ups$/i, service: /^ground$|ups\s*ground/i },
  // Client "UPS Priority" maps to mid-speed UPS (not Next Day / Express)
  { carrier: /^ups$/i, service: /priority|3.?day|saver/i },
]

const BLOCKED_EXPRESS =
  /overnight|express|next.?day|1.?day|second.?day\s*air|2nd\s*day\s*air|surepost|mail\s*innovations|first.?class/i

export function isAllowedShippingRate(carrier: string, service: string): boolean {
  if (BLOCKED_EXPRESS.test(service) || /express/i.test(carrier)) return false
  // Priority Mail Express is overnight — block even if it matched priority
  if (/priority\s*mail\s*express|express\s*mail/i.test(service)) return false
  return ALLOWED_SHIPPING.some(
    (rule) => rule.carrier.test(carrier.trim()) && rule.service.test(service.trim()),
  )
}

export function filterAllowedRates(rates: ShippingRate[]): ShippingRate[] {
  const filtered = rates.filter((r) => isAllowedShippingRate(r.carrier, r.service))
  // Prefer one rate per carrier+family (ground vs priority) — keep cheapest of each label
  const byKey = new Map<string, ShippingRate>()
  for (const rate of filtered) {
    const family = /priority/i.test(rate.service) ? 'priority' : 'ground'
    const key = `${rate.carrier.toUpperCase()}:${family}`
    const existing = byKey.get(key)
    if (!existing || rate.rateCents < existing.rateCents) byKey.set(key, rate)
  }
  return Array.from(byKey.values()).sort((a, b) => a.rateCents - b.rateCents)
}

/**
 * Company ship-from for inventory packages (Purely Eve → partner).
 * Set via env so the warehouse address can be updated without a code deploy.
 */
export function getCompanyShipFrom(): EasyPostAddress {
  return {
    name: process.env.EASYPOST_SHIP_FROM_NAME || 'Purely Eve LLC',
    company: process.env.EASYPOST_SHIP_FROM_COMPANY || 'Purely Eve LLC',
    phone: process.env.EASYPOST_SHIP_FROM_PHONE || '',
    street1: process.env.EASYPOST_SHIP_FROM_STREET1 || 'TBD Warehouse Address',
    street2: process.env.EASYPOST_SHIP_FROM_STREET2 || '',
    city: process.env.EASYPOST_SHIP_FROM_CITY || 'Denver',
    state: process.env.EASYPOST_SHIP_FROM_STATE || 'CO',
    zip: process.env.EASYPOST_SHIP_FROM_ZIP || '80202',
    country: process.env.EASYPOST_SHIP_FROM_COUNTRY || 'US',
  }
}

export function isCompanyShipFromConfigured(): boolean {
  const from = getCompanyShipFrom()
  return Boolean(
    from.street1 &&
      !from.street1.toLowerCase().includes('tbd') &&
      from.city &&
      from.state &&
      from.zip,
  )
}

function shipFromPayload(): Record<string, string> {
  const from = getCompanyShipFrom()
  return {
    name: from.name || 'Purely Eve LLC',
    company: from.company || from.name || 'Purely Eve LLC',
    phone: from.phone || '',
    street1: from.street1,
    street2: from.street2 || '',
    city: from.city,
    state: from.state,
    zip: from.zip,
    country: from.country || 'US',
  }
}

function parcelPayload(parcel: ParcelSpec) {
  return {
    weight: parcel.weightOz,
    length: parcel.lengthIn,
    width: parcel.widthIn,
    height: parcel.heightIn,
  }
}

function scaleRatesForBoxes(rates: ShippingRate[], boxCount: number): ShippingRate[] {
  if (boxCount <= 1) return rates
  return rates.map((r) => ({
    ...r,
    rateCents: r.rateCents * boxCount,
    service: `${r.service} (${boxCount} boxes)`,
  }))
}

export type ShippingRatesResult =
  | { ok: true; rates: ShippingRate[]; shipmentId: string }
  | { ok: false; error: string; rates: ShippingRate[] }

/**
 * Live EasyPost rates for package checkout.
 * When an API key is set, do NOT fall back to fake rates — those cannot be purchased later.
 */
export async function getPackageShippingRates(params: {
  to: EasyPostAddress
  parcel: ParcelSpec
  from?: EasyPostAddress
  /** When set (Partner customer rates), bill that EasyPost account instead of company. */
  apiKey?: string
}): Promise<ShippingRatesResult> {
  const apiKey = params.apiKey || process.env.EASYPOST_API_KEY
  if (!apiKey) {
    return {
      ok: true,
      rates: filterAllowedRates(
        scaleRatesForBoxes(fallbackRates(params.parcel.weightOz), params.parcel.boxCount),
      ),
      shipmentId: '',
    }
  }

  const fromAddress = params.from
    ? {
        name: params.from.name || '',
        company: params.from.company || params.from.name || '',
        phone: params.from.phone || '',
        street1: params.from.street1,
        street2: params.from.street2 || '',
        city: params.from.city,
        state: params.from.state,
        zip: params.from.zip,
        country: params.from.country || 'US',
      }
    : shipFromPayload()

  if (!params.from && !isCompanyShipFromConfigured()) {
    return {
      ok: false,
      rates: [],
      error:
        'Company ship-from address is not configured. Shipping rates cannot be quoted until ship-from is set.',
    }
  }

  if (params.from && (!fromAddress.street1 || !fromAddress.city || !fromAddress.state || !fromAddress.zip)) {
    return {
      ok: false,
      rates: [],
      error: 'Partner ship-from address is incomplete. Update your fulfillment address in Profile.',
    }
  }

  const auth = Buffer.from(`${apiKey}:`).toString('base64')

  const shipmentRes = await fetch(`${EASYPOST_API}/shipments`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      shipment: {
        from_address: fromAddress,
        to_address: {
          name: params.to.name,
          street1: params.to.street1,
          street2: params.to.street2 ?? '',
          city: params.to.city,
          state: params.to.state,
          zip: params.to.zip,
          country: params.to.country ?? 'US',
        },
        parcel: parcelPayload(params.parcel),
      },
    }),
  })

  if (!shipmentRes.ok) {
    const detail = await shipmentRes.text()
    console.error('[easypost] shipment error', detail)
    return {
      ok: false,
      rates: [],
      error:
        'EasyPost could not quote shipping for this address. Confirm USPS/UPS are connected in EasyPost test mode and the ship-to address is complete.',
    }
  }

  const shipment = (await shipmentRes.json()) as {
    id: string
    rates: Array<{
      id: string
      carrier: string
      service: string
      rate: string
      delivery_days: number | null
    }>
  }

  const rates = (shipment.rates ?? [])
    .map((r) => ({
      id: r.id,
      carrier: r.carrier,
      service: r.service,
      rateCents: Math.round(parseFloat(r.rate) * 100),
      deliveryDays: r.delivery_days,
    }))
    .filter((r) => r.rateCents > 0)

  const allowed = filterAllowedRates(rates)
  if (allowed.length === 0) {
    return {
      ok: false,
      rates: [],
      error: noRatesError(rates.length, 'USPS', 'Ground Advantage'),
    }
  }

  return {
    ok: true,
    rates: scaleRatesForBoxes(allowed, params.parcel.boxCount),
    shipmentId: shipment.id,
  }
}

/** Flat estimates when EasyPost is not configured or returns no allowed rates. */
function fallbackRates(weightOz: number): ShippingRate[] {
  const base = weightOz <= 96 ? 1500 : 2200
  return [
    { id: 'fallback-usps-ground', carrier: 'USPS', service: 'Ground Advantage', rateCents: base, deliveryDays: 5 },
    { id: 'fallback-usps-priority', carrier: 'USPS', service: 'Priority', rateCents: base + 800, deliveryDays: 3 },
    { id: 'fallback-ups-ground', carrier: 'UPS', service: 'Ground', rateCents: base + 400, deliveryDays: 4 },
    { id: 'fallback-ups-priority', carrier: 'UPS', service: '3 Day Select', rateCents: base + 1200, deliveryDays: 3 },
  ]
}

export async function createEasyPostShipmentId(params: {
  to: EasyPostAddress
  parcel: ParcelSpec
}): Promise<string | null> {
  const apiKey = process.env.EASYPOST_API_KEY
  if (!apiKey) return null

  const auth = Buffer.from(`${apiKey}:`).toString('base64')
  const shipmentRes = await fetch(`${EASYPOST_API}/shipments`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      shipment: {
        from_address: shipFromPayload(),
        to_address: {
          name: params.to.name,
          street1: params.to.street1,
          street2: params.to.street2 ?? '',
          city: params.to.city,
          state: params.to.state,
          zip: params.to.zip,
          country: params.to.country ?? 'US',
        },
        parcel: parcelPayload(params.parcel),
      },
    }),
  })

  if (!shipmentRes.ok) return null
  const shipment = (await shipmentRes.json()) as { id: string }
  return shipment.id
}

export function parcelFromPackage(pkg: {
  weight_oz: number
  length_in?: number | null
  width_in?: number | null
  height_in?: number | null
  box_count?: number | null
}): ParcelSpec {
  return {
    weightOz: pkg.weight_oz,
    lengthIn: Number(pkg.length_in ?? 14),
    widthIn: Number(pkg.width_in ?? 14),
    heightIn: Number(pkg.height_in ?? 4),
    boxCount: Math.max(1, Number(pkg.box_count ?? 1)),
  }
}

function normalizeServiceName(service: string): string {
  return service.replace(/\s*\(\d+\s*boxes?\)\s*$/i, '').trim()
}

function rateFamily(service: string): 'ground' | 'priority' | 'other' {
  const s = normalizeServiceName(service).toLowerCase()
  if (/priority|3.?day|saver/i.test(s)) return 'priority'
  if (/ground/i.test(s)) return 'ground'
  return 'other'
}

function carrierMatches(a: string, b: string): boolean {
  const x = a.trim().toLowerCase()
  const y = b.trim().toLowerCase()
  return x === y || x.includes(y) || y.includes(x)
}

function ratesMatch(
  rateCarrier: string,
  rateService: string,
  wantCarrier: string,
  wantService: string,
): boolean {
  if (!carrierMatches(rateCarrier, wantCarrier)) return false
  const s = normalizeServiceName(rateService).toLowerCase()
  const ws = normalizeServiceName(wantService).toLowerCase()
  if (s === ws) return true
  const ratePri = /priority|3.?day|saver/i.test(s)
  const wantPri = /priority|3.?day|saver/i.test(ws)
  const rateGround = /ground/i.test(s)
  const wantGround = /ground/i.test(ws)
  if (ratePri && wantPri) return true
  if (rateGround && wantGround) return true
  return s.includes(ws) || ws.includes(s)
}

/** Pick the best allowed rate: exact match → same carrier + family → same carrier → any allowed. */
function pickBestRate(
  rates: Array<{ id: string; carrier: string; service: string; rate: string }>,
  wantCarrier: string,
  wantService: string,
): { id: string; carrier: string; service: string; rate: string } | null {
  const allowed = rates.filter((r) => isAllowedShippingRate(r.carrier, r.service))
  if (allowed.length === 0) return null

  const exact = allowed.find((r) => ratesMatch(r.carrier, r.service, wantCarrier, wantService))
  if (exact) return exact

  const family = rateFamily(wantService)
  const sameCarrierFamily = allowed.filter(
    (r) => carrierMatches(r.carrier, wantCarrier) && rateFamily(r.service) === family,
  )
  if (sameCarrierFamily.length > 0) {
    return [...sameCarrierFamily].sort((a, b) => parseFloat(a.rate) - parseFloat(b.rate))[0]
  }

  const sameCarrier = allowed.filter((r) => carrierMatches(r.carrier, wantCarrier))
  if (sameCarrier.length > 0) {
    return [...sameCarrier].sort((a, b) => parseFloat(a.rate) - parseFloat(b.rate))[0]
  }

  const groundRates = allowed.filter((r) => rateFamily(r.service) === 'ground')
  if (groundRates.length > 0) {
    return [...groundRates].sort((a, b) => parseFloat(a.rate) - parseFloat(b.rate))[0]
  }

  return [...allowed].sort((a, b) => parseFloat(a.rate) - parseFloat(b.rate))[0]
}

function easypostAuthHeaders(apiKey: string) {
  return {
    Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
    'Content-Type': 'application/json',
  }
}

function parseEasyPostError(body: string): string | null {
  try {
    const json = JSON.parse(body) as { error?: { message?: string } }
    return json.error?.message ?? null
  } catch {
    return null
  }
}

function noRatesError(
  totalRates: number,
  wantCarrier: string,
  wantService: string,
): string {
  if (totalRates === 0) {
    return (
      'EasyPost returned no shipping rates for this address. In your EasyPost account, connect a USPS ' +
      'and/or UPS carrier account, add a payment method for postage, and confirm your company ship-from ' +
      'address is complete in the portal settings.'
    )
  }
  return (
    `EasyPost returned ${totalRates} rate(s), but none matched the allowed services (USPS/UPS Ground and ` +
    `Priority). The Partner selected ${wantCarrier} ${normalizeServiceName(wantService)}. Connect the ` +
    'correct carriers in EasyPost or ask the Partner to re-order with an available shipping option.'
  )
}

function labelFromBoughtShipment(bought: {
  id: string
  tracking_code?: string
  postage_label?: { label_url?: string; label_pdf_url?: string }
  selected_rate?: { id: string; carrier: string; service: string }
}, fallbackShipmentId: string, fallbackRate: { id: string; carrier: string; service: string }): PurchasedLabel | null {
  const labelUrl =
    bought.postage_label?.label_pdf_url ||
    bought.postage_label?.label_url ||
    ''
  if (!labelUrl) return null
  return {
    trackingCode: bought.tracking_code || '',
    labelUrl,
    shipmentId: bought.id || fallbackShipmentId,
    rateId: bought.selected_rate?.id || fallbackRate.id,
    carrier: bought.selected_rate?.carrier || fallbackRate.carrier,
    service: bought.selected_rate?.service || fallbackRate.service,
  }
}

async function buyShipmentRate(
  apiKey: string,
  shipmentId: string,
  rate: { id: string; carrier: string; service: string },
): Promise<{ ok: true; label: PurchasedLabel } | { ok: false; error: string; rateExpired?: boolean }> {
  const headers = easypostAuthHeaders(apiKey)
  const buyRes = await fetch(`${EASYPOST_API}/shipments/${shipmentId}/buy`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ rate: { id: rate.id } }),
  })

  if (!buyRes.ok) {
    const detail = await buyRes.text()
    console.error('[easypost] buy failed', shipmentId, rate.id, detail)
    const msg = parseEasyPostError(detail) ?? ''
    const rateExpired =
      /rate.*expir|no longer valid|not found|invalid rate/i.test(msg) ||
      /rate.*expir|no longer valid|not found|invalid rate/i.test(detail)
    if (/payment|billing|credit|fund|balance|charge/i.test(msg + detail)) {
      return {
        ok: false,
        error:
          'EasyPost could not charge postage. Add a payment method to your EasyPost account and ensure it has funds.',
      }
    }
    if (rateExpired) {
      return { ok: false, error: 'Checkout shipping rate expired.', rateExpired: true }
    }
    return {
      ok: false,
      error:
        msg ||
        'EasyPost could not purchase this label. Check your EasyPost carrier accounts and payment method.',
    }
  }

  const bought = (await buyRes.json()) as {
    id: string
    tracking_code?: string
    postage_label?: { label_url?: string; label_pdf_url?: string }
    selected_rate?: { id: string; carrier: string; service: string }
  }

  const label = labelFromBoughtShipment(bought, shipmentId, rate)
  if (!label) {
    return { ok: false, error: 'Label purchased but EasyPost did not return a printable label file.' }
  }
  return { ok: true, label }
}

/** Try to buy the exact rate saved at Partner checkout (same shipment + rate id). */
async function tryBuyCheckoutRate(params: {
  apiKey: string
  shipmentId: string
  rateId: string
}): Promise<{ ok: true; label: PurchasedLabel } | { ok: false; rateExpired?: boolean; error?: string }> {
  const headers = easypostAuthHeaders(params.apiKey)

  const shipRes = await fetch(`${EASYPOST_API}/shipments/${params.shipmentId}`, { headers })
  if (!shipRes.ok) {
    return { ok: false, rateExpired: true }
  }

  const shipment = (await shipRes.json()) as {
    id: string
    rates: Array<{ id: string; carrier: string; service: string; rate: string }>
  }

  const rate = (shipment.rates ?? []).find((r) => r.id === params.rateId)
  if (!rate) {
    return { ok: false, rateExpired: true }
  }

  const bought = await buyShipmentRate(params.apiKey, params.shipmentId, rate)
  if (bought.ok) return bought
  if (bought.rateExpired) return { ok: false, rateExpired: true }
  return { ok: false, error: bought.error }
}

export type PurchasedLabel = {
  trackingCode: string
  labelUrl: string
  shipmentId: string
  rateId: string
  carrier: string
  service: string
  /** True when a different service was used than requested (fallback). */
  usedFallback?: boolean
}

/**
 * Create a shipment, pick the best allowed rate, and buy a label on the company EasyPost account.
 */
export async function buyCompanyLabel(params: {
  to: EasyPostAddress
  parcel: Omit<ParcelSpec, 'boxCount'>
  carrier: string
  service: string
  existingShipmentId?: string
  existingRateId?: string
}): Promise<{ ok: true; label: PurchasedLabel } | { ok: false; error: string }> {
  const apiKey = process.env.EASYPOST_API_KEY
  if (!apiKey) {
    return { ok: false, error: 'EasyPost is not configured. Add EASYPOST_API_KEY to continue.' }
  }
  if (!isCompanyShipFromConfigured()) {
    return {
      ok: false,
      error:
        'Company ship-from address is not configured. Set EASYPOST_SHIP_FROM_* in the portal environment.',
    }
  }

  if (params.existingShipmentId && params.existingRateId) {
    const checkout = await tryBuyCheckoutRate({
      apiKey,
      shipmentId: params.existingShipmentId,
      rateId: params.existingRateId,
    })
    if (checkout.ok) {
      return { ok: true, label: checkout.label }
    }
    if (checkout.error && !checkout.rateExpired) {
      return { ok: false, error: checkout.error }
    }
    // Rate expired or shipment stale — fall through to fresh quote below.
  }

  const headers = easypostAuthHeaders(apiKey)

  const shipmentRes = await fetch(`${EASYPOST_API}/shipments`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      shipment: {
        from_address: shipFromPayload(),
        to_address: {
          name: params.to.name,
          street1: params.to.street1,
          street2: params.to.street2 ?? '',
          city: params.to.city,
          state: params.to.state,
          zip: params.to.zip,
          country: params.to.country ?? 'US',
        },
        parcel: {
          weight: params.parcel.weightOz,
          length: params.parcel.lengthIn,
          width: params.parcel.widthIn,
          height: params.parcel.heightIn,
        },
      },
    }),
  })

  if (!shipmentRes.ok) {
    const detail = await shipmentRes.text()
    console.error('[easypost] create for buy failed', detail)
    const msg = parseEasyPostError(detail)
    return {
      ok: false,
      error: msg
        ? `Could not create EasyPost shipment: ${msg}`
        : 'Could not create EasyPost shipment. Check ship-from and ship-to addresses.',
    }
  }

  const shipment = (await shipmentRes.json()) as {
    id: string
    rates: Array<{ id: string; carrier: string; service: string; rate: string }>
  }

  const allRates = shipment.rates ?? []
  const rate = pickBestRate(allRates, params.carrier, params.service)

  if (!rate) {
    return {
      ok: false,
      error: noRatesError(allRates.length, params.carrier, params.service),
    }
  }

  const usedFallback = !ratesMatch(rate.carrier, rate.service, params.carrier, params.service)
  const bought = await buyShipmentRate(apiKey, shipment.id, rate)
  if (!bought.ok) return bought

  return {
    ok: true,
    label: {
      ...bought.label,
      usedFallback,
    },
  }
}

/** Buy one label per box (Growth = 2). Reuses checkout rate on box 1 when available. */
export async function buyCompanyLabelsForOrder(params: {
  to: EasyPostAddress
  parcel: ParcelSpec
  carrier: string
  service: string
  easypostShipmentId?: string
  easypostRateId?: string
}): Promise<{ ok: true; labels: PurchasedLabel[]; note?: string } | { ok: false; error: string }> {
  const boxCount = Math.max(1, params.parcel.boxCount)
  const labels: PurchasedLabel[] = []
  const notes: string[] = []

  for (let i = 0; i < boxCount; i++) {
    const result = await buyCompanyLabel({
      to: params.to,
      parcel: {
        weightOz: params.parcel.weightOz,
        lengthIn: params.parcel.lengthIn,
        widthIn: params.parcel.widthIn,
        heightIn: params.parcel.heightIn,
      },
      carrier: params.carrier,
      service: params.service,
      existingShipmentId: i === 0 ? params.easypostShipmentId : undefined,
      existingRateId: i === 0 ? params.easypostRateId : undefined,
    })
    if (!result.ok) {
      return {
        ok: false,
        error:
          boxCount > 1
            ? `Box ${i + 1} of ${boxCount}: ${result.error}`
            : result.error,
      }
    }
    if (result.label.usedFallback) {
      notes.push(
        `Box ${i + 1}: purchased ${result.label.carrier} ${result.label.service} (closest available to ${params.carrier} ${normalizeServiceName(params.service)}).`,
      )
    }
    labels.push(result.label)
  }

  return {
    ok: true,
    labels,
    note: notes.length ? notes.join(' ') : undefined,
  }
}

/**
 * Buy a customer shipping label on the Partner's EasyPost account (Partner pays postage).
 * Ship-from is the Partner fulfillment address.
 */
export async function buyPartnerLabel(params: {
  apiKey: string
  from: EasyPostAddress
  to: EasyPostAddress
  parcel: Omit<ParcelSpec, 'boxCount'>
  carrier: string
  service: string
  existingShipmentId?: string
  existingRateId?: string
}): Promise<{ ok: true; label: PurchasedLabel } | { ok: false; error: string }> {
  const apiKey = params.apiKey.trim()
  if (!apiKey) {
    return {
      ok: false,
      error:
        'Add your EasyPost API key in Payments / Profile so customer labels bill your EasyPost account.',
    }
  }

  const fromPayload = {
    name: params.from.name || '',
    company: params.from.company || params.from.name || '',
    phone: params.from.phone || '',
    street1: params.from.street1,
    street2: params.from.street2 || '',
    city: params.from.city,
    state: params.from.state,
    zip: params.from.zip,
    country: params.from.country || 'US',
  }

  if (!fromPayload.street1 || !fromPayload.city || !fromPayload.state || !fromPayload.zip) {
    return {
      ok: false,
      error: 'Partner ship-from address is incomplete. Update your fulfillment address in Profile.',
    }
  }

  if (params.existingShipmentId && params.existingRateId) {
    const checkout = await tryBuyCheckoutRate({
      apiKey,
      shipmentId: params.existingShipmentId,
      rateId: params.existingRateId,
    })
    if (checkout.ok) {
      return { ok: true, label: checkout.label }
    }
    if (checkout.error && !checkout.rateExpired) {
      return { ok: false, error: checkout.error }
    }
  }

  const headers = easypostAuthHeaders(apiKey)
  const shipmentRes = await fetch(`${EASYPOST_API}/shipments`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      shipment: {
        from_address: fromPayload,
        to_address: {
          name: params.to.name,
          street1: params.to.street1,
          street2: params.to.street2 ?? '',
          city: params.to.city,
          state: params.to.state,
          zip: params.to.zip,
          country: params.to.country ?? 'US',
        },
        parcel: parcelPayload({
          weightOz: params.parcel.weightOz,
          lengthIn: params.parcel.lengthIn,
          widthIn: params.parcel.widthIn,
          heightIn: params.parcel.heightIn,
          boxCount: 1,
        }),
      },
    }),
  })

  if (!shipmentRes.ok) {
    const detail = await shipmentRes.text()
    console.error('[easypost] partner shipment error', detail)
    return {
      ok: false,
      error:
        parseEasyPostError(detail) ||
        'EasyPost could not create a shipment. Confirm your EasyPost API key, carriers, and ship-from address.',
    }
  }

  const shipment = (await shipmentRes.json()) as {
    id: string
    rates: Array<{ id: string; carrier: string; service: string; rate: string }>
  }

  const allowed = filterAllowedRates(
    (shipment.rates ?? []).map((r) => ({
      id: r.id,
      carrier: r.carrier,
      service: r.service,
      rateCents: Math.round(parseFloat(r.rate) * 100),
      deliveryDays: null,
    })),
  )

  if (!allowed.length) {
    return {
      ok: false,
      error: noRatesError(shipment.rates?.length ?? 0, params.carrier, params.service),
    }
  }

  const wantCarrier = params.carrier.trim()
  const wantService = normalizeServiceName(params.service)
  let rate =
    allowed.find(
      (r) =>
        ratesMatch(r.carrier, r.service, wantCarrier, wantService) ||
        (r.carrier.toLowerCase() === wantCarrier.toLowerCase() &&
          /priority/i.test(wantService) === /priority/i.test(r.service)),
    ) || allowed[0]

  // Map filtered rate ids back to EasyPost rate objects
  const epRate = (shipment.rates ?? []).find((r) => r.id === rate.id)
  if (!epRate) {
    return { ok: false, error: 'Could not match an EasyPost rate for this shipment.' }
  }

  const usedFallback = !ratesMatch(epRate.carrier, epRate.service, params.carrier, params.service)
  const bought = await buyShipmentRate(apiKey, shipment.id, epRate)
  if (!bought.ok) return bought

  return {
    ok: true,
    label: {
      ...bought.label,
      usedFallback,
    },
  }
}

