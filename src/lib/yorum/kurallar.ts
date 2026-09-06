import { bulunmaEki, yonelmeEki } from '@/lib/turkce'
import type { Yorum, YorumGirdisi } from './tipler'

/**
 * Yorum kuralları — her biri küçük, saf, bağımsız bir fonksiyon.
 *
 * Sözleşme: kural ya bir `Yorum` döndürür ya `null`. Hiçbir kural başka bir
 * kuralın çıktısına bakmaz; sıralama ve eleme `uret.ts`'in işi.
 *
 * HER YORUM KANIT TAŞIR. "Gecikme arttı" cümlesi tek başına bir iddiadır;
 * yanında (5 → 7) yazmazsa yönetici doğrulayamaz ve bir süre sonra hiçbir
 * yoruma güvenmez.
 */

export type Kural = (g: YorumGirdisi) => Yorum | null

/** "Ankara'da" / "Uşak'ta" — ton `il` ise il adı yerine "ilinizde" */
function ilIfadesi(g: YorumGirdisi, il: string): string {
  if (g.ton === 'il') return 'ilinizde'
  return bulunmaEki(il)
}

/* ── 1-2: Gecikme eğilimi ────────────────────────────────────────────────── */

export const gecikmeArtisi: Kural = (g) => {
  const k = g.rapor.trend?.karsilastirma?.geciken
  if (!k) return null
  if (k.yon !== 'artis') return null
  // Hem oransal hem MUTLAK eşik: 1'den 2'ye çıkışı "kritik" ilan etmek
  // motorun güvenilirliğini bitirir.
  if (k.fark < 3) return null
  if (k.guvenilir && k.yuzde !== null && k.yuzde < 25) return null

  return {
    id: 'gecikme-artisi',
    onem: k.fark >= 6 ? 'kritik' : 'uyari',
    baslik: 'Gecikme artıyor',
    cumle: `Termini geçen görev sayısı ${k.metin}.`,
    kanit: [
      { etiket: 'Önceki dönem', deger: k.onceki },
      { etiket: 'Bu dönem', deger: k.bu },
    ],
    eylem: 'En çok geciken ile bakın; terminleri gerçekçi değilse revize edin.',
    kisiBazli: false,
  }
}

export const gecikmeAzalisi: Kural = (g) => {
  const k = g.rapor.trend?.karsilastirma?.geciken
  if (!k || k.yon !== 'azalis' || Math.abs(k.fark) < 3) return null

  return {
    id: 'gecikme-azalisi',
    onem: 'olumlu',
    baslik: 'Gecikme geriliyor',
    cumle: `Termini geçen görev sayısı ${k.metin}.`,
    kanit: [{ etiket: 'Önceki dönem', deger: k.onceki }, { etiket: 'Bu dönem', deger: k.bu }],
    // Sadece kötü haber veren bir ekran bir süre sonra kapatılır.
    eylem: null,
    kisiBazli: false,
  }
}

/* ── 3: Gecikmenin tek ilde yoğunlaşması ─────────────────────────────────── */

export const gecikmeYogunlasmasi: Kural = (g) => {
  const iller = g.rapor.ilKirilimi.filter(i => i.geciken > 0)
  if (iller.length < 2) return null

  const toplam = iller.reduce((s, i) => s + i.geciken, 0)
  if (toplam < 4) return null

  const enFazla = [...iller].sort((a, b) => b.geciken - a.geciken)[0]
  const oran = Math.round((enFazla.geciken / toplam) * 100)
  if (oran < 40) return null

  return {
    id: 'gecikme-yogunlasmasi',
    onem: oran >= 60 ? 'kritik' : 'uyari',
    baslik: 'Gecikme tek yerde toplanmış',
    cumle: `Toplam ${toplam} geciken görevin ${enFazla.geciken} tanesi ${ilIfadesi(g, enFazla.il)}. `
         + `Sorun geneli değil, tek bir noktayı ilgilendiriyor.`,
    kanit: [
      { etiket: enFazla.il, deger: `${enFazla.geciken} geciken (%${oran})` },
      { etiket: 'Diğer iller', deger: toplam - enFazla.geciken },
    ],
    eylem: g.ton === 'il'
      ? 'Geciken görevlerin terminlerini gözden geçirin.'
      : `Önce ${yonelmeEki(enFazla.il)} odaklanın; genel bir hamle gerekmiyor.`,
    kisiBazli: false,
  }
}

/* ── 4: Tek kişide yığılma ───────────────────────────────────────────────── */

export const kisideYigilma: Kural = (g) => {
  const s = g.rapor.sorumluKirilimi
  if (!s.length) return null

  const enYuklu = [...s].sort((a, b) => b.acik - a.acik)[0]
  const acik = enYuklu.acik
  if (acik < 5) return null

  const toplamAcik = s.reduce((t, x) => t + x.acik, 0)
  const oran = toplamAcik ? Math.round((acik / toplamAcik) * 100) : 0
  if (oran < 35 && acik < 8) return null

  return {
    id: 'kiside-yigilma',
    onem: acik >= 10 ? 'kritik' : 'uyari',
    baslik: 'İş tek kişide birikiyor',
    cumle: `${enYuklu.ad} üzerinde ${acik} açık görev var — açık işlerin %${oran} kadarı.`,
    kanit: [
      { etiket: enYuklu.ad, deger: `${acik} açık` },
      { etiket: 'Toplam açık', deger: toplamAcik },
    ],
    eylem: 'Yükü dağıtın; bu kişi tıkanırsa bağlı işler de durur.',
    // İSİM GEÇİYOR → Yetkili Yönetici raporunda bu kural HİÇ çalıştırılmaz
    kisiBazli: true,
  }
}

/* ── 5: Atanmamış kritik görev ───────────────────────────────────────────── */

export const atanmamisKritik: Kural = (g) => {
  const r = g.rapor.risk
  const sinyal = r?.sinyaller.find(x => x.baslik.toLowerCase().includes('atanmam'))
  const sayi = g.rapor.kpi.atanmamis
  if (!sayi) return null

  return {
    id: 'atanmamis',
    onem: sinyal ? 'kritik' : 'uyari',
    baslik: 'Sahipsiz görev var',
    cumle: `${sayi} açık görev kimseye atanmamış. Sahipsiz iş ilerlemez ve `
         + `kimse geciktiğini fark etmez.`,
    kanit: [{ etiket: 'Atanmamış', deger: sayi }, { etiket: 'Toplam açık', deger: g.rapor.kpi.toplam - g.rapor.kpi.tamamlanan }],
    eylem: 'Bu görevlere sorumlu atayın veya kapatın.',
    kisiBazli: false,
  }
}

/* ── 6: Bloke görevler ───────────────────────────────────────────────────── */

export const blokeBirikmesi: Kural = (g) => {
  const bloke = g.rapor.kpi.bloke
  if (bloke < 2) return null

  const noktalar = g.rapor.trend?.noktalar.filter(n => n.bloke !== null) ?? []
  const olcumVar = noktalar.length >= 4
  const dusmuyor = olcumVar && noktalar[noktalar.length - 1].bloke! >= noktalar[0].bloke!

  return {
    id: 'bloke',
    onem: dusmuyor ? 'uyari' : 'bilgi',
    baslik: dusmuyor ? 'Bloke görevler çözülmüyor' : 'Bloke görev var',
    cumle: dusmuyor
      ? `${bloke} görev bloke durumda ve ölçüm başından beri sayı düşmedi.`
      : `${bloke} görev bloke durumda.`,
    kanit: [{ etiket: 'Bloke', deger: bloke }],
    eylem: 'Blokajın sebebini kaydedin; sebebi yazılmayan blokaj takip edilemez.',
    kisiBazli: false,
  }
}

/* ── 7: Birikme (açılan > tamamlanan) ────────────────────────────────────── */

export const birikme: Kural = (g) => {
  const n = g.rapor.trend?.noktalar ?? []
  if (n.length < 4) return null

  const son = n.slice(-4)
  if (!son.every(p => p.olusturulan > p.tamamlanan)) return null

  const acilan = son.reduce((s, p) => s + p.olusturulan, 0)
  const biten  = son.reduce((s, p) => s + p.tamamlanan, 0)
  if (acilan - biten < 3) return null

  return {
    id: 'birikme',
    onem: 'uyari',
    baslik: 'İş birikiyor',
    cumle: `Son dört dönemin hepsinde açılan görev sayısı tamamlanandan fazla. `
         + `Bu tempoda açık iş yükü sürekli büyür.`,
    kanit: [{ etiket: 'Açılan', deger: acilan }, { etiket: 'Tamamlanan', deger: biten }],
    eylem: 'Ya kapasiteyi artırın ya yeni görev açmayı yavaşlatın.',
    kisiBazli: false,
  }
}

/* ── 8: Sessiz il ────────────────────────────────────────────────────────── */

export const sessizIl: Kural = (g) => {
  if (g.ton === 'il') return null   // kendi ilin için anlamsız
  const sifir = g.rapor.ilKirilimi.filter(i => i.toplam > 0 && i.tamamlanan === 0 && i.geciken === 0)
  if (!sifir.length) return null

  const adlar = sifir.slice(0, 3).map(i => i.il).join(', ')
  return {
    id: 'sessiz-il',
    onem: 'bilgi',
    baslik: 'Hareket görülmeyen iller',
    // SUÇLAMAYAN dil: veri girilmemiş olması da mümkün, iş yapılmamış olması da.
    cumle: `${adlar} tarafında bu dönem tamamlanan ya da geciken görev görünmüyor. `
         + `Veri girişi yapılmamış olabilir.`,
    kanit: sifir.slice(0, 3).map(i => ({ etiket: i.il, deger: `${i.toplam} görev` })),
    eylem: 'İlgili sorumlulara görev durumlarını güncellemelerini hatırlatın.',
    kisiBazli: false,
  }
}

/* ── 9: Termin yığılması ─────────────────────────────────────────────────── */

export const terminYigilmasi: Kural = (g) => {
  const yaklasan = g.rapor.yaklasan.length
  if (yaklasan < 4) return null

  const acik = g.rapor.kpi.toplam - g.rapor.kpi.tamamlanan
  if (!acik) return null
  const oran = Math.round((yaklasan / acik) * 100)
  if (oran < 35) return null

  return {
    id: 'termin-yigilmasi',
    onem: 'uyari',
    baslik: 'Önümüzdeki hafta yoğun',
    cumle: `Açık görevlerin %${oran} kadarının (${yaklasan} görev) termini önümüzdeki 7 gün içinde.`,
    kanit: [{ etiket: '7 gün içinde', deger: yaklasan }, { etiket: 'Toplam açık', deger: acik }],
    eylem: 'Hangilerinin gerçekten bu hafta bitmesi gerektiğini şimdi netleştirin.',
    kisiBazli: false,
  }
}

/* ── 10: Veri kalitesi ───────────────────────────────────────────────────── */

export const veriKalitesi: Kural = (g) => {
  const acik = g.rapor.hamListe.filter(t => t.durum !== 'Tamamlandı')
  if (acik.length < 5) return null

  const terminsiz = acik.filter(t => !t.termin).length
  const oran = Math.round((terminsiz / acik.length) * 100)
  if (oran < 30) return null

  return {
    id: 'veri-kalitesi',
    onem: 'bilgi',
    baslik: 'Bu raporun sınırı',
    // Raporun KENDİ sınırını itiraf etmesi güvenilirliği artırır.
    cumle: `Açık görevlerin %${oran} kadarının termini yok. Gecikme ve eğilim `
         + `sayıları bu görevleri kapsamıyor.`,
    kanit: [{ etiket: 'Terminsiz açık görev', deger: terminsiz }, { etiket: 'Toplam açık', deger: acik.length }],
    eylem: 'Termin girilmemiş görevlere tarih ekleyin; aksi halde hiçbir rapor onları göremez.',
    kisiBazli: false,
  }
}

/* ── 11: Tamamlanma oranı ────────────────────────────────────────────────── */

export const tamamlanmaOrani: Kural = (g) => {
  const o = g.rapor.kpi.tamamlanmaOrani
  if (g.rapor.kpi.toplam < 5) return null
  if (o >= 40 && o < 85) return null

  const dusuk = o < 40
  return {
    id: 'tamamlanma-orani',
    onem: dusuk ? 'uyari' : 'olumlu',
    baslik: dusuk ? 'Tamamlanma oranı düşük' : 'Tamamlanma oranı yüksek',
    cumle: dusuk
      ? `Bu dönemin tamamlanma oranı %${o}. Görevlerin büyük kısmı hâlâ açık.`
      : `Bu dönemin tamamlanma oranı %${o}.`,
    kanit: [
      { etiket: 'Tamamlanan', deger: g.rapor.kpi.tamamlanan },
      { etiket: 'Toplam', deger: g.rapor.kpi.toplam },
    ],
    eylem: dusuk ? 'Açık görevlerin gerçekten bu döneme ait olup olmadığını gözden geçirin.' : null,
    kisiBazli: false,
  }
}

/* ── 12: Risk sinyali köprüsü ────────────────────────────────────────────── */

export const riskKopru: Kural = (g) => {
  const r = g.rapor.risk
  if (!r || !r.sinyaller.length) return null

  const kritik = r.sinyaller.find(s => s.seviye === 'high')
  if (!kritik) return null

  return {
    id: 'risk-kopru',
    onem: 'kritik',
    baslik: kritik.baslik,
    cumle: kritik.detay,
    kanit: [{ etiket: 'Risk skoru', deger: `${r.skor}/100` }],
    // Sinyalin kendi eylem metni zaten "somut sonraki adım" formatında;
    // yeniden yazmıyoruz, sarıyoruz.
    eylem: kritik.eylem,
    kisiBazli: true,
  }
}

export const TUM_KURALLAR: Kural[] = [
  gecikmeArtisi, gecikmeAzalisi, gecikmeYogunlasmasi, kisideYigilma,
  atanmamisKritik, blokeBirikmesi, birikme, sessizIl, terminYigilmasi,
  veriKalitesi, tamamlanmaOrani, riskKopru,
]
