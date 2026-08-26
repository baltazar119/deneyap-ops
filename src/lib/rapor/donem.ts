import type { Donem } from './hesapla'

/** Yerel tarih → YYYY-MM-DD. toISOString UTC+3'te bir gün geri kaydırır. */
export function yerelGun(d: Date): string {
  const iki = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${iki(d.getMonth() + 1)}-${iki(d.getDate())}`
}

const AYLAR = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
               'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık']

export type DonemAnahtari = 'bu-hafta' | 'gecen-hafta' | 'bu-ay' | 'gecen-ay' | 'ceyrek' | 'tumu'

export function donemCoz(anahtar: DonemAnahtari, bugun = new Date()): Donem {
  const g = new Date(bugun); g.setHours(0, 0, 0, 0)

  const haftaBasi = (d: Date) => {
    const r = new Date(d)
    r.setDate(d.getDate() - ((d.getDay() + 6) % 7))   // Pazartesi
    return r
  }

  switch (anahtar) {
    case 'bu-hafta': {
      const b = haftaBasi(g); const s = new Date(b); s.setDate(b.getDate() + 6)
      return { baslangic: yerelGun(b), bitis: yerelGun(s), etiket: `${b.getDate()}–${s.getDate()} ${AYLAR[s.getMonth()]} ${s.getFullYear()}` }
    }
    case 'gecen-hafta': {
      const b = haftaBasi(g); b.setDate(b.getDate() - 7)
      const s = new Date(b); s.setDate(b.getDate() + 6)
      return { baslangic: yerelGun(b), bitis: yerelGun(s), etiket: `${b.getDate()}–${s.getDate()} ${AYLAR[s.getMonth()]} ${s.getFullYear()}` }
    }
    case 'gecen-ay': {
      const b = new Date(g.getFullYear(), g.getMonth() - 1, 1)
      const s = new Date(g.getFullYear(), g.getMonth(), 0)
      return { baslangic: yerelGun(b), bitis: yerelGun(s), etiket: `${AYLAR[b.getMonth()]} ${b.getFullYear()}` }
    }
    case 'ceyrek': {
      const c = Math.floor(g.getMonth() / 3)
      const b = new Date(g.getFullYear(), c * 3, 1)
      const s = new Date(g.getFullYear(), c * 3 + 3, 0)
      return { baslangic: yerelGun(b), bitis: yerelGun(s), etiket: `${c + 1}. Çeyrek ${g.getFullYear()}` }
    }
    case 'tumu':
      return { baslangic: '2000-01-01', bitis: yerelGun(g), etiket: 'Tüm zamanlar' }
    case 'bu-ay':
    default: {
      const b = new Date(g.getFullYear(), g.getMonth(), 1)
      const s = new Date(g.getFullYear(), g.getMonth() + 1, 0)
      return { baslangic: yerelGun(b), bitis: yerelGun(s), etiket: `${AYLAR[b.getMonth()]} ${b.getFullYear()}` }
    }
  }
}
