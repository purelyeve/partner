import Link from 'next/link'
import { Logo } from '@/components/layout/page-shell'
import { logoutAction } from '@/lib/actions'
import { requireAdmin } from '@/lib/auth'

const NAV = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/distributors', label: 'Distributors' },
  { href: '/admin/products', label: 'Products' },
  { href: '/admin/orders', label: 'Inventory orders' },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-pe-dark-brown text-pe-cream border-b border-pe-brown">
        <div className="max-w-6xl mx-auto px-4 py-2 flex flex-wrap items-center justify-between gap-4">
          <Logo dark />
          <nav className="flex flex-wrap items-center gap-4 text-sm">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="nav-link nav-link-dark">
                {item.label}
              </Link>
            ))}
            <form action={logoutAction}>
              <button type="submit" className="nav-link nav-link-dark text-pe-beige">
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">{children}</main>
    </div>
  )
}
