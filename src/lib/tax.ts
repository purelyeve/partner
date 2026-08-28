import { getStripe } from '@/lib/stripe'

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
}): Promise<{ taxCents: number; error?: string }> {
  if (params.customerType === 'retail_wholesale') {
    return { taxCents: 0 }
  }

  const taxable = params.productSubtotalCents + params.shippingCents
  if (taxable <= 0) return { taxCents: 0 }

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

    return { taxCents: calculation.tax_amount_exclusive ?? 0 }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Tax calculation failed'
    console.error('[tax]', message)
    // Soft-fail: allow invoice with $0 tax and surface warning to UI
    return {
      taxCents: 0,
      error: `Sales tax could not be calculated automatically (${message}). Tax was set to $0 — verify Stripe Tax is enabled, or enter tax manually later.`,
    }
  }
}
