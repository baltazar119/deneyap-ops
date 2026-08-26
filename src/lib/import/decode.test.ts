import { describe, it, expect } from 'vitest'
import { csvCoz, ayiriciTahmin } from './decode'

/** windows-1254 tek baytlı Türkçe kodlaması — test için gereken harfler */
const CP1254: Record<string, number> = {
  'Ş': 0xDE, 'ş': 0xFE, 'İ': 0xDD, 'ı': 0xFD,
  'Ğ': 0xD0, 'ğ': 0xF0, 'Ç': 0xC7, 'ç': 0xE7,
  'Ö': 0xD6, 'ö': 0xF6, 'Ü': 0xDC, 'ü': 0xFC,
}

function cp1254Kodla(s: string): Uint8Array {
  return new Uint8Array([...s].map(ch => CP1254[ch] ?? ch.charCodeAt(0)))
}

function utf8Kodla(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

describe('csvCoz', () => {
  it('UTF-8 BOM\'lu dosyayı BOM\'u atarak okur', () => {
    const govde = utf8Kodla('Görev;İl\nTest;Ankara')
    const buf = new Uint8Array([0xEF, 0xBB, 0xBF, ...govde])
    const s = csvCoz(buf)
    expect(s.kodlama).toBe('utf-8 (BOM)')
    expect(s.metin.startsWith('Görev')).toBe(true)
  })

  it('BOM\'suz UTF-8 dosyayı doğru okur', () => {
    const s = csvCoz(utf8Kodla('Görev;İl\nŞanlıurfa işi;Şanlıurfa'))
    expect(s.kodlama).toBe('utf-8')
    expect(s.metin).toContain('Şanlıurfa')
  })

  it('Türkçe Excel\'in windows-1254 çıktısını kurtarır', () => {
    // Bu senaryo ele alınmazsa "Şanlıurfa" bozuk çıkar ve başlıklar eşleşmez
    const s = csvCoz(cp1254Kodla('Görev;İl\nTest;Şanlıurfa'))
    expect(s.kodlama).toBe('windows-1254')
    expect(s.metin).toContain('Şanlıurfa')
    expect(s.metin).toContain('Görev')
    expect(s.metin).not.toContain('�')
  })

  it('kullanıcıya gösterilecek bir varsayım notu döndürür', () => {
    expect(csvCoz(utf8Kodla('a;b')).not).toBeTruthy()
  })

  it('sadece ASCII içeren dosyada UTF-8 der', () => {
    const s = csvCoz(utf8Kodla('Task;City\nTest;Ankara'))
    expect(s.kodlama).toBe('utf-8')
  })
})

describe('ayiriciTahmin', () => {
  it('Türkçe Excel\'in noktalı virgülünü seçer', () => {
    expect(ayiriciTahmin('Görev;İl;Durum\nA;B;C')).toBe(';')
  })

  it('virgüllü dosyayı tanır', () => {
    expect(ayiriciTahmin('Gorev,Il,Durum\nA,B,C')).toBe(',')
  })

  it('sekmeli dosyayı tanır', () => {
    expect(ayiriciTahmin('Gorev\tIl\tDurum')).toBe('\t')
  })

  it('tek sütunlu dosyada noktalı virgüle düşer', () => {
    expect(ayiriciTahmin('Görev\nTest')).toBe(';')
  })

  it('yalnızca ilk satıra bakar — veri satırındaki virgül yanıltmaz', () => {
    // Başlık ; ile ayrılmış ama açıklama içinde virgüller var
    expect(ayiriciTahmin('Görev;Açıklama\nA;"x, y, z, t, u"')).toBe(';')
  })
})
