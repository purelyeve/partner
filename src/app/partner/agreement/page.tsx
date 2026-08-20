import { redirect } from 'next/navigation'
import { AgreementForm } from './agreement-form'
import { requireDistributor } from '@/lib/auth'

export default async function AgreementPage() {
  const { distributor, profile } = await requireDistributor()

  if (distributor.application_status !== 'approved') redirect('/partner')
  if (distributor.agreement_signed_at) redirect('/partner/resale')

  return <AgreementForm defaultName={profile.full_name} />
}
