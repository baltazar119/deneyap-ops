'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { useOrg } from '@/lib/supabase/orgContext'
import { yazabilirMi } from '@/lib/roller'
import { ILLER } from '@/lib/iller'
import { trCompare, trFold } from '@/lib/turkce'
import { deneyapKisaEtiket } from '@/lib/deneyap'
import ResponsiveModal from '@/components/responsive/ResponsiveModal'
import type { Deneyap } from '@/types/database'

interface IlBasinaOnizleme {
  olusturulacak: { il: string; ad: string; gorevSayisi: number }[]
  atlanacak: { il: string; neden: string }[]
}

/**
 * DENEYAP yönetimi — Ayarlar > DENEYAP'lar.
 *
 * "Bir ilde birden fazla DENEYAP" kavramının tek yönetim noktası. Silme YOK:
 * kapatma var, çünkü kapatılan bir DENEYAP'a bağlı görevlerin geçmişi
 * korunmalı.
 *
 * Düzenlemede **il alanı kilitli** — gerekçesi ekranda yazıyor ve DB
 * trigger'ı (061) da aynı kuralı uyguluyor.
 */
export default function DeneyaplarAyarPage() {
  const router = useRouter()
  const { org, orgRole, userIl, loading: orgLoading } = useOrg()

  const [deneyaplar, setDeneyaplar] = useState<Deneyap[]>([])
  const [acikGorevSayilari, setAcikGorevSayilari] = useState<Record<string, number>>({})
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState<string | null>(null)
  const [migrationGerekli, setMigrationGerekli] = useState(false)

  const [arama, setArama] = useState('')
  const [ilFiltresi, setIlFiltresi] = useState('all')
  const [pasifleriGoster, setPasifleriGoster] = useState(false)

  const [formAcik, setFormAcik] = useState(false)
  const [duzenlenen, setDuzenlenen] = useState<Deneyap | null>(null)
  const [formAd, setFormAd] = useState('')
  const [formIl, setFormIl] = useState('')
  const [formIlce, setFormIlce] = useState('')
  const [formKod, setFormKod] = useState('')
  const [formNotlar, setFormNotlar] = useState('')
  const [formHata, setFormHata] = useState<string | null>(null)
  const [kaydediliyor, setKaydediliyor] = useState(false)

  const [aracAcik, setAracAcik] = useState(false)
  const [onizleme, setOnizleme] = useState<IlBasinaOnizleme | null>(null)
  const [aracCalisiyor, setAracCalisiyor] = useState(false)

  const yazabilir = yazabilirMi(orgRole)

  const istek = useCallback(async (yol: string, init?: RequestInit) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Oturum bulunamadı.')
    const r = await fetch(yol, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        ...(init?.headers ?? {}),
      },
    })
    const govde = await r.json().catch(() => ({}))
    if (!r.ok) {
      const e = new Error(govde.error || 'İşlem başarısız.') as Error & { migrationGerekli?: boolean }
      e.migrationGerekli = govde.migrationGerekli === true
      throw e
    }
    return govde
  }, [])

  const yukle = useCallback(async () => {
    if (!org) return
    try {
      const d = await istek(`/api/org/${org.slug}/deneyaplar`)
      setDeneyaplar(d.deneyaplar ?? [])
      setAcikGorevSayilari(d.acikGorevSayilari ?? {})
      setHata(null); setMigrationGerekli(false)
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'DENEYAP listesi alınamadı.')
      setMigrationGerekli((e as { migrationGerekli?: boolean })?.migrationGerekli === true)
    } finally {
      setYukleniyor(false)
    }
  }, [org, istek])

  useEffect(() => {
    if (orgLoading) return
    if (!org) return
    // Yazma yetkisi olmayan bu ekranı hiç görmemeli.
    if (!yazabilirMi(orgRole)) { router.replace(`/org/${org.slug}/settings`); return }
    yukle()
  }, [orgLoading, org, orgRole, router, yukle])

  const kullanilanIller = useMemo(
    () => Array.from(new Set(deneyaplar.map(d => d.il))).sort(trCompare),
    [deneyaplar],
  )

  const gorunenler = useMemo(() => {
    const tokenlar = trFold(arama).split(' ').filter(Boolean)
    return deneyaplar.filter(d => {
      if (!pasifleriGoster && !d.aktif) return false
      if (ilFiltresi !== 'all' && d.il !== ilFiltresi) return false
      if (tokenlar.length) {
        const metin = trFold([d.ad, d.il, d.ilce ?? '', d.kod ?? ''].join(' '))
        if (!tokenlar.every(t => metin.includes(t))) return false
      }
      return true
    })
  }, [deneyaplar, arama, ilFiltresi, pasifleriGoster])

  function yeniAc() {
    setDuzenlenen(null)
    setFormAd(''); setFormIl(userIl && (ILLER as readonly string[]).includes(userIl) ? userIl : '')
    setFormIlce(''); setFormKod(''); setFormNotlar('')
    setFormHata(null); setFormAcik(true)
  }

  function duzenleAc(d: Deneyap) {
    setDuzenlenen(d)
    setFormAd(d.ad); setFormIl(d.il); setFormIlce(d.ilce ?? '')
    setFormKod(d.kod ?? ''); setFormNotlar(d.notlar ?? '')
    setFormHata(null); setFormAcik(true)
  }

  async function kaydet(e: React.FormEvent) {
    e.preventDefault()
    if (!org) return
    setKaydediliyor(true); setFormHata(null)
    try {
      if (duzenlenen) {
        // `il` GÖNDERİLMİYOR — değiştirilemez olduğu için isteğe hiç konmuyor.
        await istek(`/api/org/${org.slug}/deneyaplar`, {
          method: 'PATCH',
          body: JSON.stringify({
            id: duzenlenen.id, ad: formAd, ilce: formIlce, kod: formKod, notlar: formNotlar,
          }),
        })
      } else {
        await istek(`/api/org/${org.slug}/deneyaplar`, {
          method: 'POST',
          body: JSON.stringify({ ad: formAd, il: formIl, ilce: formIlce, kod: formKod, notlar: formNotlar }),
        })
      }
      setFormAcik(false)
      await yukle()
    } catch (e) {
      setFormHata(e instanceof Error ? e.message : 'Kaydedilemedi.')
    } finally {
      setKaydediliyor(false)
    }
  }

  async function aktifligiDegistir(d: Deneyap) {
    if (!org) return
    const acik = acikGorevSayilari[d.id] ?? 0
    if (d.aktif && acik > 0) {
      if (!confirm(`"${d.ad}" biriminde ${acik} açık görev var. Kapatmak listelerden gizler ama görevler silinmez. Devam edilsin mi?`)) return
    }
    try {
      await istek(`/api/org/${org.slug}/deneyaplar`, {
        method: 'PATCH',
        body: JSON.stringify({ id: d.id, aktif: !d.aktif }),
      })
      await yukle()
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Güncellenemedi.')
    }
  }

  async function aracAc() {
    if (!org) return
    setAracAcik(true); setOnizleme(null)
    try {
      setOnizleme(await istek(`/api/org/${org.slug}/deneyaplar/il-basina`))
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Önizleme alınamadı.')
      setAracAcik(false)
    }
  }

  async function aracUygula() {
    if (!org) return
    setAracCalisiyor(true)
    try {
      await istek(`/api/org/${org.slug}/deneyaplar/il-basina`, { method: 'POST' })
      setAracAcik(false)
      await yukle()
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Oluşturulamadı.')
    } finally {
      setAracCalisiyor(false)
    }
  }

  if (orgLoading || yukleniyor) {
    return (
      <div className="min-h-screen px-4 md:px-6 py-5 space-y-3" style={{ background: '#f5f7fa' }}>
        <div className="skeleton h-8 w-56 rounded-xl" />
        {[0, 1, 2, 3].map(i => <div key={i} className="skeleton h-14 rounded-2xl" />)}
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: '#f5f7fa' }}>
      <main className="w-full px-4 md:px-6 py-4 md:py-5">

        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <Link href={`/org/${org?.slug}/settings`} className="text-xs font-medium" style={{ color: '#2288c9', textDecoration: 'none' }}>
              ← Ayarlar
            </Link>
            <h1 className="text-lg md:text-xl font-bold mt-1" style={{ color: '#111827', letterSpacing: '-0.02em' }}>
              DENEYAP&apos;lar
            </h1>
            <p className="text-xs md:text-sm mt-0.5" style={{ color: '#9ca3af' }}>
              {deneyaplar.length} birim · bir ilde birden fazla DENEYAP olabilir
            </p>
          </div>
          {yazabilir && (
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={aracAc} className="text-sm font-medium px-3 py-2 rounded-xl"
                style={{ background: '#fff', color: '#0f766e', border: '1px solid #5eead4' }}>
                İl başına oluştur
              </button>
              <button onClick={yeniAc} className="text-sm font-medium px-4 py-2 rounded-xl"
                style={{ background: '#2288c9', color: '#fff', border: 'none' }}>
                + Yeni DENEYAP
              </button>
            </div>
          )}
        </div>

        {hata && (
          <div className="text-sm rounded-xl px-4 py-3 mb-4 leading-relaxed"
            style={migrationGerekli
              ? { background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' }
              : { background: '#fee2e2', color: '#dc2626' }}>
            {hata}
            {migrationGerekli && (
              <div className="mt-2 text-xs" style={{ color: '#92400e' }}>
                Bu ekran veritabanı hazır olduğunda çalışacak. Uygulamanın geri kalanı
                etkilenmez — DENEYAP tanımlanmamış bir çalışma alanı görevlerini il
                üzerinden yönetmeye devam eder.
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <input
            value={arama}
            onChange={e => setArama(e.target.value)}
            placeholder="Ad, il, ilçe veya kod ara..."
            aria-label="DENEYAP ara"
            className="text-sm rounded-xl px-3 py-2 flex-1 min-w-[180px]"
            style={{ background: '#fff', border: '1px solid #e5e7eb', color: '#111827', outline: 'none' }}
          />
          <select
            value={ilFiltresi}
            onChange={e => setIlFiltresi(e.target.value)}
            aria-label="İl filtresi"
            className="text-sm rounded-xl px-3 py-2"
            style={{ background: '#fff', border: '1px solid #e5e7eb', color: '#374151', outline: 'none' }}
          >
            <option value="all">Tüm iller</option>
            {kullanilanIller.map(il => <option key={il} value={il}>{il}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl cursor-pointer"
            style={{ background: '#fff', border: '1px solid #e5e7eb', color: '#475569' }}>
            <input type="checkbox" checked={pasifleriGoster} onChange={e => setPasifleriGoster(e.target.checked)} />
            Kapatılanları göster
          </label>
        </div>

        <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e5e7eb' }}>
          {gorunenler.length === 0 ? (
            <div className="px-5 py-14 text-center text-sm" style={{ color: '#9ca3af' }}>
              {deneyaplar.length === 0
                ? 'Henüz DENEYAP tanımlanmamış. "İl başına oluştur" ile hızlı başlayabilirsiniz.'
                : 'Eşleşen DENEYAP yok.'}
            </div>
          ) : gorunenler.map((d, i) => (
            <div key={d.id} className="flex items-center gap-3 px-4 md:px-5 py-3"
              style={{ borderBottom: i < gorunenler.length - 1 ? '1px solid #f3f4f6' : 'none', opacity: d.aktif ? 1 : 0.6 }}>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold truncate" style={{ color: '#111827' }}>
                  {deneyapKisaEtiket(d)}
                  {!d.aktif && (
                    <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: '#f1f5f9', color: '#94a3b8' }}>kapalı</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: '#f0fdfa', color: '#0f766e' }}>
                    📍 {d.il}{d.ilce ? ` · ${d.ilce}` : ''}
                  </span>
                  {d.kod && <span className="text-xs" style={{ color: '#9ca3af' }}>kod: {d.kod}</span>}
                  <span className="text-xs" style={{ color: (acikGorevSayilari[d.id] ?? 0) > 0 ? '#b45309' : '#9ca3af' }}>
                    {acikGorevSayilari[d.id] ?? 0} açık görev
                  </span>
                </div>
              </div>
              {yazabilir && (
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => duzenleAc(d)} className="text-xs px-2.5 py-1 rounded-lg font-medium"
                    style={{ color: '#2288c9', background: '#eff6ff', border: '1px solid #dbeafe' }}>
                    Düzenle
                  </button>
                  <button onClick={() => aktifligiDegistir(d)} className="text-xs px-2.5 py-1 rounded-lg font-medium"
                    style={d.aktif
                      ? { color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a' }
                      : { color: '#0f766e', background: '#f0fdfa', border: '1px solid #99f6e4' }}>
                    {d.aktif ? 'Kapat' : 'Aç'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </main>

      {/* Ekle / düzenle */}
      <ResponsiveModal
        open={formAcik}
        onClose={() => setFormAcik(false)}
        title={duzenlenen ? 'DENEYAP Düzenle' : 'Yeni DENEYAP'}
        maxWidth="md"
      >
        <form onSubmit={kaydet} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>DENEYAP Adı *</label>
            <input value={formAd} onChange={e => setFormAd(e.target.value)} required
              placeholder="ör. Çankaya DENEYAP" className="input" />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>İl *</label>
            {duzenlenen ? (
              <>
                <input value={formIl} disabled className="input" style={{ background: '#f8fafc', color: '#64748b' }} />
                {/* Kilidin gerekçesi ekranda yazıyor: kullanıcı "neden
                    değiştiremiyorum" diye desteğe yazmasın. */}
                <p className="text-[11px] mt-1.5 leading-relaxed" style={{ color: '#b45309' }}>
                  DENEYAP&apos;ın ili değiştirilemez. İl değişikliği Excel içe aktarma parmak izini
                  bozar ve aynı dosya tekrar yüklendiğinde kopya görev oluşturur. İl yanlışsa bu
                  DENEYAP&apos;ı kapatıp doğru ille yenisini açın.
                </p>
              </>
            ) : (
              <select value={formIl} onChange={e => setFormIl(e.target.value)} required className="input">
                <option value="">-- İl seçin --</option>
                {ILLER.map(il => <option key={il} value={il}>{il}</option>)}
              </select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>İlçe</label>
              <input value={formIlce} onChange={e => setFormIlce(e.target.value)} className="input" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>Kod</label>
              <input value={formKod} onChange={e => setFormKod(e.target.value)} placeholder="ör. ANK-01" className="input" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>Notlar</label>
            <textarea value={formNotlar} onChange={e => setFormNotlar(e.target.value)}
              className="input resize-y" rows={3} style={{ color: '#111827', minHeight: 70 }} />
          </div>

          {formHata && (
            <div className="text-xs rounded-xl px-4 py-3" style={{ background: '#fee2e2', color: '#dc2626' }}>
              {formHata}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={() => setFormAcik(false)} className="btn-secondary flex-1">İptal</button>
            <button type="submit" disabled={kaydediliyor} className="btn-primary flex-1">
              {kaydediliyor ? 'Kaydediliyor...' : duzenlenen ? 'Güncelle' : 'Oluştur'}
            </button>
          </div>
        </form>
      </ResponsiveModal>

      {/* İl başına oluştur — onaylı araç */}
      <ResponsiveModal
        open={aracAcik}
        onClose={() => setAracAcik(false)}
        title="İl başına bir DENEYAP oluştur"
        maxWidth="md"
      >
        {!onizleme ? (
          <div className="text-sm py-6 text-center" style={{ color: '#9ca3af' }}>Hesaplanıyor...</div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs leading-relaxed" style={{ color: '#475569' }}>
              Görevlerde kullanılan her il için tek bir DENEYAP kaydı oluşturur. Bir ilde birden
              fazla DENEYAP varsa bunları sonradan elle eklemeniz gerekir — bu araç sadece
              başlangıç noktası. <strong>Görevler otomatik bağlanmaz;</strong> hangi görevin hangi
              birime ait olduğu sizin kararınız.
            </p>

            {onizleme.olusturulacak.length > 0 ? (
              <div>
                <div className="text-[11px] font-bold uppercase mb-2" style={{ color: '#64748b', letterSpacing: '0.04em' }}>
                  Oluşturulacak ({onizleme.olusturulacak.length})
                </div>
                <div className="rounded-xl overflow-hidden max-h-52 overflow-y-auto" style={{ border: '1px solid #e5e7eb' }}>
                  {onizleme.olusturulacak.map(o => (
                    <div key={o.il} className="flex items-center justify-between px-3 py-2 text-sm"
                      style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <span style={{ color: '#111827' }}>{o.ad}</span>
                      <span className="text-xs" style={{ color: '#9ca3af' }}>{o.gorevSayisi} görev</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-sm rounded-xl px-4 py-3" style={{ background: '#f0fdfa', color: '#0f766e' }}>
                Oluşturulacak yeni bir kayıt yok.
              </div>
            )}

            {onizleme.atlanacak.length > 0 && (
              <div>
                <div className="text-[11px] font-bold uppercase mb-2" style={{ color: '#64748b', letterSpacing: '0.04em' }}>
                  Atlanacak ({onizleme.atlanacak.length})
                </div>
                <div className="rounded-xl overflow-hidden max-h-40 overflow-y-auto" style={{ border: '1px solid #e5e7eb' }}>
                  {onizleme.atlanacak.map(a => (
                    <div key={a.il} className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
                      style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <span style={{ color: '#475569' }}>{a.il}</span>
                      <span style={{ color: '#9ca3af' }}>{a.neden}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setAracAcik(false)} className="btn-secondary flex-1">Vazgeç</button>
              <button
                type="button"
                onClick={aracUygula}
                disabled={aracCalisiyor || onizleme.olusturulacak.length === 0}
                className="btn-primary flex-1"
                style={{ opacity: onizleme.olusturulacak.length === 0 ? 0.5 : 1 }}
              >
                {aracCalisiyor ? 'Oluşturuluyor...' : `${onizleme.olusturulacak.length} DENEYAP oluştur`}
              </button>
            </div>
          </div>
        )}
      </ResponsiveModal>
    </div>
  )
}
