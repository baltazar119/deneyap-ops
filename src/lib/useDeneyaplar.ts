'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { getCachedData, setCachedData, invalidateCache } from '@/lib/pageDataCache'
import type { Deneyap } from '@/types/database'

const anahtar = (orgId: string) => `deneyaplar:${orgId}`

/**
 * Org'un DENEYAP listesi.
 *
 * Okuma doğrudan RLS üzerinden (`deneyaplar_select` = org üyesi); yazma her
 * zaman `/api/org/[slug]/deneyaplar` üzerinden yapılır.
 *
 * Önbellek `pageDataCache` (bellek içi, 45sn) — sessionStorage'a YAZILMIYOR.
 * Gerekçe: DENEYAP listesi bir org'un yapısal verisi ve yönetim ekranından
 * değişebiliyor; sekmeler arası kalıcı bir kopya "sildim ama hâlâ duruyor"
 * şikâyeti üretirdi. orgContext'in sessionStorage cache'i kullanıcının kendi
 * rol/il bilgisi içindir, bu ondan farklı.
 */
export function useDeneyaplar(orgId: string | null | undefined) {
  const ilkCache = orgId ? getCachedData<Deneyap[]>(anahtar(orgId)) : null

  const [deneyaplar, setDeneyaplar] = useState<Deneyap[]>(ilkCache ?? [])
  const [yukleniyor, setYukleniyor] = useState(ilkCache === null)
  const [hata, setHata] = useState<string | null>(null)

  const yukle = useCallback(async () => {
    if (!orgId) { setYukleniyor(false); return }
    const { data, error } = await supabase
      .from('deneyaplar')
      .select('*')
      .eq('organization_id', orgId)
      .order('il')
      .order('ad')

    if (error) {
      // Tablo henüz yoksa (060 uygulanmadıysa) ekranı çökertme: DENEYAP
      // seçicisi "DENEYAP yok" durumuna düşer ve il seçimi çalışmaya devam
      // eder. Geriye dönük uyumun arayüz tarafı.
      console.error('[useDeneyaplar]', error)
      setHata('DENEYAP listesi alınamadı.')
      setDeneyaplar([])
    } else {
      const liste = (data ?? []) as Deneyap[]
      setDeneyaplar(liste)
      setCachedData(anahtar(orgId), liste)
      setHata(null)
    }
    setYukleniyor(false)
  }, [orgId])

  useEffect(() => { yukle() }, [yukle])

  /** Yazma sonrası çağrılır — önbelleği düşürüp yeniden okur. */
  const yenile = useCallback(async () => {
    if (orgId) invalidateCache(anahtar(orgId))
    await yukle()
  }, [orgId, yukle])

  return { deneyaplar, yukleniyor, hata, yenile }
}
