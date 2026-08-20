import { Resend } from 'resend'

let resend: Resend | null = null

function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY)
  return resend
}

const from = () => process.env.EMAIL_FROM ?? 'Purely Eve <noreply@purelyeve.com>'

export async function sendEmail(params: {
  to: string
  subject: string
  html: string
}): Promise<{ ok: boolean; error?: string }> {
  const client = getResend()
  if (!client) {
    console.warn('[email] RESEND_API_KEY not set — skipping:', params.subject, '→', params.to)
    return { ok: true }
  }

  const { error } = await client.emails.send({
    from: from(),
    to: params.to,
    subject: params.subject,
    html: params.html,
  })

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export function emailShell(title: string, body: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family: Georgia, serif; color: #1d201f; background: #f5f0e8; padding: 32px;">
  <div style="max-width: 560px; margin: 0 auto; background: #fff; padding: 32px; border: 1px solid #e8dcc8;">
    <p style="color: #aa7800; letter-spacing: 0.15em; font-size: 12px; text-transform: uppercase; margin: 0 0 8px;">Purely Eve</p>
    <h1 style="font-size: 22px; font-weight: normal; color: #3a2108; margin: 0 0 24px;">${title}</h1>
    ${body}
    <p style="margin-top: 32px; font-size: 12px; color: #794100;">Purely Eve LLC · Partner Portal</p>
  </div>
</body></html>`
}
