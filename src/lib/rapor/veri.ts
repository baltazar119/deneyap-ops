import 'server-only'
import { tumGorevleriGetir } from '@/lib/server/taskQuery'
import { rolAdi } from '@/lib/roller'
import { raporKapsami } from './kapsam'
import { raporHesapla, type RaporVerisi, type Donem, type RaporTrend, type TrendKarsilastirma } from './hesapla'
import { yerelGun } from './donem'
import { seriUret, gunEkle, type OlcumSatiri } from '@/lib/ozet/seri'
import { karsilastir, karsilastirmaMetni, oncekiDonem } from '@/lib/ozet/karsilastir'
import type { Task } from '@/types/database'
import { computeRisk } from '@/lib/operationRisk'
import { yorumUret, yorumGirdisiKur } from '@/lib/yorum/uret'
import { riskGirdisiSunucu } from '@/lib/risk/sunucuVeri'
import type { OrgYetki } from '@/lib/server/apiAuth'

/**
 * Rapor verisini veritabanından toplar ve saf hesaplayıcıya devreder.
 *
 * Rol ve il HİÇBİR ZAMAN istek gövdesinden alınmaz — organization_members'tan
 * çözülür (apiAuth bunu zaten yapmış olur). İstemci kapsamını genişletemez.
 */
export async function raporVerisi(
  yetki: OrgYetki,
  donem: Donem,
): Promise<RaporVerisi> {
  const kapsam = raporKapsami(yetki.rol, yetki.il)

  // taskQuery zaten rol kapsamını uyguluyor; kapsam.ilFiltresi ikinci katman
  const gorevler = await tumGorevleriGetir(yetki)

  const { data: uyelikler } = await yetki.admin
    .from('organization_members')
    .select('user_id, il')
    .eq('organization_id', yetki.org.id)

  const ids = (uyelikler ?? []).map((u: { user_id: string }) => u.user_id)
  const { data: profiller } = ids.length
    ? await yetki.admin.from('profiles').select('id, full_name').in('id', ids)
    : { data: [] }

  const uyeAdlari: Record<string, string> = {}
  ;(profiller ?? []).forEach((p: { id: string; full_name: string | null }) => {
    uyeAdlari[p.id] = p.full_name ?? 'İsimsiz'
  })
  const uyeIlleri: Record<string, string | null> = {}
  ;(uyelikler ?? []).forEach((u: { user_id: string; il: string | null }) => {
    uyeIlleri[u.user_id] = u.il
  })

  const { data: profil } = await yetki.admin
    .from('profiles').select('full_name').eq('id', yetki.user.id).maybeSingle()

  const temel = raporHesapla({
    gorevler,
    kapsam,
    donem,
    uyeAdlari,
    uyeIlleri,
    orgAd: yetki.org.name,
    uretenAd: profil?.full_name ?? yetki.user.email ?? 'Kullanıcı',
    uretenRol: yetki.rol,
    uretenRolAdi: rolAdi(yetki.rol),
    bugun: yerelGun(new Date()),
  })

  /* ── Risk bölümü ────────────────────────────────────────────────────────
   *
   * 'risk' uzun süre `RaporBolumu` enum'unda TANIMLI ama hiç ÜRETİLMEYEN bir
   * değerdi; artık gerçekten dolduruluyor ve PDF/Excel'e girebiliyor.
   *
   * Risk DÖNEME TABİ DEĞİL — anlık durumu anlatır. "Geçen ay" seçildiğinde
   * "şu an neyin riskli olduğu" değişmemeli.
   */
  const trend = await trendUret(yetki, kapsam, gorevler, donem)

  /**
   * Yorumlar EN SON üretilir: motor risk ve trend'e de bakıyor, bu yüzden
   * ikisi de hesaplandıktan sonra çalışmalı. Sıra bozulursa yorumlar
   * "gecikme artıyor" gibi trend'e dayalı kuralları hiç göremez.
   */
  const yorumla = (v: RaporVerisi): RaporVerisi => {
    if (!kapsam.bolumler.has('yorum')) return v
    try {
      const s = yorumUret(yorumGirdisiKur(v, yetki.rol, kapsam))
      return {
        ...v,
        yorum: {
          ozet: s.ozet,
          maddeler: s.yorumlar.map(y => ({
            onem: y.onem, baslik: y.baslik, cumle: y.cumle,
            eylem: y.eylem, kanit: y.kanit,
          })),
        },
      }
    } catch (err) {
      // Yorum motoru raporu düşürmemeli — sayılar yine de değerli.
      console.error('[rapor/veri] yorum üretilemedi:', err)
      return v
    }
  }

  if (!kapsam.bolumler.has('risk')) return yorumla({ ...temel, trend })

  try {
    const girdi = await riskGirdisiSunucu(yetki)
    const r = computeRisk(girdi)
    return yorumla({
      ...temel,
      trend,
      risk: {
        skor: r.score,
        seviye: r.level,
        baslik: r.headline,
        // Kişi bazlı veri kapalıysa (Yetkili Yönetici) sinyal metinlerinde
        // isim geçebileceği için o bölüm hiç eklenmez.
        sinyaller: kapsam.kisiBazliVeri
          ? r.signals.map(x => ({ baslik: x.title, detay: x.detail, seviye: x.level, eylem: x.action }))
          : [],
        iller: r.provinces.map(x => ({
          il: x.il, skor: x.score, seviye: x.level,
          acik: x.openCount, geciken: x.overdueCount,
        })),
      },
    })
  } catch (err) {
    // Risk hesabı raporun tamamını düşürmemeli — bölüm boş kalır.
    console.error('[rapor/veri] risk hesaplanamadı:', err)
    return yorumla({ ...temel, trend })
  }
}

/* ── Trend serisi ────────────────────────────────────────────────────────
 *
 * `gunluk_ozet` tablosu YOKSA (migration 064 uygulanmamış) veya boşsa seri
 * görev tarihlerinden türetilir. Bu yüzden hata yakalanıp yutuluyor:
 * ölçüm altyapısının olmaması raporu düşürmemeli.
 */
async function trendUret(
  yetki: OrgYetki,
  kapsam: ReturnType<typeof raporKapsami>,
  gorevler: Task[],
  donem: Donem,
): Promise<RaporTrend | null> {
  if (!kapsam.bolumler.has('trend')) return null

  // Trend penceresi dönemden BAĞIMSIZ olarak son 90 gün: tek haftalık bir
  // dönem seçildiğinde 7 noktalı bir grafik "eğilim" göstermez.
  const bugun = yerelGun(new Date())
  const baslangic = gunEkle(bugun, -89)

  let olcumler: OlcumSatiri[] = []
  try {
    let q = yetki.admin
      .from('gunluk_ozet')
      .select('gun, acik, geciken, yeni_olusturulan, gun_icinde_tamamlanan, bloke, atanmamis')
      .eq('organization_id', yetki.org.id)
      .gte('gun', baslangic)
      .order('gun')

    // İl Sorumlusu kendi ilinin serisini görür, ülke genelini değil.
    const tekIl = kapsam.ilFiltresi?.length === 1 ? kapsam.ilFiltresi[0] : null
    q = tekIl ? q.eq('kirilim', 'il').eq('il', tekIl) : q.eq('kirilim', 'org')

    const { data, error } = await q
    if (!error && data) olcumler = data as OlcumSatiri[]
  } catch {
    // Tablo yok / erişilemedi → türetmeye düşülür
  }

  const noktalar = seriUret({ gorevler, olcumler, baslangic, bitis: bugun })
  if (!noktalar.length) return null

  // Dönem karşılaştırması: seçili dönem ile hemen öncesi
  const onceki = oncekiDonem(donem.baslangic, donem.bitis)
  const pencere = (b: string, s: string) => noktalar.filter(n => n.gun >= b && n.gun <= s)
  const buP = pencere(donem.baslangic, donem.bitis)
  const onP = pencere(onceki.baslangic, onceki.bitis)

  const sonDeger = (dizi: typeof noktalar, alan: 'acik' | 'geciken') =>
    dizi.length ? dizi[dizi.length - 1][alan] : 0
  const toplam = (dizi: typeof noktalar, alan: 'tamamlanan') =>
    dizi.reduce((s, n) => s + n[alan], 0)

  const paketle = (k: ReturnType<typeof karsilastir>): TrendKarsilastirma => ({
    bu: k.bu, onceki: k.onceki, fark: k.fark, yuzde: k.yuzde,
    yon: k.yon, guvenilir: k.guvenilir, metin: karsilastirmaMetni(k),
  })

  const karsilastirmaVar = buP.length > 0 && onP.length > 0

  return {
    noktalar: noktalar.map(n => ({
      etiket: n.etiket,
      acik: n.acik, geciken: n.geciken,
      olusturulan: n.olusturulan, tamamlanan: n.tamamlanan,
      bloke: n.bloke, atanmamis: n.atanmamis,
      turetilmis: n.kaynak === 'turetilmis',
    })),
    tamamenTuretilmis: noktalar.every(n => n.kaynak === 'turetilmis'),
    karsilastirma: karsilastirmaVar ? {
      acik:       paketle(karsilastir(sonDeger(buP, 'acik'),    sonDeger(onP, 'acik'))),
      geciken:    paketle(karsilastir(sonDeger(buP, 'geciken'), sonDeger(onP, 'geciken'))),
      tamamlanan: paketle(karsilastir(toplam(buP, 'tamamlanan'), toplam(onP, 'tamamlanan'))),
    } : null,
  }
}
