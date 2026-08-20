import Link from 'next/link'
import { Logo } from '@/components/layout/page-shell'
import { logoutAction } from '@/lib/actions'
import { requireSession } from '@/lib/auth'

const NAV = [
  { href: '/partner', label: 'Dashboard' },
  { href: '/partner/profile', label: 'Profile' },
  { href: '/partner/packages', label: 'Inventory packages' },
]

export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession()
  if (session.profile.role === 'admin') {
    return children
  }

  return (
    <div className="min-h-screen flex flex-col bg-pe-cream/30">
      <header className="bg-pe-white border-b border-pe-beige">
        <div className="max-w-5xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-4">
          <Logo />
          <nav className="flex flex-wrap items-center gap-4 text-sm">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="hover:text-pe-brown">
                {item.label}
              </Link>
            ))}
            <form action={logoutAction}>
              <button type="submit" className="text-pe-brown hover:text-pe-gold">Sign out</button>
            </form>
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8">{children}</main>
    </div>
  )
}
