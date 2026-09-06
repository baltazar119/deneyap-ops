import { NextRequest, NextResponse } from 'next/server'
import { cronYetkili } from '@/lib/cronAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Tek günlük cron — tüm zamanlanmış işleri sırayla tetikler.
 *
 * Neden tek uç?
 *   Vercel Hobby planı az sayıda cron ve günde bir çalıştırma veriyor.
 *   Dört ayrı cron yerine tek bir günlük cron kurup hangi işin çalışacağına
 *   burada karar veriyoruz. Pro planda da aynı şekilde çalışır; tek fark
 *   orada istenirse ayrı ayrı da zamanlanabilir.
 *
 * Alt işler kendi HTTP isteklerinde çalışıyor: her biri kendi süre bütçesine
 * sahip oluyor ve biri patlarsa diğerleri etkilenmiyor.
 *
 * Elle çalıştırma:
 *   curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/gunluk
 *   ?deneme=1  → e-posta göndermeden dener
 *   ?gun=1     → haftanın gününü zorlar (1 = Pazartesi), haftalık işleri test eder
 */

interface IsSonucu {
  is: string
  http: number
  sureMs: number
  yanit?: unknown
  hata?: string
}

export async function GET(req: NextRequest) {
  if (!cronYetkili(req)) {
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const deneme = url.searchParams.get('deneme') === '1'
  const zorlananGun = url.searchParams.get('gun')

  const taban = process.env.NEXT_PUBLIC_APP_URL || url.origin
  const secret = process.env.CRON_SECRET ?? ''

  // 1 = Pazartesi. Testte ?gun=1 ile zorlanabiliyor.
  const gun = zorlananGun !== null ? Number(zorlananGun) : new Date().getDay()
  const pazartesiMi = gun === 1

  const isler: { ad: string; yol: string }[] = [
    // EN BAŞTA: 50 sn bütçesi dolduğunda atlanan son iş bu OLMAMALI.
    // Kaçırılan bir günün ölçümü geri getirilemez (durum geçmişi yok).
    { ad: 'gunluk-operasyon-olcumu',       yol: '/api/cron/gunluk-ozet' },
    { ad: 'gecikme-ve-termin-kontrolleri', yol: '/api/cron/daily-checks' },
    { ad: 'gunluk-ozet',                   yol: '/api/digest-email?type=daily' },
  ]
  if (pazartesiMi) {
    isler.push({ ad: 'haftalik-ozet',  yol: '/api/digest-email?type=weekly' })
    isler.push({ ad: 'haftalik-rapor', yol: '/api/cron/haftalik-rapor' })
  }

  const sonuclar: IsSonucu[] = []
  const t0 = Date.now()

  for (const is of isler) {
    // Genel bütçe: son iş yarıda kesilmesin diye 50 sn'de duruyoruz
    if (Date.now() - t0 > 50_000) {
      sonuclar.push({ is: is.ad, http: 0, sureMs: 0, hata: 'süre bütçesi doldu, atlandı' })
      continue
    }

    const ayirici = is.yol.includes('?') ? '&' : '?'
    const hedef = `${taban}${is.yol}${deneme ? `${ayirici}deneme=1` : ''}`
    const basla = Date.now()

    try {
      const r = await fetch(hedef, {
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(55_000),
      })
      const yanit = await r.json().catch(() => null)
      sonuclar.push({ is: is.ad, http: r.status, sureMs: Date.now() - basla, yanit })
    } catch (e) {
      sonuclar.push({
        is: is.ad,
        http: 0,
        sureMs: Date.now() - basla,
        hata: e instanceof Error ? e.message : String(e),
      })
    }
  }

  const basarisiz = sonuclar.filter(s => s.http !== 200)

  return NextResponse.json({
    ok: basarisiz.length === 0,
    gun,
    pazartesiMi,
    deneme,
    toplamSureMs: Date.now() - t0,
    calisan: sonuclar.length,
    basarisiz: basarisiz.length,
    sonuclar,
  })
}
