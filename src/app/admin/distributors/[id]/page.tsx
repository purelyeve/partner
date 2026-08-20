import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge, Card } from '@/components/ui'
import { AdminApplicationActions, AdminDocumentCard } from '../admin-actions'
import { getAdminDb } from '@/lib/admin'
import { requireAdmin } from '@/lib/auth'
import {
  applicationStatusLabel,
  formatCurrency,
  formatDate,
  maskTaxId,
} from '@/lib/utils'
import { CONSUMER_SERUM_SKU, DISTRIBUTOR_PROFILE } from '@/lib/constants'
import type { DistributorDocument, Profile } from '@/lib/types'

async function getDocumentUrls(doc: DistributorDocument) {
  const supabase = getAdminDb()
  const bucket = 'distributor-documents'

  const [view, download] = await Promise.all([
    supabase.storage.from(bucket).createSignedUrl(doc.storage_path, 3600),
    supabase.storage.from(bucket).createSignedUrl(doc.storage_path, 3600, {
      download: doc.file_name,
    }),
  ])

  return {
    viewUrl: view.data?.signedUrl ?? null,
    downloadUrl: download.data?.signedUrl ?? null,
  }
}

export default async function AdminDistributorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdmin()
  const { id } = await params
  const supabase = getAdminDb()

  const { data: distributor } = await supabase
    .from('distributors')
    .select(`*, ${DISTRIBUTOR_PROFILE}(*)`)
    .eq('id', id)
    .maybeSingle()

  if (!distributor) notFound()

  const profile = distributor.profiles as unknown as Profile

  const { data: documents } = await supabase
    .from('distributor_documents')
    .select('*')
    .eq('distributor_id', id)
    .order('uploaded_at', { ascending: false })

  const documentsWithUrls = await Promise.all(
    (documents ?? []).map(async (doc) => ({
      doc: doc as DistributorDocument,
      ...(await getDocumentUrls(doc as DistributorDocument)),
    })),
  )

  const { data: inventory } = await supabase
    .from('distributor_inventory')
    .select('*')
    .eq('distributor_id', id)

  const { data: orders } = await supabase
    .from('package_orders')
    .select('*')
    .eq('distributor_id', id)
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/distributors" className="text-sm">← All distributors</Link>
        <h1 className="text-3xl mt-2">{distributor.business_name}</h1>
        <p className="text-pe-brown">{profile.full_name} · {profile.email}</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="space-y-3 text-sm">
          <h2 className="text-lg">Application</h2>
          <p>Status: <Badge>{applicationStatusLabel(distributor.application_status)}</Badge></p>
          <p>Submitted: {formatDate(distributor.application_submitted_at)}</p>
          <p>Tax ID: {maskTaxId(distributor.tax_id_last4)}</p>
          <p>Resale #: {distributor.resale_certificate_number || '—'} ({distributor.resale_state || '—'})</p>
          <p>Agreement signed: {distributor.agreement_signed_at ? formatDate(distributor.agreement_signed_at) : '—'}</p>
          <p>Resale accepted: {distributor.resale_accepted_at ? formatDate(distributor.resale_accepted_at) : '—'}</p>

          {distributor.application_status === 'pending' && (
            <AdminApplicationActions distributorId={distributor.id} />
          )}

          {distributor.application_status === 'approved' && (
            <AdminApplicationActions distributorId={distributor.id} showModeration />
          )}
        </Card>

        <Card className="space-y-3 text-sm">
          <h2 className="text-lg">Addresses</h2>
          <div>
            <p className="font-medium">Mailing</p>
            <p>{distributor.mailing_line1}</p>
            {distributor.mailing_line2 && <p>{distributor.mailing_line2}</p>}
            <p>{distributor.mailing_city}, {distributor.mailing_state} {distributor.mailing_postal_code}</p>
          </div>
          <div>
            <p className="font-medium">Fulfillment</p>
            {distributor.fulfillment_same_as_mailing ? (
              <p className="text-pe-brown">Same as mailing</p>
            ) : (
              <>
                <p>{distributor.fulfillment_line1}</p>
                <p>{distributor.fulfillment_city}, {distributor.fulfillment_state} {distributor.fulfillment_postal_code}</p>
              </>
            )}
          </div>
        </Card>
      </div>

      <section>
        <h2 className="text-xl mb-4">Documents</h2>
        {!documentsWithUrls.length && (
          <p className="text-sm text-pe-brown">No documents uploaded.</p>
        )}
        <div className="space-y-4">
          {documentsWithUrls.map(({ doc, viewUrl, downloadUrl }) => (
            <AdminDocumentCard
              key={doc.id}
              doc={doc}
              viewUrl={viewUrl}
              downloadUrl={downloadUrl}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl mb-4">Inventory</h2>
        <p className="text-sm">
          {CONSUMER_SERUM_SKU}:{' '}
          {inventory?.find((i) => i.sku === CONSUMER_SERUM_SKU)?.quantity_on_hand ?? 0} units on hand
        </p>
      </section>

      <section>
        <h2 className="text-xl mb-4">Package orders</h2>
        {orders?.length ? (
          <div className="border border-pe-beige bg-white rounded-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-pe-cream text-left">
                <tr>
                  <th className="p-3">Order</th>
                  <th className="p-3">Package</th>
                  <th className="p-3">Status</th>
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
                    <td className="p-3">{formatCurrency(o.total_cents)}</td>
                    <td className="p-3">{formatDate(o.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-pe-brown">No orders.</p>
        )}
      </section>
    </div>
  )
}
