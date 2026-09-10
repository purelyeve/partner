'use client'

import { useMemo, useState } from 'react'
import AssignmentToggle from './assignment-toggle'
import PackageAssignmentToggle from './package-assignment-toggle'

export type PartnerAssignmentRow = {
  id: string
  businessName: string
  contactName: string
  email: string
  assigned: boolean
}

export default function PartnerAssignmentPanel({
  partners,
  entityLabel,
  entityType,
  entityId,
}: {
  partners: PartnerAssignmentRow[]
  entityLabel: string
  entityType: 'product' | 'package'
  entityId: string
}) {
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    const sorted = [...partners].sort((a, b) => {
      const an = (a.businessName || a.contactName || a.email).toLowerCase()
      const bn = (b.businessName || b.contactName || b.email).toLowerCase()
      return an.localeCompare(bn)
    })
    if (!term) return sorted
    return sorted.filter((p) => {
      const hay = `${p.businessName} ${p.contactName} ${p.email}`.toLowerCase()
      return hay.includes(term)
    })
  }, [partners, q])

  const assignedCount = partners.filter((p) => p.assigned).length

  return (
    <div className="space-y-4">
      <p className="text-sm text-pe-brown">
        Only assigned Partners see this {entityLabel}. Nothing is selected by default — assign the
        Partners who should have access. {assignedCount} of {partners.length} assigned.
      </p>
      <div>
        <label htmlFor="partnerSearch" className="text-xs uppercase tracking-wider text-pe-brown">
          Search Partners
        </label>
        <input
          id="partnerSearch"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name, business, or email"
          className="mt-1 w-full max-w-md"
        />
      </div>
      {!partners.length ? (
        <p className="text-sm text-pe-brown">No approved Partners yet.</p>
      ) : !filtered.length ? (
        <p className="text-sm text-pe-brown">No Partners match that search.</p>
      ) : (
        <div className="border border-pe-beige bg-white rounded-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-pe-cream text-left">
              <tr>
                <th className="p-3">Partner</th>
                <th className="p-3">Contact</th>
                <th className="p-3">Assigned</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-t border-pe-beige">
                  <td className="p-3">{p.businessName}</td>
                  <td className="p-3">
                    {p.contactName}
                    <br />
                    <span className="text-pe-brown">{p.email}</span>
                  </td>
                  <td className="p-3">{p.assigned ? 'Yes' : 'No'}</td>
                  <td className="p-3 text-right">
                    {entityType === 'product' ? (
                      <AssignmentToggle
                        productId={entityId}
                        distributorId={p.id}
                        assigned={p.assigned}
                      />
                    ) : (
                      <PackageAssignmentToggle
                        packageId={entityId}
                        distributorId={p.id}
                        assigned={p.assigned}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
