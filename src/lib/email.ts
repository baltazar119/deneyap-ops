import nodemailer from 'nodemailer'

function createTransport() {
  const port = parseInt(process.env.SMTP_PORT || '587')
  return nodemailer.createTransport({
    host:            process.env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure:          port === 465,   // 465 → SSL, 587 → STARTTLS
    requireTLS:      port !== 465,   // 587'de TLS zorunlu
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    connectionTimeout: 8000,   // 8 sn — Vercel 10sn limit için
    greetingTimeout:   5000,
    socketTimeout:     8000,
  })
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<boolean> {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('[sendEmail] SMTP credentials not configured, skipping.')
    return false
  }

  try {
    const transport = createTransport()
    await transport.sendMail({
      from:    process.env.FROM_EMAIL || `"DENEYAP Ops" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    })
    return true
  } catch (err) {
    console.error('[sendEmail] Failed:', err)
    return false
  }
}
