/** Build a CSV string from rows. Escapes quotes and commas. */
export function rowsToCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  const escape = (value: string | number | null | undefined) => {
    const s = value == null ? '' : String(value)
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  return [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n')
}

export function csvResponse(filename: string, csv: string) {
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

export function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export function startOfYear(d = new Date()) {
  return new Date(d.getFullYear(), 0, 1)
}

export function endOfDay(isoDate: string) {
  const d = new Date(isoDate)
  d.setHours(23, 59, 59, 999)
  return d
}

export function parseDateParam(value: string | undefined, fallback: Date | null = null) {
  if (!value) return fallback
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? fallback : d
}

export function daysSince(iso: string | null | undefined) {
  if (!iso) return null
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return null
  return Math.floor((Date.now() - then) / (24 * 60 * 60 * 1000))
}
