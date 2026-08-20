import { createClient } from '@/lib/supabase/server'
import { requireDistributor, canPurchasePackages } from '@/lib/auth'
import { PackageCheckout, PackagesPageHeader } from './package-checkout'

export default async function PackagesPage() {
  const { distributor } = await requireDistributor()
  const supabase = await createClient()

  const { data: packages } = await supabase
    .from('inventory_packages')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')

  return (
    <div className="space-y-8">
      <PackagesPageHeader />
      <PackageCheckout
        packages={packages ?? []}
        canPurchase={canPurchasePackages(distributor)}
      />
    </div>
  )
}
