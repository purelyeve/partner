import { createClient } from '@/lib/supabase/server'
import { requireDistributor, canPurchasePackages, hasCompleteShipToAddress } from '@/lib/auth'
import { PackageCheckout, PackagesPageHeader } from './package-checkout'

export default async function PackagesPage() {
  const { distributor } = await requireDistributor()
  const supabase = await createClient()

  const { data: packages } = await supabase
    .from('inventory_packages')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')

  const onboardingComplete =
    distributor.application_status === 'approved' &&
    distributor.agreement_signed_at !== null &&
    distributor.resale_accepted_at !== null

  return (
    <div className="space-y-8">
      <PackagesPageHeader />
      <PackageCheckout
        packages={packages ?? []}
        canPurchase={canPurchasePackages(distributor)}
        needsAddress={onboardingComplete && !hasCompleteShipToAddress(distributor)}
      />
    </div>
  )
}
