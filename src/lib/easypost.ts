import type { ShippingRate } from './types'

const EASYPOST_API = 'https://api.easypost.com/v2'

interface EasyPostAddress {
  name?: string
  street1: string
  street2?: string
  city: string
  state: string
  zip: string
  country?: string
}

/** Company ship-from address — update when client provides warehouse address. */
const SHIP_FROM: EasyPostAddress = {
  name: 'Purely Eve LLC',
  street1: 'TBD Warehouse Address',
  city: 'Denver',
  state: 'CO',
  zip: '80202',
  country: 'US',
}

export async function getPackageShippingRates(params: {
  to: EasyPostAddress
  weightOz: number
}): Promise<ShippingRate[]> {
  const apiKey = process.env.EASYPOST_API_KEY
  if (!apiKey) {
    return fallbackRates(params.weightOz)
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
        from_address: SHIP_FROM,
        to_address: {
          name: params.to.name,
          street1: params.to.street1,
          street2: params.to.street2 ?? '',
          city: params.to.city,
          state: params.to.state,
          zip: params.to.zip,
          country: params.to.country ?? 'US',
        },
        parcel: { weight: params.weightOz },
      },
    }),
  })

  if (!shipmentRes.ok) {
    console.error('[easypost] shipment error', await shipmentRes.text())
    return fallbackRates(params.weightOz)
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
      shipmentId: shipment.id,
    }))
    .filter((r) => r.rateCents > 0)
    .sort((a, b) => a.rateCents - b.rateCents)

  return rates.map(({ shipmentId: _, ...rate }) => rate)
}

/** Flat estimates when EasyPost is not configured (dev / staging). */
function fallbackRates(weightOz: number): ShippingRate[] {
  const base = weightOz <= 96 ? 1500 : 2800
  return [
    { id: 'fallback-ground', carrier: 'USPS', service: 'Ground Advantage (est.)', rateCents: base, deliveryDays: 5 },
    { id: 'fallback-priority', carrier: 'USPS', service: 'Priority (est.)', rateCents: base + 800, deliveryDays: 3 },
  ]
}

export async function createEasyPostShipmentId(params: {
  to: EasyPostAddress
  weightOz: number
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
        from_address: SHIP_FROM,
        to_address: params.to,
        parcel: { weight: params.weightOz },
      },
    }),
  })

  if (!shipmentRes.ok) return null
  const shipment = (await shipmentRes.json()) as { id: string }
  return shipment.id
}
