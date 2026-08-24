import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageShell } from '@/components/layout/page-shell'
import { ResendTestPanel } from '@/components/resend-test-panel'
import { Button } from '@/components/ui'
import { getSession } from '@/lib/auth'

export default async function HomePage() {
  const session = await getSession()
  if (session) {
    redirect(session.profile.role === 'admin' ? '/admin' : '/partner')
  }

  return (
    <PageShell>
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <p className="text-xs tracking-[0.25em] uppercase text-pe-gold mb-4">Purely Eve LLC</p>
        <h1 className="text-4xl font-serif mb-4">Partner Portal</h1>
        <p className="text-pe-brown mb-10 max-w-lg mx-auto leading-relaxed">
          Register as an approved Purely Eve Partner, manage your account, and purchase wholesale
          inventory packages to begin representing Purely Eve.
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/register">
            <Button>Register as a Partner</Button>
          </Link>
          <Link href="/login">
            <Button variant="secondary">Sign in</Button>
          </Link>
        </div>

        {process.env.NODE_ENV === 'development' && <ResendTestPanel />}
      </div>
    </PageShell>
  )
}
