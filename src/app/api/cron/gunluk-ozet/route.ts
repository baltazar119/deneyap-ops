import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cronYetkili } from '@/lib/cronAuth'
import { onbelleksizFetch } from '@/lib/server/supabaseFetch'
import { gunlukOzetHesapla } from '@/lib/ozet/gunlukOzet'
import { computeRisk } from '@/lib/operationRisk'
import { yerelGun } from '@/lib/rapor/donem'
import type { Task, Sprint, Profile } from '@/types/database'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Günlük operasyon fotoğrafını `gunluk_ozet` tablosuna yazar.
 *
 * Trend grafikleri bu tablodan besleniyor. Tablo boşken de grafikler çalışır
 * (görev tarihlerinden türetilir), ama bloke / atanmamış / risk skoru
 * geçmişi YALNIZCA buradan gelebilir — onlar geriye dönük hesaplanamıyor.
 *
 * Idempotent: aynı gün iki kez çalışırsa upsert satırı günceller, kopya
 * oluşmaz (064'teki tekil index).
 *
 * `gunluk` dispatcher'ının EN BAŞINA konur: 50 sn bütçe dolduğunda atlanan
 * son iş bu olmamalı, çünkü kaçırılan bir gün geri getirilemez.
 */

const SAKLAMA_GUN = 400

function servis() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: onbelleksizFetch }, auth: { persistSession: false } },
  )
}

export async function GET(req: NextRequest) {
  if (!cronYetkili(req)) {
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 })
  }

  const db = servis()
  const bugun = yerelGun(new Date())
  const sonuc: { org: string; satir: number; hata?: string }[] = []

  const { data: orglar, error: orgHata } = await db.from('organizations').select('id, slug')
  if (orgHata) {
    // Tablo/kolon yoksa (migration 064 uygulanmamış) sessizce geçmek yerine
    // durumu bildiriyoruz; cron çıktısı tek bakışta okunabilir olmalı.
    return NextResponse.json({ ok: false, hata: orgHata.message }, { status: 500 })
  }

  for (const org of orglar ?? []) {
    try {
      const [gorevRes, sprintRes, uyelikRes, ayarRes] = await Promise.all([
        db.from('tasks').select('*').eq('organization_id', org.id),
        db.from('sprints').select('*').eq('organization_id', org.id),
        db.from('organization_members').select('user_id').eq('organization_id', org.id),
        db.from('automation_settings').select('overload_threshold')
          .eq('organization_id', org.id).maybeSingle(),
      ])

      const gorevler = (gorevRes.data ?? []) as Task[]
      const satirlar = gunlukOzetHesapla(gorevler, bugun)

      // Risk skoru yalnızca org satırına yazılır — il/DENEYAP bazlı risk
      // computeRisk'te ayrı bir kavram (provinces) ve burada tekrarlanmaz.
      const ids = (uyelikRes.data ?? []).map((u: { user_id: string }) => u.user_id)
      let uyeler: Profile[] = []
      if (ids.length) {
        const { data } = await db.from('profiles').select('*').in('id', ids)
        uyeler = (data ?? []) as Profile[]
      }
      const risk = computeRisk({
        tasks: gorevler,
        sprints: (sprintRes.data ?? []) as Sprint[],
        members: uyeler,
        overloadThreshold: ayarRes.data?.overload_threshold ?? 8,
      })

      const kayitlar = satirlar.map(s => ({
        organization_id: org.id,
        gun: bugun,
        kaynak: 'cron',
        ...s,
        risk_skoru:    s.kirilim === 'org' ? risk.score : null,
        risk_seviyesi: s.kirilim === 'org' ? risk.level : null,
      }))

      const { error } = await db
        .from('gunluk_ozet')
        .upsert(kayitlar, { onConflict: 'organization_id,gun,kirilim,il,deneyap_id' })

      if (error) throw new Error(error.message)
      sonuc.push({ org: org.slug, satir: kayitlar.length })
    } catch (e) {
      // Bir org patlarsa diğerleri yazılmaya devam etsin.
      sonuc.push({ org: org.slug, satir: 0, hata: e instanceof Error ? e.message : String(e) })
    }
  }

  // Eski ölçümleri temizle — tablo sınırsız büyümesin.
  const esik = new Date()
  esik.setDate(esik.getDate() - SAKLAMA_GUN)
  await db.from('gunluk_ozet').delete().lt('gun', yerelGun(esik))

  return NextResponse.json({ ok: true, gun: bugun, sonuc })
}
