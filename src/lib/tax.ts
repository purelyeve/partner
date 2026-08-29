import { getStripe } from '@/lib/stripe'

/**
 * Approximate destination sales tax when Stripe Tax is unavailable.
 * Prefer Stripe Tax when enabled; this keeps DTC invoices from silently shipping at $0 tax.
 * Rates are combined state averages (not local district-perfect).
 */
const STATE_TAX_BPS: Record<string, number> = {
  AL: 400, AK: 0, AZ: 560, AR: 650, CA: 725, CO: 290, CT: 635, DE: 0, DC: 600,
  FL: 600, GA: 400, HI: 400, ID: 600, IL: 625, IN: 700, IA: 600, KS: 650, KY: 600,
  LA: 445, ME: 550, MD: 600, MA: 625, MI: 600, MN: 688, MS: 700, MO: 423, MT: 0,
  NE: 550, NV: 685, NH: 0, NJ: 663, NM: 488, NY: 400, NC: 475, ND: 500, OH: 575,
  OK: 450, OR: 0, PA: 600, RI: 700, SC: 600, SD: 450, TN: 700, TX: 625, UT: 485,
  VT: 600, VA: 530, WA: 650, WV: 600, WI: 500, WY: 400,
}

/** Destination-based tax for Direct to Customer sales via Stripe Tax. Wholesale = 0. */
export async function calculateDestinationTaxCents(params: {
  customerType: 'direct_to_customer' | 'retail_wholesale'
  productSubtotalCents: number
  shippingCents: number
  address: {
    line1: string
    line2?: string
    city: string
    state: string
    postal_code: string
    country?: string
  }
}): Promise<{ taxCents: number; error?: string; source: 'stripe' | 'estimate' | 'exempt' | 'none' }> {
  if (params.customerType === 'retail_wholesale') {
    return { taxCents: 0, source: 'exempt' }
  }

  const taxable = params.productSubtotalCents + params.shippingCents
  if (taxable <= 0) return { taxCents: 0, source: 'none' }

  const state = (params.address.state || '').trim().toUpperCase()

  try {
    const stripe = getStripe()
    const calculation = await stripe.tax.calculations.create({
      currency: 'usd',
      customer_details: {
        address: {
          line1: params.address.line1,
          line2: params.address.line2 || undefined,
          city: params.address.city,
          state: params.address.state,
          postal_code: params.address.postal_code,
          country: params.address.country || 'US',
        },
        address_source: 'shipping',
      },
      line_items: [
        {
          amount: params.productSubtotalCents,
          reference: 'products',
          tax_code: 'txcd_99999999',
        },
      ],
      ...(params.shippingCents > 0
        ? { shipping_cost: { amount: params.shippingCents } }
        : {}),
    })

    const stripeTax = calculation.tax_amount_exclusive ?? 0
    if (stripeTax > 0) {
      return { taxCents: stripeTax, source: 'stripe' }
    }

    // Stripe succeeded but returned $0 — often means Tax not registered for that state.
    const estimated = estimateStateTaxCents(taxable, state)
    if (estimated > 0) {
      console.warn(
        `[tax] Stripe Tax returned $0 for ${state}; using state estimate ${estimated} cents. Enable Stripe Tax registrations for accurate rates.`,
      )
      return { taxCents: estimated, source: 'estimate' }
    }
    return { taxCents: 0, source: 'stripe' }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Tax calculation failed'
    console.error('[tax]', message)
    const estimated = estimateStateTaxCents(taxable, state)
    if (estimated > 0) {
      return {
        taxCents: estimated,
        source: 'estimate',
        error: `Stripe Tax unavailable (${message}). Used estimated ${state} tax.`,
      }
    }
    return {
      taxCents: 0,
      source: 'none',
      error: `Sales tax could not be calculated (${message}). Enable Stripe Tax in the Stripe Dashboard, or verify the ship-to address.`,
    }
  }
}

function estimateStateTaxCents(taxableCents: number, state: string): number {
  const bps = STATE_TAX_BPS[state]
  if (bps == null || bps <= 0) return 0
  return Math.round((taxableCents * bps) / 10000)
}
