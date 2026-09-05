import { describe, it, expect } from 'vitest'
import { aranabilirMetin, aramaTokenlari, aramaEslesirMi, gorevleriAra } from './gorevArama'
import type { Task } from '@/types/database'

function gorev(p: Partial<Task> & { id: string; title: string }): Task & { assigneeName?: string } {
  return { status: 'backlog', priority: 'normal', task_type: 'other', il: null, assignee_id: null, due_date: null, description: null, ...p } as Task
}

const GOREVLER = [
  { ...gorev({ id: 'a', title: 'Ankara dönem raporu', il: 'Ankara' }), assigneeName: 'Ayşe Yılmaz' },
  { ...gorev({ id: 'b', title: 'İzmir 3D yazıcı bakımı', il: 'İzmir', description: 'Yedek parça bekleniyor' }), assigneeName: 'Selin Koç' },
  { ...gorev({ id: 'c', title: 'Şanlıurfa atölye açılışı', il: 'Şanlıurfa' }), assigneeName: undefined },
]

const idler = (t: { id: string }[]) => t.map(x => x.id).sort()

describe('Türkçe katlama', () => {
  it('büyük İ ve ı aynı sonuca katlanır ("İSTANBUL" → "i-stanbul" hatası)', () => {
    expect(aramaTokenlari('İZMİR')).toEqual(['izmir'])
    expect(aramaTokenlari('izmir')).toEqual(['izmir'])
    expect(aramaTokenlari('Izmir')).toEqual(['izmir'])
  })

  it('ş ğ ü ö ç ASCII karşılığına iner', () => {
    expect(aramaTokenlari('Şanlıurfa Ağrı Gümüşhane Çorum Öz'))
      .toEqual(['sanliurfa', 'agri', 'gumushane', 'corum', 'oz'])
  })

  it('aranabilir metin başlık, açıklama, il ve atananı kapsar', () => {
    const m = aranabilirMetin(GOREVLER[1])
    expect(m).toContain('izmir')
    expect(m).toContain('yedek parca')
    expect(m).toContain('selin koc')
  })
})

describe('token AND eşleşmesi', () => {
  it('birden fazla kelimenin HEPSİ geçmeli', () => {
    expect(idler(gorevleriAra(GOREVLER, 'ankara rapor'))).toEqual(['a'])
    // "ankara" var ama "yazici" yok → eşleşmemeli
    expect(gorevleriAra(GOREVLER, 'ankara yazici')).toEqual([])
  })

  it('kelime sırası önemsiz', () => {
    expect(idler(gorevleriAra(GOREVLER, 'rapor ankara'))).toEqual(['a'])
  })

  it('boş sorgu hiçbir şey elemez', () => {
    expect(gorevleriAra(GOREVLER, '').length).toBe(3)
    expect(gorevleriAra(GOREVLER, '   ').length).toBe(3)
  })

  it('kısmi kelime eşleşir (ön ek araması)', () => {
    expect(idler(gorevleriAra(GOREVLER, 'yazi'))).toEqual(['b'])
  })

  it('kişi adıyla da bulunur', () => {
    expect(idler(gorevleriAra(GOREVLER, 'selin'))).toEqual(['b'])
  })

  it('Türkçe karakter yazmadan da bulunur', () => {
    expect(idler(gorevleriAra(GOREVLER, 'sanliurfa atolye'))).toEqual(['c'])
  })

  it('atanan adı olmayan görev arama sırasında çökmez', () => {
    expect(() => aranabilirMetin(GOREVLER[2])).not.toThrow()
  })
})

describe('aramaEslesirMi — sıcak yol', () => {
  it('önceden katlanmış metinle aynı sonucu verir', () => {
    const metin = aranabilirMetin(GOREVLER[0])
    expect(aramaEslesirMi(metin, aramaTokenlari('ankara rapor'))).toBe(true)
    expect(aramaEslesirMi(metin, aramaTokenlari('izmir'))).toBe(false)
    expect(aramaEslesirMi(metin, [])).toBe(true)
  })
})
