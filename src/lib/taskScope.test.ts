import { describe, it, expect } from 'vitest'
import {
  tumGorevleriGorurMu,
  gorevKapsamdaMi,
  kapsamaGoreSuz,
  postgrestDegerKacir,
  taskScopeOrFilter,
  type TaskScope,
} from './taskScope'
import { gorevListesiGorebilirMi, raporGorebilirMi, yazabilirMi } from './roller'

const BEN = 'user-1'
const BASKASI = 'user-2'

function kapsam(role: TaskScope['role'], il: string | null = null): TaskScope {
  return { role, userId: BEN, il }
}

function gorev(assignee_id: string | null, il: string | null) {
  return { assignee_id, il }
}

describe('tumGorevleriGorurMu', () => {
  it('yalnızca İl Sorumlusu (member) kısıtlanır', () => {
    expect(tumGorevleriGorurMu('owner')).toBe(true)
    expect(tumGorevleriGorurMu('admin')).toBe(true)
    expect(tumGorevleriGorurMu('viewer')).toBe(true)
    expect(tumGorevleriGorurMu('consultant')).toBe(true)
    expect(tumGorevleriGorurMu('member')).toBe(false)
  })
})

describe('gorevKapsamdaMi', () => {
  it('Merkez Operasyon başka ilin, başkasına atanmış görevini görür', () => {
    expect(gorevKapsamdaMi(gorev(BASKASI, 'İzmir'), kapsam('owner', 'Ankara'))).toBe(true)
  })

  it('İl Sorumlusu kendi ilinin, başkasına atanmış görevini görür', () => {
    expect(gorevKapsamdaMi(gorev(BASKASI, 'Ankara'), kapsam('member', 'Ankara'))).toBe(true)
  })

  it('İl Sorumlusu başka ilin görevini GÖRMEZ', () => {
    expect(gorevKapsamdaMi(gorev(BASKASI, 'İzmir'), kapsam('member', 'Ankara'))).toBe(false)
  })

  it('İl Sorumlusu kendine atanmış görevi ili farklı olsa da görür', () => {
    expect(gorevKapsamdaMi(gorev(BEN, 'İzmir'), kapsam('member', 'Ankara'))).toBe(true)
  })

  it('ili tanımsız İl Sorumlusu yalnızca kendine atananları görür', () => {
    expect(gorevKapsamdaMi(gorev(BEN, 'Ankara'), kapsam('member', null))).toBe(true)
    expect(gorevKapsamdaMi(gorev(BASKASI, 'Ankara'), kapsam('member', null))).toBe(false)
  })

  it('ili boş görev, İl Sorumlusuna atanmadıysa görünmez', () => {
    expect(gorevKapsamdaMi(gorev(BASKASI, null), kapsam('member', 'Ankara'))).toBe(false)
  })
})

describe('kapsamaGoreSuz', () => {
  const gorevler = [
    gorev(BEN, 'Ankara'),
    gorev(BASKASI, 'Ankara'),
    gorev(BASKASI, 'İzmir'),
    gorev(null, 'Bursa'),
    gorev(null, null),
  ]

  it('tam yetkili rolde diziyi aynen döndürür', () => {
    expect(kapsamaGoreSuz(gorevler, kapsam('admin'))).toHaveLength(5)
  })

  it('İl Sorumlusu için yalnızca kendi ili + kendine atananlar kalır', () => {
    const sonuc = kapsamaGoreSuz(gorevler, kapsam('member', 'Ankara'))
    expect(sonuc).toHaveLength(2)
    expect(sonuc.every(t => t.il === 'Ankara')).toBe(true)
  })
})

describe('postgrestDegerKacir', () => {
  it('değeri çift tırnağa alır', () => {
    expect(postgrestDegerKacir('Ankara')).toBe('"Ankara"')
  })

  it('boşluklu il adını bozmadan sarar', () => {
    expect(postgrestDegerKacir('Genel Merkez')).toBe('"Genel Merkez"')
  })

  it('Türkçe karakterleri olduğu gibi bırakır', () => {
    expect(postgrestDegerKacir('Hakkâri')).toBe('"Hakkâri"')
    expect(postgrestDegerKacir('Şanlıurfa')).toBe('"Şanlıurfa"')
  })

  it('virgülü tırnak içine hapseder — ayırıcı sanılmasın', () => {
    expect(postgrestDegerKacir('a,b')).toBe('"a,b"')
  })

  it('çift tırnak ve ters bölüyü kaçırır', () => {
    expect(postgrestDegerKacir('a"b')).toBe('"a\\"b"')
    expect(postgrestDegerKacir('a\\b')).toBe('"a\\\\b"')
  })
})

describe('taskScopeOrFilter', () => {
  it('tam yetkili rollerde filtre üretmez', () => {
    expect(taskScopeOrFilter(kapsam('owner', 'Ankara'))).toBeNull()
    expect(taskScopeOrFilter(kapsam('viewer'))).toBeNull()
  })

  it('ili olmayan İl Sorumlusu için yalnızca atama filtresi üretir', () => {
    expect(taskScopeOrFilter(kapsam('member', null))).toBe(`assignee_id.eq.${BEN}`)
  })

  it('ili olan İl Sorumlusu için atama VEYA il filtresi üretir', () => {
    expect(taskScopeOrFilter(kapsam('member', 'Ankara')))
      .toBe(`assignee_id.eq.${BEN},il.eq."Ankara"`)
  })

  it('boşluklu il adı tırnaklanır — aksi halde PostgREST sessizce yanlış sonuç döner', () => {
    expect(taskScopeOrFilter(kapsam('member', 'Genel Merkez')))
      .toBe(`assignee_id.eq.${BEN},il.eq."Genel Merkez"`)
  })
})

// ── Faz 3 koruması ────────────────────────────────────────────────────────
// Kullanıcı kararı: "İl Sorumlusu kapsamı İL seviyesinde KALIR — kimse
// gördüğü görevi kaybetmesin." `deneyap_id` eklendi ama kapsam kuralına
// GİRMEDİ. Bu testler o kararı kilitler; taskScope'a deneyap eklemek isteyen
// bir değişiklik burada durur.
describe('deneyap_id kapsam kuralını DEĞİŞTİRMEZ', () => {
  it('İl Sorumlusu, başka bir DENEYAP\'a bağlı olsa da kendi ilinin görevlerini görür', () => {
    const gorev = { assignee_id: BASKASI, il: 'Ankara', deneyap_id: 'baska-deneyap' }
    expect(gorevKapsamdaMi(gorev, kapsam('member', 'Ankara'))).toBe(true)
  })

  it('deneyap_id null olan görev de aynı şekilde görünür', () => {
    const gorev = { assignee_id: BASKASI, il: 'Ankara', deneyap_id: null }
    expect(gorevKapsamdaMi(gorev, kapsam('member', 'Ankara'))).toBe(true)
  })

  it('başka ilin görevi, DENEYAP eşleşse bile görünmez', () => {
    const gorev = { assignee_id: BASKASI, il: 'İzmir', deneyap_id: 'ayni-deneyap' }
    expect(gorevKapsamdaMi(gorev, kapsam('member', 'Ankara'))).toBe(false)
  })

  it('süzme sonucu deneyap_id eklenmeden öncekiyle birebir aynı', () => {
    const gorevler = [
      { id: 'a', assignee_id: BASKASI, il: 'Ankara', deneyap_id: 'd1' },
      { id: 'b', assignee_id: BASKASI, il: 'İzmir',  deneyap_id: 'd2' },
      { id: 'c', assignee_id: BEN,     il: 'İzmir',  deneyap_id: null },
    ]
    const deneyapsiz = gorevler.map(({ deneyap_id: _yok, ...g }) => g)
    const kap = kapsam('member', 'Ankara')
    expect(kapsamaGoreSuz(gorevler, kap).map(g => g.id))
      .toEqual(kapsamaGoreSuz(deneyapsiz, kap).map(g => g.id))
  })
})

// ── Faz 4b: Görevler sayfası İl Sorumlusuna açıldı ────────────────────────
// Yetki genişletmesi AYRI bir kuralla yapıldı. Bu testler, kuralın yanlışlıkla
// `raporGorebilirMi` üzerinden genişletilmesini yakalar: öyle olsaydı Panel ve
// Operasyon Riski de sessizce açılırdı.
describe('gorevListesiGorebilirMi — dar kapsamlı yetki', () => {
  it('İl Sorumlusu görev listesini görebilir', () => {
    expect(gorevListesiGorebilirMi('member')).toBe(true)
  })

  it('rapor görebilen roller de görebilir', () => {
    expect(gorevListesiGorebilirMi('owner')).toBe(true)
    expect(gorevListesiGorebilirMi('admin')).toBe(true)
    expect(gorevListesiGorebilirMi('viewer')).toBe(true)
  })

  it('Danışman ve rolsüz kullanıcı göremez', () => {
    expect(gorevListesiGorebilirMi('consultant')).toBe(false)
    expect(gorevListesiGorebilirMi(null)).toBe(false)
  })

  it('Panel/Risk yetkisi (raporGorebilirMi) GENİŞLEMEDİ', () => {
    expect(raporGorebilirMi('member')).toBe(false)
  })

  it('İl Sorumlusu hâlâ yazamaz — liste salt okunur', () => {
    expect(yazabilirMi('member')).toBe(false)
  })
})

describe('sorgu filtresi ile gösterim filtresi aynı kuralı verir', () => {
  // Sayfa artık kapsamı SORGUDA da uyguluyor (member org'un tamamını
  // indirmesin). İki yolun ayrışması, indirilenden farklı bir liste
  // göstermek demek olurdu.
  it('İl Sorumlusu için PostgREST filtresi kendi ili + kendi görevleri', () => {
    // İl değeri TIRNAKLANIR — yanlış tırnaklama PostgREST'te hata vermez,
    // sessizce yanlış sonuç verir; bu yüzden literal olarak kilitli.
    expect(taskScopeOrFilter(kapsam('member', 'Ankara')))
      .toBe(`assignee_id.eq.${BEN},il.eq."Ankara"`)
  })

  it('boşluklu il adı da güvenli tırnaklanır', () => {
    expect(taskScopeOrFilter(kapsam('member', 'Genel Merkez')))
      .toBe(`assignee_id.eq.${BEN},il.eq."Genel Merkez"`)
  })

  it('tüm görevleri gören roller için filtre üretilmez', () => {
    expect(taskScopeOrFilter(kapsam('owner', 'Ankara'))).toBeNull()
    expect(taskScopeOrFilter(kapsam('viewer'))).toBeNull()
  })
})
