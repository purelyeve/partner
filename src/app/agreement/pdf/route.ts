import { NextResponse } from 'next/server'
import {
  AGREEMENT_EFFECTIVE_DATE,
  AGREEMENT_TITLE,
  AGREEMENT_VERSION_LABEL,
  agreementFullText,
} from '@/content/partner-agreement'

/** Minimal multi-page text PDF (Helvetica) — no extra dependencies. */
function buildTextPdf(fullText: string): Uint8Array {
  const pageWidth = 612
  const pageHeight = 792
  const margin = 54
  const fontSize = 10
  const lineHeight = 13
  const maxWidth = pageWidth - margin * 2
  const charsPerLine = Math.floor(maxWidth / (fontSize * 0.5))

  function wrap(text: string): string[] {
    const lines: string[] = []
    for (const paragraph of text.split(/\r?\n/)) {
      if (!paragraph.trim()) {
        lines.push('')
        continue
      }
      const words = paragraph.split(/\s+/)
      let current = ''
      for (const word of words) {
        const next = current ? `${current} ${word}` : word
        if (next.length > charsPerLine && current) {
          lines.push(current)
          current = word
        } else {
          current = next
        }
      }
      if (current) lines.push(current)
    }
    return lines
  }

  const lines = wrap(fullText)
  const linesPerPage = Math.floor((pageHeight - margin * 2) / lineHeight)
  const pages: string[][] = []
  for (let i = 0; i < lines.length; i += linesPerPage) {
    pages.push(lines.slice(i, i + linesPerPage))
  }
  if (pages.length === 0) pages.push([''])

  const objects: string[] = []
  const add = (content: string) => {
    objects.push(content)
    return objects.length
  }

  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  const contentIds: number[] = []

  for (const pageLines of pages) {
    const escaped = pageLines
      .map((line) =>
        line
          .replace(/\\/g, '\\\\')
          .replace(/\(/g, '\\(')
          .replace(/\)/g, '\\)')
          .replace(/[^\x20-\x7E]/g, '?'),
      )
      .join('\n')

    let stream = `BT\n/F1 ${fontSize} Tf\n${margin} ${pageHeight - margin} Td\n${lineHeight} TL\n`
    for (const line of escaped.split('\n')) {
      stream += `(${line}) '\n`
    }
    stream += 'ET'
    const streamBody = `<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream`
    contentIds.push(add(streamBody))
  }

  const pageIds: number[] = []
  for (const contentId of contentIds) {
    pageIds.push(
      add(
        `<< /Type /Page /Parent PAGES_REF /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`,
      ),
    )
  }

  const kids = pageIds.map((id) => `${id} 0 R`).join(' ')
  const pagesId = add(`<< /Type /Pages /Kids [${kids}] /Count ${pageIds.length} >>`)
  const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`)

  const resolved = objects.map((obj) => obj.replaceAll('PAGES_REF', `${pagesId} 0 R`))

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = [0]
  for (let i = 0; i < resolved.length; i++) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'))
    pdf += `${i + 1} 0 obj\n${resolved[i]}\nendobj\n`
  }
  const xrefStart = Buffer.byteLength(pdf, 'utf8')
  pdf += `xref\n0 ${resolved.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  for (let i = 1; i <= resolved.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${resolved.length + 1} /Root ${catalogId} 0 R >>\n`
  pdf += `startxref\n${xrefStart}\n%%EOF`

  return new Uint8Array(Buffer.from(pdf, 'utf8'))
}

export async function GET() {
  const text = [
    AGREEMENT_TITLE,
    `Agreement Version 1.0 | Effective ${AGREEMENT_EFFECTIVE_DATE}`,
    AGREEMENT_VERSION_LABEL,
    '',
    agreementFullText(),
  ].join('\n')

  const bytes = buildTextPdf(text)
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition':
        'attachment; filename="Purely-Eve-Partner-Terms-Wholesale-Agreement-v1.0.pdf"',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
