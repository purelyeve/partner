'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui'

export default function PackingListPrint({
  sellerName,
  sellerPhone,
  sellerEmail,
  invoiceNumber,
  paidAt,
  customerName,
  shipTo,
  tracking,
  lines,
  total,
}: {
  sellerName: string
  sellerPhone: string
  sellerEmail: string
  invoiceNumber: string
  paidAt: string
  customerName: string
  shipTo: string[]
  tracking: string
  lines: Array<{ name: string; sku: string; qty: number; total: string }>
  total: string
}) {
  useEffect(() => {
    // Give layout a tick, then open print dialog
    const t = setTimeout(() => window.print(), 400)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="min-h-screen bg-white text-pe-charcoal p-8 max-w-3xl mx-auto">
      <div className="print:hidden mb-6 flex gap-3">
        <Button type="button" onClick={() => window.print()}>
          Print
        </Button>
        <Button type="button" variant="secondary" onClick={() => window.close()}>
          Close
        </Button>
      </div>

      <header className="border-b border-pe-beige pb-4 mb-6">
        <p className="text-xs uppercase tracking-wider text-pe-brown">Packing list</p>
        <h1 className="text-2xl mt-1">{sellerName}</h1>
        {(sellerEmail || sellerPhone) && (
          <p className="text-sm text-pe-brown">
            {[sellerEmail, sellerPhone].filter(Boolean).join(' · ')}
          </p>
        )}
        <p className="text-sm mt-2">
          Invoice <strong>{invoiceNumber}</strong>
          {paidAt ? ` · Paid ${paidAt}` : ''}
        </p>
      </header>

      <section className="grid sm:grid-cols-2 gap-6 mb-8 text-sm">
        <div>
          <p className="text-pe-brown uppercase text-xs tracking-wider mb-1">Ship to</p>
          <p className="font-medium">{customerName}</p>
          {shipTo.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
        <div>
          <p className="text-pe-brown uppercase text-xs tracking-wider mb-1">Tracking</p>
          <p>{tracking || '—'}</p>
        </div>
      </section>

      <table className="w-full text-sm border border-pe-beige">
        <thead className="bg-pe-cream text-left">
          <tr>
            <th className="p-2">Item</th>
            <th className="p-2">SKU</th>
            <th className="p-2">Qty</th>
            <th className="p-2">Line</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={`${l.sku}-${l.name}`} className="border-t border-pe-beige">
              <td className="p-2">{l.name}</td>
              <td className="p-2 font-mono text-xs">{l.sku}</td>
              <td className="p-2">{l.qty}</td>
              <td className="p-2">{l.total}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-right mt-4 font-medium">Order total: {total}</p>
      <p className="text-xs text-pe-brown mt-8">
        Include this packing list with the shipment. Thank you for being a Purely Eve Partner.
      </p>
    </div>
  )
}
