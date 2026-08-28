import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100)
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function maskTaxId(last4: string | null | undefined): string {
  if (!last4) return 'Not on file'
  return `••••${last4}`
}

export function generateOrderNumber(): string {
  const now = new Date()
  const y = now.getFullYear().toString().slice(-2)
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `PE-${y}${m}${d}-${rand}`
}

export function generateInvoiceNumber(): string {
  const now = new Date()
  const y = now.getFullYear().toString().slice(-2)
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `INV-${y}${m}${d}-${rand}`
}

export function applicationStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'Pending review',
    approved: 'Approved',
    declined: 'Declined',
    suspended: 'Suspended',
    removed: 'Removed',
  }
  return labels[status] ?? status
}

export function documentStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'Pending review',
    accepted: 'Accepted',
    rejected: 'Rejected',
  }
  return labels[status] ?? status
}

export function invoiceStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: 'Draft',
    sent: 'Sent',
    paid: 'Paid',
    expired: 'Expired',
    cancelled: 'Cancelled',
  }
  return labels[status] ?? status
}

export function customerTypeLabel(type: string): string {
  if (type === 'retail_wholesale') return 'Retail Wholesale'
  if (type === 'direct_to_customer') return 'Direct to Customer'
  return type
}

/** Discount off product subtotal only (not shipping/tax). */
export function computeDiscountCents(
  subtotalCents: number,
  discountType: 'none' | 'percent' | 'amount',
  discountValue: number,
): number {
  if (discountType === 'none' || discountValue <= 0 || subtotalCents <= 0) return 0
  if (discountType === 'percent') {
    const pct = Math.min(100, discountValue)
    return Math.min(subtotalCents, Math.round((subtotalCents * pct) / 100))
  }
  return Math.min(subtotalCents, Math.round(discountValue * 100))
}
