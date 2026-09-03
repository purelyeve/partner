import {
  getConnectBalanceSummary,
  isConnectReady,
  listConnectPayouts,
  syncConnectAccountStatus,
} from '@/lib/stripe-connect'
import { requireDistributor } from '@/lib/auth'
import PaymentsClient from './payments-client'

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ return?: string; refresh?: string }>
}) {
  const { distributor } = await requireDistributor()
  const q = await searchParams

  if (distributor.stripe_account_id && (q.return === '1' || q.refresh === '1')) {
    try {
      await syncConnectAccountStatus(distributor.stripe_account_id)
    } catch {
      // non-fatal; UI still shows last known status
    }
  }

  const { distributor: fresh } = await requireDistributor()
  const ready = isConnectReady(fresh)

  let balance = null
  let payouts: Awaited<ReturnType<typeof listConnectPayouts>> = []
  if (fresh.stripe_account_id && ready) {
    balance = await getConnectBalanceSummary(fresh.stripe_account_id)
    payouts = await listConnectPayouts(fresh.stripe_account_id, 12)
  }

  return (
    <PaymentsClient
      connectReady={ready}
      chargesEnabled={Boolean(fresh.stripe_charges_enabled)}
      payoutsEnabled={Boolean(fresh.stripe_payouts_enabled)}
      detailsSubmitted={Boolean(fresh.stripe_details_submitted)}
      hasAccount={Boolean(fresh.stripe_account_id)}
      balance={balance}
      payouts={payouts}
      returnedFromStripe={q.return === '1'}
      refreshedFromStripe={q.refresh === '1'}
    />
  )
}
