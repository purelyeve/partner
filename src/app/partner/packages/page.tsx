import { createClient } from '@/lib/supabase/server'
import { requireDistributor, canPurchasePackages, hasCompleteShipToAddress } from '@/lib/auth'
import { getPartnerVisiblePackages } from '@/lib/catalog-visibility'
import { PackageCheckout, PackagesPageHeader } from './package-checkout'

export default async function PackagesPage() {
  const { distributor } = await requireDistributor()
  const supabase = await createClient()

  const packages = await getPartnerVisiblePackages(supabase, distributor.id)

  const onboardingComplete =
    distributor.application_status === 'approved' &&
    distributor.agreement_signed_at !== null &&
    distributor.resale_accepted_at !== null

  return (
    <div className="space-y-8">
      <PackagesPageHeader />
      <PackageCheckout
        packages={packages}
        canPurchase={canPurchasePackages(distributor)}
        needsAddress={onboardingComplete && !hasCompleteShipToAddress(distributor)}
      />
    </div>
  )
}
