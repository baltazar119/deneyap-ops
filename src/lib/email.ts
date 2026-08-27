import nodemailer, { type Transporter } from 'nodemailer'

export interface EkDosya {
  filename: string
  content: Buffer
  contentType: string
}

export interface EpostaSecenekleri {
  /** PDF/Excel raporu eki. Toplam boyut sınırı için EK_BOYUT_SINIRI'na bakın. */
  ekler?: EkDosya[]
  replyTo?: string
  /** Toplu gönderimde havuzlu transport dışarıdan verilir */
  transport?: Transporter
}

/** Ek boyutu üst sınırı — Vercel bellek ve süre bütçesi için, SMTP limitinden düşük */
export const EK_BOYUT_SINIRI = 8 * 1024 * 1024

function yapilandirilmisMi(): boolean {
  return !!process.env.SMTP_USER && !!process.env.SMTP_PASS
}

function createTransport(havuzlu = false): Transporter {
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
    // Havuzlu modda tek bağlantı yeniden kullanılır; tek tek gönderimde
    // her çağrıda yeni TLS el sıkışması yapmak digest'i timeout'a düşürüyordu.
    ...(havuzlu ? { pool: true, maxConnections: 1, maxMessages: 50 } : {}),
  })
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  secenekler?: EpostaSecenekleri,
): Promise<boolean> {
  if (!yapilandirilmisMi()) {
    console.warn('[sendEmail] SMTP credentials not configured, skipping.')
    return false
  }

  const ekler = secenekler?.ekler ?? []
  const toplamBoyut = ekler.reduce((t, e) => t + e.content.length, 0)
  if (toplamBoyut > EK_BOYUT_SINIRI) {
    console.warn(
      `[sendEmail] Ekler çok büyük (${Math.round(toplamBoyut / 1024 / 1024)} MB), eksiz gönderiliyor.`,
    )
  }
  const eklenecek = toplamBoyut > EK_BOYUT_SINIRI ? [] : ekler

  // Dışarıdan transport geldiyse onu kapatmak çağıranın işi
  const disTransport = !!secenekler?.transport
  const transport = secenekler?.transport ?? createTransport()

  try {
    await transport.sendMail({
      from:    process.env.FROM_EMAIL || `"DENEYAP OYS" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
      ...(secenekler?.replyTo ? { replyTo: secenekler.replyTo } : {}),
      ...(eklenecek.length ? { attachments: eklenecek } : {}),
    })
    return true
  } catch (err) {
    console.error('[sendEmail] Failed:', err)
    return false
  } finally {
    if (!disTransport && typeof transport.close === 'function') transport.close()
  }
}

export interface TopluMesaj {
  to: string
  subject: string
  html: string
  secenekler?: Omit<EpostaSecenekleri, 'transport'>
}

export interface TopluSonuc {
  gonderilen: number
  basarisiz: number
  /** Süre bütçesi dolduğu için hiç denenmeyen mesaj sayısı */
  kalan: number
}

/**
 * Havuzlu toplu gönderim — cron işleri için.
 *
 * Tek TLS bağlantısı açar ve yeniden kullanır. Önceki hâlde her mesaj için
 * yeni transport açılıyordu; 50 kişilik bir digest 50 el sıkışması demekti ve
 * Vercel fonksiyon süresine sığmıyordu (digest'in sessizce boş dönmesinin
 * sebeplerinden biri buydu).
 *
 * `butceMs` dolunca durur ve kalan sayısını döndürür — cron bir sonraki
 * turda kaldığı yerden devam edebilir.
 */
export async function sendEmailBatch(
  mesajlar: TopluMesaj[],
  opts?: { butceMs?: number },
): Promise<TopluSonuc> {
  if (!yapilandirilmisMi()) {
    console.warn('[sendEmailBatch] SMTP credentials not configured, skipping.')
    return { gonderilen: 0, basarisiz: 0, kalan: mesajlar.length }
  }

  const butce = opts?.butceMs ?? 45_000
  const baslangic = Date.now()
  const transport = createTransport(true)

  let gonderilen = 0
  let basarisiz = 0
  let i = 0

  try {
    for (; i < mesajlar.length; i++) {
      if (Date.now() - baslangic > butce) break
      const m = mesajlar[i]
      const ok = await sendEmail(m.to, m.subject, m.html, { ...m.secenekler, transport })
      if (ok) gonderilen++
      else basarisiz++
    }
  } finally {
    if (typeof transport.close === 'function') transport.close()
  }

  return { gonderilen, basarisiz, kalan: mesajlar.length - i }
}
