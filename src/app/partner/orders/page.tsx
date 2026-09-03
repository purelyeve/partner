import { redirect } from 'next/navigation'

export default async function OrdersRedirect({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const q = await searchParams
  const filter = q.filter ? `?filter=${encodeURIComponent(q.filter)}` : ''
  redirect(`/partner/fulfillments${filter}`)
}
