import { redirect } from 'next/navigation'

/** Agreement is accepted at registration. Keep this URL as a redirect only. */
export default function DeprecatedAgreementPage() {
  redirect('/partner')
}
