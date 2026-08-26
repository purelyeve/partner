import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Alert, Badge, Button, Card } from '@/components/ui'
import { requireDistributor, onboardingStep, canPurchasePackages } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency, formatDate, applicationStatusLabel } from '@/lib/utils'
import { CONSUMER_SERUM_SKU } from '@/lib/constants'

export default async function PartnerDashboardPage() {
  const session = await requireDistributor()
  const { distributor, profile } = session
  const step = onboardingStep(distributor)

  if (step === 'register') redirect('/register')

  const supabase = await createClient()
  const { data: inventory } = await supabase
    .from('distributor_inventory')
    .select('*')
    .eq('distributor_id', distributor.id)
    .eq('sku', CONSUMER_SERUM_SKU)
    .maybeSingle()

  const { data: orders } = await supabase
    .from('package_orders')
    .select(
      'id, order_number, name_snapshot, status, total_cents, created_at, tracking_code, shipping_carrier, shipping_service, fulfilled_at',
    )
    .eq('distributor_id', distributor.id)
    .order('created_at', { ascending: false })
    .limit(5)

  const { data: latestResale } = await supabase
    .from('distributor_documents')
    .select('id, status')
    .eq('distributor_id', distributor.id)
    .eq('kind', 'resale_certificate')
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl mb-1">Welcome, {profile.full_name || profile.email}</h1>
        <p className="text-pe-brown">{distributor.business_name}</p>
      </div>

      {step === 'pending' && (
        <Alert variant="info">
          Your Partner registration is under review. You will receive an email once a decision has
          been made. Resale documentation is reviewed before wholesale purchasing is activated.
        </Alert>
      )}

      {step === 'declined' && (
        <Alert variant="error">
          Your application was not approved.
          {distributor.application_decision_note && (
            <span className="block mt-1">Note: {distributor.application_decision_note}</span>
          )}
        </Alert>
      )}

      {step === 'suspended' && (
        <Alert variant="warning">Your account is suspended. Contact Purely Eve for assistance.</Alert>
      )}

      {step === 'resale' && (
        <Alert variant="info">
          {latestResale?.status === 'pending' ? (
            <>Your resale documentation is under review. Wholesale purchasing unlocks after it is accepted.</>
          ) : latestResale?.status === 'rejected' ? (
            <>
              Your resale documentation needs to be updated. Please upload a new document.
              <div className="mt-3">
                <Link href="/partner/resale"><Button>Upload resale documentation</Button></Link>
              </div>
            </>
          ) : (
            <>
              Upload your resale certificate for admin review before purchasing inventory.
              <div className="mt-3">
                <Link href="/partner/resale"><Button>Upload resale documentation</Button></Link>
              </div>
            </>
          )}
        </Alert>
      )}

      {step === 'address' && (
        <Alert variant="info">
          Add your mailing or fulfillment address so we can quote shipping on inventory packages.
          <div className="mt-3">
            <Link href="/partner/profile"><Button>Update profile</Button></Link>
          </div>
        </Alert>
      )}

      <div className="grid sm:grid-cols-3 gap-4">
        <Card>
          <p className="text-xs uppercase tracking-wider text-pe-brown mb-1">Status</p>
          <Badge tone={distributor.application_status === 'approved' ? 'success' : 'warning'}>
            {applicationStatusLabel(distributor.application_status)}
          </Badge>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wider text-pe-brown mb-1">Serum on hand</p>
          <p className="text-2xl font-serif">{inventory?.quantity_on_hand ?? 0} units</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wider text-pe-brown mb-1">Intro pricing</p>
          <p className="text-sm">
            {distributor.intro_expires_at
              ? `Until ${formatDate(distributor.intro_expires_at)}`
              : 'Starts with first inventory order'}
          </p>
        </Card>
      </div>

      {canPurchasePackages(distributor) && (
        <Card>
          <h2 className="text-xl mb-2">Purchase inventory</h2>
          <p className="text-sm text-pe-brown mb-4">
            Select a Partner Starter or Growth package to stock Eve Origin Serum.
          </p>
          <Link href="/partner/packages"><Button>Browse packages</Button></Link>
        </Card>
      )}

      <section>
        <h2 className="text-xl mb-4">Recent inventory orders</h2>
        {orders && orders.length > 0 ? (
          <div className="border border-pe-beige bg-white rounded-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-pe-cream text-left">
                <tr>
                  <th className="p-3">Order</th>
                  <th className="p-3">Package</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Tracking</th>
                  <th className="p-3">Total</th>
                  <th className="p-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-t border-pe-beige">
                    <td className="p-3">{o.order_number}</td>
                    <td className="p-3">{o.name_snapshot}</td>
                    <td className="p-3 capitalize">{o.status.replace('_', ' ')}</td>
                    <td className="p-3 text-sm">
                      {o.tracking_code ? (
                        <span>
                          {o.tracking_code}
                          {(o.shipping_carrier || o.shipping_service) && (
                            <span className="block text-xs text-pe-brown mt-0.5">
                              {[o.shipping_carrier, o.shipping_service].filter(Boolean).join(' ')}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-pe-brown">—</span>
                      )}
                    </td>
                    <td className="p-3">{formatCurrency(o.total_cents)}</td>
                    <td className="p-3">{formatDate(o.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-pe-brown">No orders yet.</p>
        )}
      </section>
    </div>
  )
}
