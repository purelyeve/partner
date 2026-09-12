import { readFileSync } from 'fs'
import { join } from 'path'
import { Resend } from 'resend'

let resend: Resend | null = null
let logoAttachment: { content: string; filename: string; contentId: string } | null | undefined

function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY)
  return resend
}

const from = () => process.env.EMAIL_FROM ?? 'Purely Eve <contact@purelyeve.com>'

export function companyNotifyEmail(): string {
  return process.env.COMPANY_NOTIFY_EMAIL ?? 'contact@purelyeve.com'
}

/** Site URL for links in emails and Stripe returns (server-only; never localhost in production). */
export function appUrl(): string {
  const configured = (
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    ''
  ).replace(/\/$/, '')
  if (configured && !/localhost|127\.0\.0\.1/i.test(configured)) {
    return configured
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/$/, '')}`
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, '')}`
  }
  return configured || 'http://localhost:3000'
}

export function firstNameFromFullName(fullName: string): string {
  const part = fullName.trim().split(/\s+/)[0]
  return part || 'Partner'
}

function getLogoAttachment() {
  if (logoAttachment !== undefined) return logoAttachment
  try {
    const filePath = join(process.cwd(), 'public', 'brand', 'logo-black-on-white.png')
    const content = readFileSync(filePath).toString('base64')
    logoAttachment = {
      content,
      filename: 'purely-eve-logo.png',
      contentId: 'pe-logo',
    }
  } catch (err) {
    console.error('[email] could not load logo for inline attach', err)
    logoAttachment = null
  }
  return logoAttachment
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h1>/gi, '\n\n')
    .replace(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function sendEmail(params: {
  to: string | string[]
  subject: string
  html: string
  replyTo?: string
  /** Optional display name; always keeps the verified Purely Eve domain address. */
  fromName?: string
}): Promise<{ ok: boolean; error?: string }> {
  const client = getResend()
  if (!client) {
    console.warn('[email] RESEND_API_KEY not set — skipping:', params.subject, '→', params.to)
    return { ok: true }
  }

  const defaultFrom = from()
  let resolvedFrom = defaultFrom
  if (params.fromName) {
    const match = defaultFrom.match(/<([^>]+)>/)
    const emailOnly = match?.[1] ?? defaultFrom.replace(/.*\s/, '').trim()
    const safeName = params.fromName.replace(/[<>\n\r]/g, '').trim().slice(0, 78)
    resolvedFrom = `${safeName} <${emailOnly}>`
  }

  const logo = getLogoAttachment()
  const html = logo
    ? params.html.replaceAll('cid:pe-logo-placeholder', 'cid:pe-logo')
    : params.html.replace(
        /<img[^>]*cid:pe-logo-placeholder[^>]*>/i,
        '<p style="font-family:Georgia,serif;font-size:18pt;color:#3a2108;margin:0 0 24px;">Purely Eve</p>',
      )

  const { data, error } = await client.emails.send({
    from: resolvedFrom,
    to: params.to,
    subject: params.subject,
    html,
    text: htmlToText(html),
    ...(params.replyTo ? { replyTo: params.replyTo } : {}),
    ...(logo
      ? {
          attachments: [
            {
              content: logo.content,
              filename: logo.filename,
              contentId: logo.contentId,
              contentType: 'image/png',
            },
          ],
        }
      : {}),
  })

  if (error) {
    console.error('[email] send failed', {
      to: params.to,
      subject: params.subject,
      from: resolvedFrom,
      replyTo: params.replyTo,
      error: error.message,
    })
    return { ok: false, error: error.message }
  }

  console.info('[email] sent', { to: params.to, subject: params.subject, id: data?.id })
  return { ok: true }
}

export async function notifyCompany(params: {
  subject: string
  html: string
}): Promise<{ ok: boolean; error?: string }> {
  return sendEmail({
    to: companyNotifyEmail(),
    subject: params.subject,
    html: params.html,
  })
}

export function emailShell(title: string, body: string): string {
  const font = `Calibri,Carlito,'Segoe UI',Arial,sans-serif`
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f5f0e8;">
  <div style="font-family:${font};font-size:12pt;line-height:1.5;color:#1d201f;background:#f5f0e8;padding:32px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;padding:32px;border:1px solid #e8dcc8;">
    <img src="cid:pe-logo-placeholder" alt="Purely Eve" width="200" height="auto" style="display:block;margin:0 0 24px;border:0;outline:none;text-decoration:none;width:200px;max-width:100%;height:auto;" />
    <p style="font-family:${font};color:#aa7800;letter-spacing:0.15em;font-size:10pt;text-transform:uppercase;margin:0 0 8px;">Purely Eve</p>
    <h1 style="font-family:${font};font-size:18pt;font-weight:bold;color:#3a2108;margin:0 0 24px;">${title}</h1>
    <div style="font-family:${font};font-size:12pt;line-height:1.5;">${body}</div>
    <p style="font-family:${font};margin-top:32px;font-size:10pt;color:#794100;">Purely Eve LLC · Partner Portal</p>
  </div>
  </div>
</body></html>`
}

/** Client-provided copy when a Partner is approved and ready to order inventory. */
export function partnerApprovalReadyEmailHtml(params: {
  fullName: string
  portalLoginUrl: string
}): string {
  const first = firstNameFromFullName(params.fullName)
  const body = `
<p>Hi ${first},</p>
<p><strong>Congratulations</strong> - your Purely Eve Partner registration has been approved!</p>
<p>You've completed the registration process, submitted your required documentation, and your account is now approved to move forward with your opening inventory order.</p>
<p>This is such an exciting milestone, and I want you to know how genuinely excited we are to have you joining us at this early stage of Purely Eve.</p>
<p>From the beginning, our vision has been about more than simply creating beautiful skincare. We are building a brand rooted in exceptional products, meaningful relationships, integrity, and an opportunity for our Partners to build something of their own alongside us.</p>
<p>And now, you're officially part of that beginning.</p>
<p><strong>Your Next Step: Opening Inventory Order</strong></p>
<p>You may now log into your Purely Eve Partner Portal and select your launching inventory package.</p>
<p style="margin: 24px 0;"><a href="${params.portalLoginUrl}" style="background:#3a2108;color:#f5f0e8;padding:12px 20px;text-decoration:none;display:inline-block;">Sign in to the Partner Portal</a></p>
<p>To complete activation of your Partner account, your opening inventory order must be placed within seven (7) days of this approval email.</p>
<p>If an opening inventory order is not placed within the 7-day period, your Partner account may be returned to inactive status and your approval may need to be reviewed again before ordering privileges are restored.</p>
<p>Once your opening order is placed, we'll begin preparing your inventory and provide additional information to help you get ready to introduce Purely Eve to your market.</p>
<p><strong>Growing Purely Eve Together</strong></p>
<p>As one of our early Partners, you are stepping into Purely Eve at a very special time.</p>
<p>We want this to be a true relationship between our company and the independent Partners representing the brand. As Purely Eve grows, we want to learn from you - what you're hearing from spas and retailers, what customers are responding to, what tools would help you sell more effectively, and where you see opportunities for us to grow.</p>
<p>Your success matters to us because we believe the strongest way to build Purely Eve is together.</p>
<p>We'll continue providing education, approved marketing resources, product information, sales support, new product updates, and tools designed to help you confidently introduce Purely Eve to your customers and retail relationships.</p>
<p>At the same time, we encourage you to bring your own strengths, relationships, ideas, and personality to the way you build your independent business. You were selected because we believe you have something valuable to bring to Purely Eve - and we're excited to see where you take it.</p>
<p>Thank you for choosing to be part of this beginning and for trusting what we're building.</p>
<p>There is so much ahead, and we are incredibly excited to grow together.</p>
<p>Welcome to Purely Eve.</p>
<p>Warmly,<br/>Dena Lemos<br/>Founder/Owner<br/>Purely Eve LLC<br/><em>Timeless Natural Beauty</em></p>`
  return emailShell('Your Partner registration is approved', body)
}
