import { describe, it, expect } from 'vitest'
import { gunlukOzetHesapla, gune } from './gunlukOzet'
import { seriUret, gunlerArasi, gunEkle, granulariteSec, type OlcumSatiri } from './seri'
import { karsilastir, karsilastirmaMetni, oncekiDonem, GUVENILIR_ESIK } from './karsilastir'
import type { Task } from '@/types/database'

let n = 0
function gorev(o: Partial<Task> & { completed_at?: string | null; deneyap_id?: string | null } = {}): Task {
  n++
  return {
    id: `t${n}`, title: `Görev ${n}`, description: null,
    status: 'backlog', priority: 'normal', task_type: 'other',
    assignee_id: null, start_date: null, due_date: null,
    estimated_hours: null, actual_hours: null, sprint_id: null,
    il: null, organization_id: 'o1', created_by: 'u1',
    created_at: '2026-09-01', updated_at: '2026-09-01',
    ...o,
  } as Task
}

describe('gunlukOzetHesapla', () => {
  const BUGUN = '2026-09-10'

  it('org satırı + il satırları + DENEYAP satırları üretir', () => {
    const r = gunlukOzetHesapla([
      gorev({ il: 'Ankara', deneyap_id: 'd1' }),
      gorev({ il: 'Ankara', deneyap_id: 'd2' }),
      gorev({ il: 'İzmir' }),
    ], BUGUN)

    expect(r.filter(x => x.kirilim === 'org')).toHaveLength(1)
    expect(r.filter(x => x.kirilim === 'il')).toHaveLength(2)
    expect(r.filter(x => x.kirilim === 'deneyap')).toHaveLength(2)
    expect(r.find(x => x.kirilim === 'org')!.toplam).toBe(3)
  })

  it('aynı ildeki iki DENEYAP ayrı satır olur ama il satırı ikisini toplar', () => {
    const r = gunlukOzetHesapla([
      gorev({ il: 'Ankara', deneyap_id: 'd1' }),
      gorev({ il: 'Ankara', deneyap_id: 'd2' }),
    ], BUGUN)
    expect(r.find(x => x.kirilim === 'il' && x.il === 'Ankara')!.toplam).toBe(2)
    expect(r.filter(x => x.kirilim === 'deneyap').every(x => x.toplam === 1)).toBe(true)
  })

  it('gecikmeyi rapor ile AYNI kuralla sayar: termini geçmiş VE tamamlanmamış', () => {
    const r = gunlukOzetHesapla([
      gorev({ status: 'doing', due_date: '2026-09-01' }),
      gorev({ status: 'done',  due_date: '2026-09-01' }),
      gorev({ status: 'doing', due_date: '2026-09-20' }),
    ], BUGUN)
    const org = r[0]
    expect(org.geciken).toBe(1)
    expect(org.gecikme_gun_toplam).toBe(9)
  })

  it('atanmamış kritik görevi ayrıca sayar', () => {
    const r = gunlukOzetHesapla([
      gorev({ priority: 'critical', assignee_id: null }),
      gorev({ priority: 'normal',   assignee_id: null }),
      gorev({ priority: 'critical', assignee_id: 'u1' }),
    ], BUGUN)
    expect(r[0].atanmamis).toBe(2)
    expect(r[0].kritik_atanmamis).toBe(1)
  })

  it('ili olmayan görev org satırına girer ama il satırı üretmez', () => {
    const r = gunlukOzetHesapla([gorev({ il: null })], BUGUN)
    expect(r[0].toplam).toBe(1)
    expect(r.filter(x => x.kirilim === 'il')).toHaveLength(0)
  })

  it('boş listede çökmez', () => {
    const r = gunlukOzetHesapla([], BUGUN)
    expect(r).toHaveLength(1)
    expect(r[0].toplam).toBe(0)
  })
})

describe('gune', () => {
  it('timestamp değerini yerel güne indirger', () => {
    expect(gune('2026-09-10')).toBe('2026-09-10')
    expect(gune(null)).toBeNull()
    expect(gune('gecersiz')).toBeNull()
  })
})

describe('seriUret', () => {
  const OLCUMSUZ: OlcumSatiri[] = []

  it('ölçüm yoksa görev tarihlerinden TÜRETİR', () => {
    const s = seriUret({
      gorevler: [gorev({ created_at: '2026-09-02', status: 'doing' })],
      olcumler: OLCUMSUZ, baslangic: '2026-09-01', bitis: '2026-09-03',
    })
    expect(s).toHaveLength(3)
    expect(s.every(p => p.kaynak === 'turetilmis')).toBe(true)
    expect(s[0].acik).toBe(0)
    expect(s[1].acik).toBe(1)
    expect(s[1].olusturulan).toBe(1)
  })

  it('TÜRETİLEMEYEN metrikler null döner — uydurma veri gösterilmez', () => {
    const s = seriUret({
      gorevler: [gorev({ status: 'blocked' })],
      olcumler: OLCUMSUZ, baslangic: '2026-09-01', bitis: '2026-09-02',
    })
    expect(s[0].bloke).toBeNull()
    expect(s[0].atanmamis).toBeNull()
  })

  it('ölçüm VARSA o gün ölçümü kullanır', () => {
    const olcum: OlcumSatiri = {
      gun: '2026-09-02', acik: 42, geciken: 7,
      yeni_olusturulan: 3, gun_icinde_tamamlanan: 2, bloke: 5, atanmamis: 4,
    }
    const s = seriUret({
      gorevler: [gorev({ created_at: '2026-09-01' })],
      olcumler: [olcum], baslangic: '2026-09-01', bitis: '2026-09-03',
    })
    expect(s[1].kaynak).toBe('olcum')
    expect(s[1].acik).toBe(42)
    expect(s[1].bloke).toBe(5)
    expect(s[0].kaynak).toBe('turetilmis')
    expect(s[0].bloke).toBeNull()
  })

  it('kaynak kararı GÜN BAŞINA verilir — karışık seri olabilir', () => {
    const s = seriUret({
      gorevler: [],
      olcumler: [{ gun: '2026-09-02', acik: 1, geciken: 0, yeni_olusturulan: 0, gun_icinde_tamamlanan: 0, bloke: 0, atanmamis: 0 }],
      baslangic: '2026-09-01', bitis: '2026-09-03',
    })
    expect(s.map(p => p.kaynak)).toEqual(['turetilmis', 'olcum', 'turetilmis'])
  })

  it('görev tamamlandığı GÜNÜN SONUNDA kapalı sayılır', () => {
    // Semantik: ölçüm gün SONUNDA alınır (cron gece çalışır). Görev
    // 2 Eylül'de bittiyse o günün fotoğrafında artık açık değildir,
    // ama "o gün tamamlananlar" akışında görünür.
    const s = seriUret({
      gorevler: [gorev({ created_at: '2026-09-01', status: 'done', completed_at: '2026-09-02' })],
      olcumler: OLCUMSUZ, baslangic: '2026-09-01', bitis: '2026-09-03',
    })
    expect(s[0].acik).toBe(1)         // 1 Eylül: açık
    expect(s[1].acik).toBe(0)         // 2 Eylül: bitti
    expect(s[2].acik).toBe(0)
    expect(s[1].tamamlanan).toBe(1)   // akış metriği: o gün tamamlandı
  })

  it('boş aralıkta boş dizi döner, çökmez', () => {
    expect(seriUret({ gorevler: [], olcumler: [], baslangic: '2026-09-05', bitis: '2026-09-01' })).toEqual([])
  })

  it('haftalık gruplamada durum metrikleri TOPLANMAZ, akış metrikleri toplanır', () => {
    const gorevler = [
      gorev({ created_at: '2026-09-01', status: 'doing' }),
      gorev({ created_at: '2026-09-02', status: 'doing' }),
    ]
    // 31 Ağu Pazartesi — tam bir hafta seçildi. 1-7 Eylül seçilseydi
    // 7 Eylül yeni haftaya düşer ve iki grup çıkardı (haftalar Pazartesi
    // başlar), bu da testin ölçmek istediği şey değil.
    const s = seriUret({
      gorevler, olcumler: [], baslangic: '2026-08-31', bitis: '2026-09-06',
      granularite: 'hafta',
    })
    expect(s).toHaveLength(1)
    expect(s[0].acik).toBe(2)          // son günün değeri, 7 günün toplamı DEĞİL
    expect(s[0].olusturulan).toBe(2)   // akış → toplandı
  })
})

describe('granulariteSec', () => {
  it('aralığa göre seçer', () => {
    expect(granulariteSec(7)).toBe('gun')
    expect(granulariteSec(31)).toBe('gun')
    expect(granulariteSec(90)).toBe('hafta')
    expect(granulariteSec(400)).toBe('ay')
  })
})

describe('gunlerArasi / gunEkle', () => {
  it('ay sınırını doğru geçer', () => {
    expect(gunEkle('2026-08-31', 1)).toBe('2026-09-01')
    expect(gunEkle('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('aralığı kapsayıcı üretir', () => {
    expect(gunlerArasi('2026-09-01', '2026-09-03')).toEqual(['2026-09-01', '2026-09-02', '2026-09-03'])
  })
})

describe('karsilastir — küçük sayı koruması', () => {
  it('önceki dönem eşiğin ALTINDAYSA yüzde üretmez', () => {
    const k = karsilastir(2, 1)
    expect(k.guvenilir).toBe(false)
    expect(k.yuzde).toBeNull()
    expect(k.fark).toBe(1)
    expect(karsilastirmaMetni(k)).toContain('1 görev arttı')
    expect(karsilastirmaMetni(k)).not.toContain('%')
  })

  it('önceki dönem yeterince büyükse yüzde üretir', () => {
    const k = karsilastir(14, 10)
    expect(k.guvenilir).toBe(true)
    expect(k.yuzde).toBe(40)
    expect(karsilastirmaMetni(k)).toContain('%40 arttı')
  })

  it('eşik sınırında', () => {
    expect(karsilastir(6, GUVENILIR_ESIK).guvenilir).toBe(true)
    expect(karsilastir(6, GUVENILIR_ESIK - 1).guvenilir).toBe(false)
  })

  it('sıfıra bölme yapmaz', () => {
    const k = karsilastir(5, 0)
    expect(k.yuzde).toBeNull()
    expect(Number.isFinite(k.fark)).toBe(true)
  })

  it('azalışı doğru yönde okur', () => {
    const k = karsilastir(6, 10)
    expect(k.yon).toBe('azalis')
    expect(karsilastirmaMetni(k)).toContain('azaldı')
  })

  it('değişmediğinde sabit der', () => {
    expect(karsilastir(7, 7).yon).toBe('sabit')
    expect(karsilastirmaMetni(karsilastir(7, 7))).toContain('değişmedi')
  })
})

describe('oncekiDonem', () => {
  it('aynı uzunlukta hemen önceki pencereyi verir', () => {
    expect(oncekiDonem('2026-09-08', '2026-09-14'))
      .toEqual({ baslangic: '2026-09-01', bitis: '2026-09-07' })
  })
  it('ay başında geriye doğru doğru kayar', () => {
    expect(oncekiDonem('2026-09-01', '2026-09-30').bitis).toBe('2026-08-31')
  })
})
