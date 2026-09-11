import Link from 'next/link'

/** Shared filter bar for admin report pages (GET form). */
export function ReportFilters({
  action,
  children,
  backHref = '/admin/reports',
}: {
  action: string
  children: React.ReactNode
  backHref?: string
}) {
  return (
    <form
      method="get"
      action={action}
      className="border border-pe-beige bg-white rounded-sm p-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end"
    >
      {children}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          className="inline-flex items-center justify-center px-4 py-2 text-sm bg-pe-gold text-white rounded-sm hover:bg-pe-brown"
        >
          Apply filters
        </button>
        <Link href={action} className="text-sm self-center text-pe-brown underline">
          Clear
        </Link>
        <Link href={backHref} className="text-sm self-center text-pe-brown">
          ← Reports
        </Link>
      </div>
    </form>
  )
}

export function FilterField({
  label,
  name,
  children,
}: {
  label: string
  name?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={name} className="text-xs uppercase tracking-wider text-pe-brown">
        {label}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  )
}

export function SummaryCards({
  items,
}: {
  items: Array<{ label: string; value: string; href?: string }>
}) {
  return (
    <div className="grid sm:grid-cols-3 gap-4">
      {items.map((item) => {
        const inner = (
          <>
            <p className="text-xs uppercase tracking-wider text-pe-brown">{item.label}</p>
            <p className="text-2xl font-serif mt-1">{item.value}</p>
          </>
        )
        if (item.href) {
          return (
            <Link
              key={item.label}
              href={item.href}
              className="border border-pe-beige bg-white rounded-sm p-4 block hover:border-pe-gold transition-colors"
            >
              {inner}
              <p className="text-xs text-pe-brown mt-2 underline">View detail →</p>
            </Link>
          )
        }
        return (
          <div key={item.label} className="border border-pe-beige bg-white rounded-sm p-4">
            {inner}
          </div>
        )
      })}
    </div>
  )
}

/** Brown export button that keeps current filter query params. */
export function ExportReportButton({
  report,
  searchParams,
}: {
  report: string
  searchParams: Record<string, string | undefined>
}) {
  const q = new URLSearchParams()
  q.set('report', report)
  for (const [key, value] of Object.entries(searchParams)) {
    if (value) q.set(key, value)
  }
  return (
    <Link
      href={`/admin/reports/export?${q.toString()}`}
      className="inline-flex items-center px-4 py-2 text-sm bg-pe-dark-brown text-pe-cream rounded-sm hover:bg-pe-brown"
    >
      Export report
    </Link>
  )
}
