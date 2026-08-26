import { NextRequest, NextResponse } from 'next/server'
import { orgYetkiCoz } from '@/lib/server/apiAuth'
import { rateLimit } from '@/lib/rateLimit'
import { raporVerisi } from '@/lib/rapor/veri'
import { donemCoz, type DonemAnahtari } from '@/lib/rapor/donem'
import { raporUretebilirMi } from '@/lib/rapor/kapsam'
import { raporPdfUret } from '@/lib/rapor/pdf/uret'
import { raporExcelUret } from '@/lib/rapor/excel'
import { raporCsv, type CsvSayfa } from '@/lib/rapor/csv'
import { toSlug } from '@/lib/turkce'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/org/[slug]/rapor?format=pdf|xlsx|csv|json&donem=...
 *
 * Kapsamı ÇAĞIRANIN ROLÜ belirler; istemci genişletemez. Rol ve il
 * organization_members'tan çözülür (apiAuth), istek gövdesinden değil.
 */
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  // Not: 'rapor' kapısı Panel/Operasyon Riski EKRANLARI için (member hariç).
  // Rapor İNDİRME farklı: İl Sorumlusu kendi ilinin raporunu alabilmeli.
  // Kimin neyi göreceğini raporKapsami() belirliyor.
  const y = await orgYetkiCoz(req, { slug: params.slug, gerekli: 'uye' })
  if (!y.ok) return y.res
  const { yetki } = y

  if (!raporUretebilirMi(yetki.rol)) {
    return NextResponse.json({ error: 'Bu rol rapor üretemez.' }, { status: 403 })
  }

  const rl = await rateLimit(`rapor:${yetki.user.id}`, 20, 60 * 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Saatte en fazla 20 rapor indirilebilir.' }, { status: 429 })
  }

  const url = new URL(req.url)
  const format = (url.searchParams.get('format') ?? 'pdf') as 'pdf' | 'xlsx' | 'csv' | 'json'
  const donemAnahtari = (url.searchParams.get('donem') ?? 'bu-ay') as DonemAnahtari
  const csvSayfa = (url.searchParams.get('sayfa') ?? 'gorevler') as CsvSayfa

  const donem = donemCoz(donemAnahtari)

  let veri
  try {
    veri = await raporVerisi(yetki, donem)
  } catch (e) {
    console.error('[rapor] veri hatası:', e)
    return NextResponse.json({ error: 'Rapor verisi hazırlanamadı.' }, { status: 500 })
  }

  // Dosya adı: ASCII + RFC 5987 ikilisi, Türkçe karakterli ad bozulmasın
  const tabanAd = toSlug(`${veri.meta.raporAdi}-${veri.meta.donem.etiket}`) || 'deneyap-rapor'

  function indir(govde: Buffer | string, tip: string, uzanti: string) {
    return new NextResponse(govde as BodyInit, {
      headers: {
        'Content-Type': tip,
        'Content-Disposition': `attachment; filename="${tabanAd}.${uzanti}"; filename*=UTF-8''${encodeURIComponent(tabanAd)}.${uzanti}`,
        'Cache-Control': 'no-store',
      },
    })
  }

  try {
    switch (format) {
      case 'json':
        return NextResponse.json(veri)

      case 'csv': {
        // Yetkili Yönetici'nin ham görev listesi yok; boş dosya indirmek
        // yerine elindeki en anlamlı tabloya düşüyoruz.
        const sayfa: CsvSayfa =
          csvSayfa === 'gorevler' && veri.hamListe.length === 0 ? 'il-ozeti' : csvSayfa
        return indir(raporCsv(veri, sayfa), 'text/csv; charset=utf-8', 'csv')
      }

      case 'xlsx': {
        const buf = await raporExcelUret(veri)
        return indir(Buffer.from(buf),
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx')
      }

      case 'pdf':
      default: {
        const buf = await raporPdfUret(veri)
        return indir(buf, 'application/pdf', 'pdf')
      }
    }
  } catch (e) {
    console.error('[rapor] üretim hatası:', e)
    return NextResponse.json({ error: 'Rapor üretilemedi.' }, { status: 500 })
  }
}
