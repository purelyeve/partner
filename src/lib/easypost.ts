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

export async function getPackageShippingRates(params: {
  to: EasyPostAddress
  parcel: ParcelSpec
}): Promise<ShippingRate[]> {
  const apiKey = process.env.EASYPOST_API_KEY
  if (!apiKey) {
    return filterAllowedRates(scaleRatesForBoxes(fallbackRates(params.parcel.weightOz), params.parcel.boxCount))
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

  if (!shipmentRes.ok) {
    console.error('[easypost] shipment error', await shipmentRes.text())
    return filterAllowedRates(scaleRatesForBoxes(fallbackRates(params.parcel.weightOz), params.parcel.boxCount))
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

  const rates = shipment.rates
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
    return filterAllowedRates(scaleRatesForBoxes(fallbackRates(params.parcel.weightOz), params.parcel.boxCount))
  }

  return scaleRatesForBoxes(allowed, params.parcel.boxCount)
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

function ratesMatch(
  rateCarrier: string,
  rateService: string,
  wantCarrier: string,
  wantService: string,
): boolean {
  const c = rateCarrier.trim().toLowerCase()
  const s = normalizeServiceName(rateService).toLowerCase()
  const wc = wantCarrier.trim().toLowerCase()
  const ws = normalizeServiceName(wantService).toLowerCase()
  if (c !== wc && !c.includes(wc) && !wc.includes(c)) return false
  if (s === ws) return true
  // Loose match: both ground or both priority family
  const ratePri = /priority|3.?day|saver/i.test(s)
  const wantPri = /priority|3.?day|saver/i.test(ws)
  const rateGround = /ground/i.test(s)
  const wantGround = /ground/i.test(ws)
  if (ratePri && wantPri) return true
  if (rateGround && wantGround) return true
  return s.includes(ws) || ws.includes(s)
}

export type PurchasedLabel = {
  trackingCode: string
  labelUrl: string
  shipmentId: string
  rateId: string
  carrier: string
  service: string
}

/**
 * Create a shipment and buy a label for one box on the company EasyPost account.
 */
export async function buyCompanyLabel(params: {
  to: EasyPostAddress
  parcel: Omit<ParcelSpec, 'boxCount'>
  carrier: string
  service: string
}): Promise<{ ok: true; label: PurchasedLabel } | { ok: false; error: string }> {
  const apiKey = process.env.EASYPOST_API_KEY
  if (!apiKey) {
    return { ok: false, error: 'EasyPost is not configured. Add EASYPOST_API_KEY to continue.' }
  }
  if (!isCompanyShipFromConfigured()) {
    return { ok: false, error: 'Company ship-from address is not configured.' }
  }

  const auth = Buffer.from(`${apiKey}:`).toString('base64')
  const headers = {
    Authorization: `Basic ${auth}`,
    'Content-Type': 'application/json',
  }

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
    return { ok: false, error: 'Could not create EasyPost shipment for this label.' }
  }

  const shipment = (await shipmentRes.json()) as {
    id: string
    rates: Array<{ id: string; carrier: string; service: string; rate: string }>
  }

  const candidates = (shipment.rates ?? []).filter((r) =>
    isAllowedShippingRate(r.carrier, r.service),
  )
  let rate =
    candidates.find((r) => ratesMatch(r.carrier, r.service, params.carrier, params.service)) ??
    null

  if (!rate && candidates.length > 0) {
    // Prefer cheapest allowed if exact service is unavailable
    rate = [...candidates].sort((a, b) => parseFloat(a.rate) - parseFloat(b.rate))[0] ?? null
  }

  if (!rate) {
    return {
      ok: false,
      error: `No matching ${params.carrier} ${normalizeServiceName(params.service)} rate from EasyPost.`,
    }
  }

  const buyRes = await fetch(`${EASYPOST_API}/shipments/${shipment.id}/buy`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ rate: { id: rate.id } }),
  })

  if (!buyRes.ok) {
    const detail = await buyRes.text()
    console.error('[easypost] buy failed', detail)
    return { ok: false, error: 'EasyPost could not purchase this shipping label. Check carrier account funding.' }
  }

  const bought = (await buyRes.json()) as {
    id: string
    tracking_code?: string
    postage_label?: { label_url?: string; label_pdf_url?: string }
    selected_rate?: { id: string; carrier: string; service: string }
  }

  const labelUrl =
    bought.postage_label?.label_pdf_url ||
    bought.postage_label?.label_url ||
    ''

  if (!labelUrl) {
    return { ok: false, error: 'Label purchased but EasyPost did not return a label file URL.' }
  }

  return {
    ok: true,
    label: {
      trackingCode: bought.tracking_code || '',
      labelUrl,
      shipmentId: bought.id || shipment.id,
      rateId: bought.selected_rate?.id || rate.id,
      carrier: bought.selected_rate?.carrier || rate.carrier,
      service: bought.selected_rate?.service || rate.service,
    },
  }
}

/** Buy one label per box (Growth = 2). */
export async function buyCompanyLabelsForOrder(params: {
  to: EasyPostAddress
  parcel: ParcelSpec
  carrier: string
  service: string
}): Promise<{ ok: true; labels: PurchasedLabel[] } | { ok: false; error: string }> {
  const boxCount = Math.max(1, params.parcel.boxCount)
  const labels: PurchasedLabel[] = []

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
    labels.push(result.label)
  }

  return { ok: true, labels }
}
