import Link from 'next/link'
import Image from 'next/image'
import { BRAND } from '@/lib/constants'

export function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-3 cursor-pointer">
      <Image
        src={dark ? '/brand/logo-gold-on-black.jpg' : '/brand/logo-black-on-white.png'}
        alt={BRAND.name}
        width={220}
        height={72}
        className="h-14 sm:h-16 w-auto"
        priority
      />
    </Link>
  )
}

export function PageShell({
  children,
  darkHeader = false,
}: {
  children: React.ReactNode
  darkHeader?: boolean
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <header
        className={
          darkHeader
            ? 'bg-pe-dark-brown text-pe-cream border-b border-pe-brown'
            : 'bg-pe-white border-b border-pe-beige'
        }
      >
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Logo dark={darkHeader} />
          <span className="text-xs tracking-[0.2em] uppercase text-pe-gold">{BRAND.tagline}</span>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-pe-beige bg-pe-cream py-6 text-center text-xs text-pe-brown">
        © {new Date().getFullYear()} Purely Eve LLC. All rights reserved.
      </footer>
    </div>
  )
}
