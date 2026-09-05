'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { gecikmisMi, yaklasanMi } from '@/lib/gorevTermin'
import { gorunumCoz, varsayilanGorunum, type GorunumId, type GorunumBaglami } from '@/lib/gorevGorunumleri'
import type { Task, TaskStatus, TaskPriority, TaskType } from '@/types/database'

export type TerminFiltresi = 'all' | 'geciken' | 'yaklasan'

/**
 * "Kimseye atanmamış" için ayrı sabit.
 *
 * Faz 2 öncesi bu seçenek boş metin (`''`) gönderiyordu ve `assignee_id`
 * `null` olduğu için hiçbir görevle eşleşmiyordu — seçenek seçilince liste
 * sessizce boşalıyordu. `il` filtresindeki boş-değer semantiği ise URL'de
 * anlamlı olduğu için orada boş metin KORUNUYOR; ikisi bilerek farklı.
 */
export const ATANMAMIS = '__atanmamis__'

export interface GorevFiltreDegerleri {
  status: TaskStatus | 'all'
  priority: TaskPriority | 'all'
  type: TaskType | 'all'
  /**
   * ÜÇ AYRI ANLAM — refactor'da en kolay kaybedilen ayrım:
   *   'all' → il filtresi yok
   *   ''    → "İl atanmamış" (il alanı boş olan görevler)
   *   'Ankara' → o il
   * URL'de `?il=` (boş değer) ikinci anlamı taşır, `?il` hiç yoksa birincisi.
   */
  il: string
  termin: TerminFiltresi
  /** 'all' | ATANMAMIS | üye id'si */
  assignee: string
}

const VARSAYILAN: GorevFiltreDegerleri = {
  status: 'all', priority: 'all', type: 'all', il: 'all', termin: 'all', assignee: 'all',
}

/** Panelde "Filtrele · 3" rozetinde gösterilen sayı. */
export function aktifFiltreSayisi(f: GorevFiltreDegerleri): number {
  return (Object.keys(VARSAYILAN) as (keyof GorevFiltreDegerleri)[])
    .filter(k => f[k] !== VARSAYILAN[k]).length
}

/**
 * URL sorgu dizesini kurar. Varsayılanlar YAZILMAZ — adres çubuğu
 * paylaşılabilir kalsın ve "temiz durum" gerçekten temiz görünsün.
 */
export function urlSorgusuKur(
  f: GorevFiltreDegerleri, gorunum: GorunumId, q: string, varsayilanGorunumId: GorunumId,
): string {
  const p = new URLSearchParams()
  // Boş metin de anlamlı bir değer olduğu için 'all' ile karşılaştırılıyor,
  // truthy kontrolüyle değil — `?il=` kaybolmamalı.
  if (f.il !== 'all') p.set('il', f.il)
  if (f.status !== 'all') p.set('durum', f.status)
  if (f.priority !== 'all') p.set('oncelik', f.priority)
  if (f.type !== 'all') p.set('tur', f.type)
  if (f.termin !== 'all') p.set('termin', f.termin)
  if (f.assignee !== 'all') p.set('atanan', f.assignee)
  if (gorunum !== varsayilanGorunumId) p.set('gorunum', gorunum)
  if (q.trim()) p.set('q', q.trim())
  return p.toString()
}

function ilkFiltreler(sp: URLSearchParams): GorevFiltreDegerleri {
  return {
    ...VARSAYILAN,
    // Operasyon Riski gibi ekranlardan "?il=Ankara" ile gelindiğinde filtre
    // önceden uygulanmış olsun — kullanıcı elle tekrar seçmek zorunda kalmasın.
    il:       sp.get('il') ?? 'all',
    status:   (sp.get('durum') as TaskStatus) ?? 'all',
    priority: (sp.get('oncelik') as TaskPriority) ?? 'all',
    type:     (sp.get('tur') as TaskType) ?? 'all',
    termin:   (sp.get('termin') as TerminFiltresi) ?? 'all',
    assignee: sp.get('atanan') ?? 'all',
  }
}

/**
 * Görevler ekranının filtre + görünüm + arama durumu ve URL senkronu.
 *
 * Süzme mantığı saf fonksiyonlarda tutuluyor (`gorevleriSuz`) ki hook'suz
 * test edilebilsin.
 */
export function useGorevFiltreleri(baglam: GorunumBaglami) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [filtreler, setFiltreler] = useState<GorevFiltreDegerleri>(() => ilkFiltreler(searchParams))
  const [gorunum, setGorunum] = useState<GorunumId>(() => gorunumCoz(searchParams.get('gorunum'), baglam))
  const [q, setQ] = useState(() => searchParams.get('q') ?? '')

  // Arama girdisi anında yazılır, süzme 150ms sonra uygulanır — her tuş
  // vuruşunda listeyi yeniden kurmak yazmayı takılmalı hissettiriyordu.
  const [qUygulanan, setQUygulanan] = useState(q)
  useEffect(() => {
    const t = setTimeout(() => setQUygulanan(q), 150)
    return () => clearTimeout(t)
  }, [q])

  // Rol geç geldiğinde (org context yüklenirken) varsayılan görünüm
  // düzeltilir; kullanıcı bu arada bir görünüm seçtiyse ona dokunulmaz.
  const rolUygulandi = useRef(false)
  useEffect(() => {
    if (rolUygulandi.current || !baglam.role) return
    rolUygulandi.current = true
    if (!searchParams.get('gorunum')) setGorunum(varsayilanGorunum(baglam.role))
  }, [baglam.role, searchParams])

  const varsayilanGorunumId = varsayilanGorunum(baglam.role)

  // URL'i duruma göre güncelle. `replace` + `scroll:false`: filtre değiştirmek
  // geri tuşunu kirletmemeli ve sayfayı başa sarmamalı.
  const ilkRender = useRef(true)
  useEffect(() => {
    if (ilkRender.current) { ilkRender.current = false; return }
    const sorgu = urlSorgusuKur(filtreler, gorunum, qUygulanan, varsayilanGorunumId)
    router.replace(sorgu ? `?${sorgu}` : window.location.pathname, { scroll: false })
  }, [filtreler, gorunum, qUygulanan, varsayilanGorunumId, router])

  const ayarla = useCallback(
    <K extends keyof GorevFiltreDegerleri>(alan: K, deger: GorevFiltreDegerleri[K]) =>
      setFiltreler(onceki => ({ ...onceki, [alan]: deger })),
    [],
  )

  const temizle = useCallback(() => setFiltreler(VARSAYILAN), [])

  const filtreSayisi = aktifFiltreSayisi(filtreler)

  return {
    filtreler, ayarla, temizle,
    aktifMi: filtreSayisi > 0,
    filtreSayisi,
    gorunum, setGorunum,
    q, setQ, qUygulanan,
  }
}

/** Saf süzgeç — hook'suz test edilebilsin diye ayrı. */
export function gorevleriSuz<T extends Task>(gorevler: T[], f: GorevFiltreDegerleri): T[] {
  return gorevler.filter(t => {
    if (f.status !== 'all' && t.status !== f.status) return false
    if (f.priority !== 'all' && t.priority !== f.priority) return false
    if (f.type !== 'all' && t.task_type !== f.type) return false
    if (f.il !== 'all' && (t.il ?? '') !== f.il) return false
    if (f.termin === 'geciken' && !gecikmisMi(t)) return false
    if (f.termin === 'yaklasan' && !yaklasanMi(t)) return false
    if (f.assignee === ATANMAMIS) { if (t.assignee_id) return false }
    else if (f.assignee !== 'all' && t.assignee_id !== f.assignee) return false
    return true
  })
}

export { VARSAYILAN as VARSAYILAN_FILTRELER }
