'use client'

import { useActionState } from 'react'
import { Badge, Button, Label } from '@/components/ui'
import {
  adminDecideApplicationAction,
  adminDeleteDistributorAction,
  adminReviewDocumentAction,
} from '@/lib/actions'
import { documentStatusLabel, formatDate } from '@/lib/utils'
import type { DistributorDocument } from '@/lib/types'

export function AdminDeleteDistributorForm({
  distributorId,
  label,
}: {
  distributorId: string
  label: string
}) {
  const [state, action, pending] = useActionState(adminDeleteDistributorAction, null)

  return (
    <form action={action} className="space-y-3 border border-red-200 bg-red-50/50 rounded-sm p-4">
      <input type="hidden" name="distributorId" value={distributorId} />
      <p className="text-sm text-pe-charcoal">
        Permanently delete <strong>{label}</strong> and their documents, inventory, and package
        orders. This cannot be undone.
      </p>
      <Label htmlFor="confirm-delete" required>
        Type DELETE to confirm
      </Label>
      <input id="confirm-delete" name="confirm" placeholder="DELETE" autoComplete="off" required />
      <Button type="submit" variant="danger" disabled={pending}>
        {pending ? 'Deleting…' : 'Delete partner / applicant'}
      </Button>
      {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  )
}

export function AdminApplicationActions({ distributorId, showModeration }: { distributorId: string; showModeration?: boolean }) {
  const [, approveAction, approvePending] = useActionState(adminDecideApplicationAction, null)
  const [, declineAction, declinePending] = useActionState(adminDecideApplicationAction, null)
  const [, suspendAction] = useActionState(adminDecideApplicationAction, null)
  const [, removeAction] = useActionState(adminDecideApplicationAction, null)

  if (showModeration) {
    return (
      <div className="pt-4 flex flex-wrap gap-2 border-t border-pe-beige">
        <form action={suspendAction}>
          <input type="hidden" name="distributorId" value={distributorId} />
          <input type="hidden" name="decision" value="suspended" />
          <input type="hidden" name="note" value="" />
          <Button type="submit" variant="secondary">Suspend</Button>
        </form>
        <form action={removeAction}>
          <input type="hidden" name="distributorId" value={distributorId} />
          <input type="hidden" name="decision" value="removed" />
          <input type="hidden" name="note" value="" />
          <Button type="submit" variant="danger">Remove</Button>
        </form>
      </div>
    )
  }

  return (
    <div className="pt-4 space-y-4 border-t border-pe-beige">
      <form action={approveAction} className="space-y-2">
        <input type="hidden" name="distributorId" value={distributorId} />
        <input type="hidden" name="decision" value="approved" />
        <Label htmlFor="approveNote">Approval note (optional)</Label>
        <input id="approveNote" name="note" placeholder="Welcome to Purely Eve" />
        <Button type="submit" disabled={approvePending}>Approve application</Button>
      </form>
      <form action={declineAction} className="space-y-2">
        <input type="hidden" name="distributorId" value={distributorId} />
        <input type="hidden" name="decision" value="declined" />
        <Label htmlFor="declineNote" required>Decline reason</Label>
        <input id="declineNote" name="note" required />
        <Button type="submit" variant="danger" disabled={declinePending}>Decline application</Button>
      </form>
    </div>
  )
}

function documentKindLabel(kind: string): string {
  return kind === 'resale_certificate' ? 'Resale certificate' : 'Signed agreement'
}

export function AdminDocumentCard({
  doc,
  viewUrl,
  downloadUrl,
}: {
  doc: DistributorDocument
  viewUrl: string | null
  downloadUrl: string | null
}) {
  const [, acceptAction, acceptPending] = useActionState(adminReviewDocumentAction, null)
  const [, rejectAction, rejectPending] = useActionState(adminReviewDocumentAction, null)

  return (
    <div className="border border-pe-beige bg-white rounded-sm p-4 text-sm space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-pe-dark-brown">{documentKindLabel(doc.kind)}</p>
          <p className="text-pe-brown mt-1">{doc.file_name}</p>
          <p className="text-xs text-pe-brown mt-0.5">Uploaded {formatDate(doc.uploaded_at)}</p>
        </div>
        <Badge tone={doc.status === 'accepted' ? 'success' : doc.status === 'rejected' ? 'error' : 'warning'}>
          {documentStatusLabel(doc.status)}
        </Badge>
      </div>

      {(viewUrl || downloadUrl) && (
        <div className="flex flex-wrap gap-2">
          {viewUrl && (
            <a href={viewUrl} target="_blank" rel="noopener noreferrer">
              <Button type="button" variant="secondary">View document</Button>
            </a>
          )}
          {downloadUrl && (
            <a href={downloadUrl} download={doc.file_name}>
              <Button type="button" variant="ghost">Download</Button>
            </a>
          )}
        </div>
      )}

      {!viewUrl && !downloadUrl && (
        <p className="text-xs text-pe-brown">Document file is unavailable.</p>
      )}

      {doc.review_note && (
        <p className="text-xs text-pe-brown border-t border-pe-beige pt-3">
          Review note: {doc.review_note}
        </p>
      )}

      {doc.status === 'pending' && doc.kind === 'resale_certificate' && (
        <div className="border-t border-pe-beige pt-4 space-y-4">
          <form action={acceptAction}>
            <input type="hidden" name="documentId" value={doc.id} />
            <input type="hidden" name="status" value="accepted" />
            <input type="hidden" name="note" value="" />
            <Button type="submit" disabled={acceptPending}>
              {acceptPending ? 'Accepting…' : 'Accept certificate'}
            </Button>
          </form>

          <form action={rejectAction} className="space-y-2">
            <input type="hidden" name="documentId" value={doc.id} />
            <input type="hidden" name="status" value="rejected" />
            <Label htmlFor={`reject-${doc.id}`} required>Rejection reason</Label>
            <input
              id={`reject-${doc.id}`}
              name="note"
              required
              placeholder="Explain what needs to be corrected"
            />
            <Button type="submit" variant="danger" disabled={rejectPending}>
              {rejectPending ? 'Rejecting…' : 'Reject certificate'}
            </Button>
          </form>
        </div>
      )}
    </div>
  )
}
