import { TUM_KURALLAR } from './kurallar'
import { ONEM_SIRASI, tonSec, type Yorum, type YorumGirdisi, type YorumSonucu } from './tipler'
import type { RaporVerisi } from '@/lib/rapor/hesapla'
import type { RaporKapsami } from '@/lib/rapor/kapsam'
import type { OrgRole } from '@/types/database'

/**
 * Yorum üretimi — SAF fonksiyon.
 *
 * İki güvenlik kuralı burada uygulanır:
 *
 * 1. KİŞİ ADI SIZINTISI: `kisiBazliVeri` false ise `kisiBazli` bayraklı
 *    kurallar HİÇ ÇALIŞTIRILMAZ. Metinden isim silmeye çalışmak (regex,
 *    maskeleme) er ya da geç kaçırır; kuralı hiç çalıştırmamak kesin çözüm.
 *
 * 2. BOŞ BLOK: hiçbir kural tetiklenmezse "dikkat çeken sapma yok" +
 *    en büyük iki sayı gösterilir. Boş bir yorum kutusu kullanıcıya
 *    "bu özellik çalışmıyor" hissi verir.
 */

const EN_FAZLA_YORUM = 6

export function yorumUret(g: YorumGirdisi): YorumSonucu {
  const yorumlar: Yorum[] = []

  for (const kural of TUM_KURALLAR) {
    let y: Yorum | null = null
    try {
      y = kural(g)
    } catch {
      // Tek bir kuralın patlaması tüm yorum bloğunu düşürmemeli.
      continue
    }
    if (!y) continue
    // YAPISAL filtre — metin temizliği DEĞİL
    if (y.kisiBazli && !g.kisiBazliVeri) continue
    yorumlar.push(y)
  }

  yorumlar.sort((a, b) => ONEM_SIRASI[a.onem] - ONEM_SIRASI[b.onem])
  const secili = yorumlar.slice(0, EN_FAZLA_YORUM)

  return { ozet: ozetUret(secili, g), yorumlar: secili }
}

/** En fazla üç cümlelik yönetici özeti */
function ozetUret(yorumlar: Yorum[], g: YorumGirdisi): string {
  const kritik = yorumlar.filter(y => y.onem === 'kritik').length
  const uyari  = yorumlar.filter(y => y.onem === 'uyari').length

  if (!yorumlar.length) {
    // Fallback: hiçbir kural tetiklenmedi. Boş blok GÖSTERİLMEZ.
    const k = g.rapor.kpi
    return `Bu dönemde dikkat çeken bir sapma yok. `
         + `${k.toplam} görevin ${k.tamamlanan} tanesi tamamlandı (%${k.tamamlanmaOrani})`
         + `${k.geciken ? `, ${k.geciken} görev termini aştı` : ''}.`
  }

  const parcalar: string[] = []

  if (kritik || uyari) {
    const sayilar = [
      kritik ? `${kritik} acil` : null,
      uyari ? `${uyari} dikkat gerektiren` : null,
    ].filter(Boolean).join(', ')
    parcalar.push(`${sayilar} konu var.`)
  } else {
    parcalar.push('Acil bir konu görünmüyor.')
  }

  // En yüksek öncelikli yorumun cümlesi özete girer
  parcalar.push(yorumlar[0].cumle)

  const olumlu = yorumlar.find(y => y.onem === 'olumlu')
  if (olumlu && parcalar.length < 3) parcalar.push(olumlu.cumle)

  return parcalar.join(' ')
}

/** Rapor + kapsamdan girdiyi kurar — çağıranların tekrar etmemesi için */
export function yorumGirdisiKur(
  rapor: RaporVerisi,
  rol: OrgRole | null,
  kapsam: Pick<RaporKapsami, 'kisiBazliVeri' | 'ilFiltresi'>,
): YorumGirdisi {
  return {
    rapor,
    rol,
    ton: tonSec(rol),
    kisiBazliVeri: kapsam.kisiBazliVeri,
    tekIl: kapsam.ilFiltresi?.length === 1 ? kapsam.ilFiltresi[0] : null,
  }
}
