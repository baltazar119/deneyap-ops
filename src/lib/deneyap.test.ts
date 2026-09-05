import { describe, it, expect } from 'vitest'
import {
  deneyapEtiketi, deneyapKisaEtiket, deneyaplariAra, deneyaplariIleGoreGrupla,
  secicideGosterilecekler, adCakisiyorMu, deneyapGorevSayilari,
} from './deneyap'
import { IL_PLAKA, ILLER, ilGecerliMi } from './iller'
import type { Deneyap } from '@/types/database'

function d(p: Partial<Deneyap> & { id: string; ad: string; il: string }): Deneyap {
  return {
    organization_id: 'org-1', ilce: null, kod: null, adres: null, notlar: null,
    aktif: true, created_by: null, created_at: '', updated_at: '',
    ...p,
  } as Deneyap
}

const LISTE = [
  d({ id: 'cankaya',   ad: 'Çankaya DENEYAP',   il: 'Ankara', ilce: 'Çankaya', kod: 'ANK-01' }),
  d({ id: 'kecioren',  ad: 'Keçiören DENEYAP',  il: 'Ankara', ilce: 'Keçiören' }),
  d({ id: 'bornova',   ad: 'Bornova DENEYAP',   il: 'İzmir',  ilce: 'Bornova' }),
  d({ id: 'kapali',    ad: 'Eski DENEYAP',      il: 'Bursa',  aktif: false }),
]

describe('etiketler', () => {
  it('il + ad birleşir', () => {
    expect(deneyapEtiketi(LISTE[0])).toBe('Ankara DENEYAP — Çankaya DENEYAP')
  })

  it('ad zaten "İl DENEYAP" ise tekrar edilmez', () => {
    expect(deneyapEtiketi(d({ id: 'x', ad: 'Ankara DENEYAP', il: 'Ankara' })))
      .toBe('Ankara DENEYAP')
  })

  it('kısa etiket adı tercih eder', () => {
    expect(deneyapKisaEtiket(LISTE[1])).toBe('Keçiören DENEYAP')
  })
})

describe('arama', () => {
  it('Türkçe karakter yazmadan bulur', () => {
    expect(deneyaplariAra(LISTE, 'cankaya').map(x => x.id)).toEqual(['cankaya'])
    expect(deneyaplariAra(LISTE, 'kecioren').map(x => x.id)).toEqual(['kecioren'])
  })

  it('kod ile bulur — Excel dosyalarında çoğu zaman ad değil kod yazıyor', () => {
    expect(deneyaplariAra(LISTE, 'ANK-01').map(x => x.id)).toEqual(['cankaya'])
  })

  it('il adıyla o ilin hepsini getirir', () => {
    expect(deneyaplariAra(LISTE, 'ankara').map(x => x.id).sort()).toEqual(['cankaya', 'kecioren'])
  })

  it('boş sorgu hiçbir şey elemez', () => {
    expect(deneyaplariAra(LISTE, '  ').length).toBe(LISTE.length)
  })
})

describe('il bazlı gruplama', () => {
  it('bir ilde birden fazla DENEYAP aynı grupta toplanır', () => {
    const gruplar = deneyaplariIleGoreGrupla(LISTE)
    const ankara = gruplar.find(g => g.il === 'Ankara')!
    expect(ankara.deneyaplar.map(x => x.id)).toEqual(['cankaya', 'kecioren'])
  })

  it('öncelikli il en başa alınır', () => {
    expect(deneyaplariIleGoreGrupla(LISTE, 'İzmir')[0].il).toBe('İzmir')
  })

  it('öncelik yoksa Türkçe alfabetik sıralanır', () => {
    expect(deneyaplariIleGoreGrupla(LISTE).map(g => g.il)).toEqual(['Ankara', 'Bursa', 'İzmir'])
  })
})

describe('seçicide gösterilecekler', () => {
  it('pasifler gizlenir', () => {
    expect(secicideGosterilecekler(LISTE, null).map(x => x.id)).not.toContain('kapali')
  })

  // Aksi halde kapatılmış bir DENEYAP'a bağlı görevi düzenleyip kaydetmek
  // görevin birimini SESSİZCE siler.
  it('pasif olsa bile SEÇİLİ olan görünür', () => {
    expect(secicideGosterilecekler(LISTE, 'kapali').map(x => x.id)).toContain('kapali')
  })
})

describe('ad çakışması — DB unique kısıtının ikizi', () => {
  it('büyük/küçük harf ve Türkçe fark etmez', () => {
    expect(adCakisiyorMu(LISTE, 'ÇANKAYA DENEYAP')).toBe(true)
    expect(adCakisiyorMu(LISTE, 'cankaya deneyap')).toBe(true)
  })

  it('kaydın kendisi çakışma sayılmaz', () => {
    expect(adCakisiyorMu(LISTE, 'Çankaya DENEYAP', 'cankaya')).toBe(false)
  })

  it('farklı ad çakışmaz', () => {
    expect(adCakisiyorMu(LISTE, 'Mamak DENEYAP')).toBe(false)
  })
})

describe('görev sayıları', () => {
  it('deneyap_id null olanlar sayılmaz', () => {
    expect(deneyapGorevSayilari([
      { deneyap_id: 'cankaya' }, { deneyap_id: 'cankaya' },
      { deneyap_id: null }, { deneyap_id: 'bornova' },
    ])).toEqual({ cankaya: 2, bornova: 1 })
  })
})

describe('IL_PLAKA — Faz 11 haritasının anahtarı', () => {
  it('81 il, 1-81 arası eksiksiz plaka', () => {
    const kodlar = Object.values(IL_PLAKA).sort((a, b) => a - b)
    expect(kodlar.length).toBe(81)
    expect(kodlar).toEqual(Array.from({ length: 81 }, (_, i) => i + 1))
  })

  it('ILLER listesiyle 81↔81 birebir eşleşir', () => {
    const plakaIller = Object.keys(IL_PLAKA)
    expect(plakaIller.length).toBe(ILLER.length)
    expect(ILLER.filter(i => !(i in IL_PLAKA))).toEqual([])
    expect(plakaIller.filter(i => !(ILLER as readonly string[]).includes(i))).toEqual([])
  })

  it('sonradan il olanların kodu alfabetik sıradan türetilemez', () => {
    expect(IL_PLAKA['Aksaray']).toBe(68)
    expect(IL_PLAKA['Düzce']).toBe(81)
    expect(IL_PLAKA['Mersin']).toBe(33)
  })
})

describe('ilGecerliMi — DENEYAP gerçek bir ile bağlı olmalı', () => {
  it('il kabul eder', () => {
    expect(ilGecerliMi('Ankara')).toBe(true)
  })

  it('birimleri ve boşu reddeder', () => {
    expect(ilGecerliMi('Genel Merkez')).toBe(false)
    expect(ilGecerliMi('')).toBe(false)
    expect(ilGecerliMi(null)).toBe(false)
  })
})
