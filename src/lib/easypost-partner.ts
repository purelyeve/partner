const COMPANY_KEY_MISSING =
  'Shipping is not configured on the server yet. Contact Purely Eve support.'

/**
 * Customer labels are bought on the company EasyPost account.
 *
 * The shipping the customer paid is routed to the company at checkout via a
 * Stripe application fee, so the postage charge is already funded by that
 * order. Partners never need their own EasyPost account.
 */
export function resolveCustomerShippingKey(): { apiKey: string } | { error: string } {
  const apiKey = process.env.EASYPOST_API_KEY
  if (!apiKey) return { error: COMPANY_KEY_MISSING }
  return { apiKey }
}
