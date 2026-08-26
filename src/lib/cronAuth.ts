import { timingSafeEqual } from 'crypto'

/**
 * Cron endpoint'lerinin ortak yetki kontrolü.
 *
 * Vercel, `vercel.json` içindeki cron'ları çağırırken isteğe otomatik olarak
 * `Authorization: Bearer $CRON_SECRET` başlığını ekler. Bu yüzden secret'ı
 * `vercel.json` yoluna gömmeye gerek yok — zaten gömülemez de, çünkü o dosya
 * ortam değişkeni interpolasyonu desteklemiyor.
 *
 * Elle tetikleme (curl / tarayıcı) kolaylığı için `?secret=` sorgu parametresi
 * de kabul ediliyor.
 */
export function cronYetkili(req: Request): boolean {
  const beklenen = process.env.CRON_SECRET
  if (!beklenen) return false

  const header = req.headers.get('authorization') ?? ''
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : ''
  const query  = new URL(req.url).searchParams.get('secret') ?? ''

  return esitMi(bearer, beklenen) || esitMi(query, beklenen)
}

function esitMi(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}
