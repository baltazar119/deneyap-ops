'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { anaEkran } from '@/lib/navigation'
import { useOrg } from '@/lib/supabase/orgContext'
import ResponsiveModal from '@/components/responsive/ResponsiveModal'
import { ONEM_ETIKET, ONEM_RENK, type DuyuruOnem } from '@/lib/duyuru'
import type { Duyuru } from '@/types/database'

/**
 * Okunmamış duyuruları popup olarak gösterir.
 *
 * "Bir kez göster" kuralı DB'de (`duyuru_okundu`), localStorage'da değil —
 * kullanıcı kararı "cihaz bağımsız". Telefonda okunan duyuru bilgisayarda
 * tekrar çıkmaz.
 *
 * Hedefleme SUNUCUDA uygulanıyor; bu bileşen `/duyurular/aktif` ne
 * döndürüyorsa onu gösterir, kendi filtresi yoktur.
 *
 * Birden fazla okunmamış varsa önem sırasına göre tek tek geçilir ("1/3").
 *
 * YALNIZCA rolün ana ekranında açılır (`navigation.ts:anaEkran` — owner/admin/
 * viewer → /dashboard, member → /me). Layout'a takılı olduğu için her org
 * sayfasında mount ediliyor; kapıyı burada tutmak, her sayfaya ayrı ayrı
 * eklemekten daha az kaçak veriyor.
 */
export default function DuyuruPopup() {
  const { org, orgRole, loading: orgLoading } = useOrg()
  const pathname = usePathname()
  const [duyurular, setDuyurular] = useState<Duyuru[]>([])
  const [sira, setSira] = useState(0)
  const [kapandi, setKapandi] = useState(false)
  const [isleniyor, setIsleniyor] = useState(false)

  const anaEkrandaMi = !!org && !!orgRole && pathname === anaEkran(`/org/${org.slug}`, orgRole)

  useEffect(() => {
    if (orgLoading || !org || !anaEkrandaMi) return
    let iptal = false

    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        const r = await fetch(`/api/org/${org.slug}/duyurular/aktif`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (!r.ok) return
        const d = await r.json()
        if (!iptal) setDuyurular(d.duyurular ?? [])
      } catch {
        // Duyuru gösterilememesi sayfayı bozmamalı: popup sessizce açılmaz.
      }
    })()

    return () => { iptal = true }
  }, [orgLoading, org, anaEkrandaMi])

  const aktif = duyurular[sira]

  const anladim = useCallback(async () => {
    if (!aktif || !org || isleniyor) return
    setIsleniyor(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        await fetch(`/api/org/${org.slug}/duyurular/${aktif.id}/okundu`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
      }
    } catch {
      // İşaretleme başarısızsa duyuru bir sonraki girişte tekrar çıkar —
      // sessizce kaybolmasından iyidir.
    } finally {
      setIsleniyor(false)
      if (sira + 1 < duyurular.length) setSira(sira + 1)
      else setKapandi(true)
    }
  }, [aktif, org, sira, duyurular.length, isleniyor])

  if (!anaEkrandaMi || kapandi || !aktif) return null

  const onem = (aktif.onem ?? 'normal') as DuyuruOnem
  const renk = ONEM_RENK[onem] ?? ONEM_RENK.normal

  return (
    <ResponsiveModal
      open
      onClose={anladim}
      title="Duyuru"
      maxWidth="md"
      /*
        Kritik duyuru kapatılamaz: kullanıcı "Anladım"a basmadan geçemez.
        Diğerlerinde Escape ve arka plan tıklaması "Anladım" ile aynı işi
        yapar — duyuru okundu sayılır ve bir daha çıkmaz.
      */
      kapatilamaz={onem === 'kritik'}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <span
            className="text-[11px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: renk.bg, color: renk.renk, border: `1px solid ${renk.bd}` }}
          >
            {ONEM_ETIKET[onem]}
          </span>
          {duyurular.length > 1 && (
            <span className="text-xs font-medium" style={{ color: '#9ca3af' }}>
              {sira + 1}/{duyurular.length}
            </span>
          )}
        </div>

        <h3 className="text-base font-bold" style={{ color: '#111827' }}>{aktif.baslik}</h3>

        {/* İçerik düz metin olarak basılıyor — HTML render EDİLMİYOR.
            Duyuruyu owner/admin yazıyor ama yine de bir kullanıcı girdisi. */}
        <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: '#374151' }}>
          {aktif.icerik}
        </p>

        <button
          type="button"
          onClick={anladim}
          disabled={isleniyor}
          className="btn-primary w-full"
        >
          {isleniyor ? '...' : sira + 1 < duyurular.length ? 'Anladım, sonraki' : 'Anladım'}
        </button>
      </div>
    </ResponsiveModal>
  )
}
