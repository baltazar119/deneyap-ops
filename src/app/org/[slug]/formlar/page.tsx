'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { useOrg } from '@/lib/supabase/orgContext'
import ResponsiveModal from '@/components/responsive/ResponsiveModal'
import type { Form } from '@/lib/form/tipler'
import type { Profile, Task } from '@/types/database'

/**
 * Formlar — liste, oluşturucu ve gönderme.
 *
 * Oluşturma her org üyesine açık (kullanıcı kararı: İl Sorumlusu da form
 * hazırlayabilsin); düzenleme/silme yalnızca sahibinde ya da yöneticide.
 * Aynı kural sunucuda ve RLS'te de var.
 */

interface Sayac { gonderim: number; yanit: number }

export default function FormlarPage() {
  const { org, userId, isAdmin, loading: orgLoading } = useOrg()

  const [formlar, setFormlar] = useState<Form[]>([])
  const [sayilar, setSayilar] = useState<Record<string, Sayac>>({})
  const [uyeler, setUyeler] = useState<Profile[]>([])
  const [gorevler, setGorevler] = useState<Task[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState<string | null>(null)
  const [migrationGerekli, setMigrationGerekli] = useState(false)

  // ── Gönderme durumu ──
  const [gonderAcik, setGonderAcik] = useState(false)
  const [gonderilecek, setGonderilecek] = useState<Form | null>(null)
  const [gGorev, setGGorev] = useState('')
  const [gAlici, setGAlici] = useState('')
  const [gEtiket, setGEtiket] = useState('')
  const [gGun, setGGun] = useState('14')
  const [uretilenLink, setUretilenLink] = useState<string | null>(null)
  const [gonderHata, setGonderHata] = useState<string | null>(null)
  const [gonderiliyor, setGonderiliyor] = useState(false)

  const istek = useCallback(async (yol: string, init?: RequestInit) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Oturum bulunamadı.')
    const r = await fetch(yol, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, ...(init?.headers ?? {}) },
    })
    const g = await r.json().catch(() => ({}))
    if (!r.ok) {
      const e = new Error(g.error || 'İşlem başarısız.') as Error & { migrationGerekli?: boolean }
      e.migrationGerekli = g.migrationGerekli === true
      throw e
    }
    return g
  }, [])

  const yukle = useCallback(async () => {
    if (!org) return
    try {
      const d = await istek(`/api/org/${org.slug}/formlar`)
      setFormlar(d.formlar ?? [])
      setSayilar(d.sayilar ?? {})
      setHata(null); setMigrationGerekli(false)
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Formlar alınamadı.')
      setMigrationGerekli((e as { migrationGerekli?: boolean })?.migrationGerekli === true)
    } finally {
      setYukleniyor(false)
    }
  }, [org, istek])

  useEffect(() => {
    if (orgLoading || !org) return
    yukle()
    // Gönderme ekranı için açık görevler ve üyeler.
    ;(async () => {
      const [{ data: uyelikler }, { data: gorevData }] = await Promise.all([
        supabase.from('organization_members').select('user_id').eq('organization_id', org.id),
        supabase.from('tasks').select('id, title, status').eq('organization_id', org.id)
          .neq('status', 'done').order('created_at', { ascending: false }).limit(200),
      ])
      const idler = (uyelikler ?? []).map((u: { user_id: string }) => u.user_id)
      if (idler.length) {
        const { data: profiller } = await supabase.from('profiles').select('*').in('id', idler)
        setUyeler(profiller ?? [])
      }
      setGorevler((gorevData ?? []) as Task[])
    })()
  }, [orgLoading, org, yukle])

  async function sil(f: Form) {
    if (!org) return
    if (!confirm(`"${f.baslik}" formu silinsin mi? Gönderimler ve toplanan CEVAPLAR da silinir.`)) return
    try {
      await istek(`/api/org/${org.slug}/formlar?id=${f.id}`, { method: 'DELETE' })
      await yukle()
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Silinemedi.')
    }
  }

  function gonderAc(f: Form) {
    setGonderilecek(f)
    setGGorev(''); setGAlici(''); setGEtiket(''); setGGun('14')
    setUretilenLink(null); setGonderHata(null); setGonderAcik(true)
  }

  async function gonder() {
    if (!org || !gonderilecek) return
    setGonderiliyor(true); setGonderHata(null)
    try {
      const d = await istek(`/api/org/${org.slug}/formlar/${gonderilecek.id}/gonder`, {
        method: 'POST',
        body: JSON.stringify({
          gorev_id: gGorev || null,
          alici_user_id: gAlici || null,
          alici_etiket: gEtiket || null,
          gecerlilik_gun: gGun === '' ? null : Number(gGun),
        }),
      })
      setUretilenLink(`${window.location.origin}/form/${d.token}`)
      await yukle()
    } catch (e) {
      setGonderHata(e instanceof Error ? e.message : 'Gönderilemedi.')
    } finally {
      setGonderiliyor(false)
    }
  }

  const duzenleyebilirMi = (f: Form) => isAdmin || f.created_by === userId

  if (orgLoading || yukleniyor) {
    return (
      <div className="min-h-screen px-4 md:px-6 py-5 space-y-3" style={{ background: '#f5f7fa' }}>
        <div className="skeleton h-8 w-40 rounded-xl" />
        {[0, 1, 2].map(i => <div key={i} className="skeleton h-20 rounded-2xl" />)}
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: '#f5f7fa' }}>
      <main className="w-full px-4 md:px-6 py-4 md:py-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h1 className="text-lg md:text-xl font-bold" style={{ color: '#111827', letterSpacing: '-0.02em' }}>
              Formlar
            </h1>
            <p className="text-xs md:text-sm mt-0.5" style={{ color: '#9ca3af' }}>
              {formlar.length} form · dolduruldukça bağlı görev tamamlanır
            </p>
          </div>
          <Link href={`/org/${org?.slug}/formlar/yeni`}
            className="shrink-0 text-sm font-bold px-4 py-2.5 rounded-xl"
            style={{ background: '#2288c9', color: '#fff', textDecoration: 'none' }}>
            + Yeni Form
          </Link>
        </div>

        {hata && (
          <div className="text-sm rounded-xl px-4 py-3 mb-4 leading-relaxed"
            style={migrationGerekli
              ? { background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' }
              : { background: '#fee2e2', color: '#dc2626' }}>
            {hata}
          </div>
        )}

        <div className="space-y-2">
          {formlar.length === 0 ? (
            <div className="rounded-2xl px-5 py-14 text-center text-sm"
              style={{ background: '#fff', border: '1px solid #e5e7eb', color: '#9ca3af' }}>
              Henüz form yok.
            </div>
          ) : formlar.map(f => {
            const s = sayilar[f.id] ?? { gonderim: 0, yanit: 0 }
            return (
              <div key={f.id} className="rounded-2xl px-4 md:px-5 py-3.5"
                style={{ background: '#fff', border: '1px solid #e5e7eb' }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={f.yayinda
                          ? { background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac' }
                          : { background: '#f1f5f9', color: '#94a3b8', border: '1px solid #e2e8f0' }}>
                        {f.yayinda ? 'Yayında' : 'Taslak'}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #7dd3fc' }}>
                        {f.erisim === 'baglanti' ? 'Açık bağlantı' : 'Sadece üyeler'}
                      </span>
                      {f.sonraki_gorev_aktif && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: '#f0fdfa', color: '#0f766e', border: '1px solid #99f6e4' }}>
                          Sonraki görev açılır
                        </span>
                      )}
                      <span className="text-xs" style={{ color: '#9ca3af' }}>
                        {s.yanit}/{s.gonderim} yanıt · {(f.alanlar ?? []).length} soru
                      </span>
                    </div>
                    <div className="text-[13px] font-semibold" style={{ color: '#111827' }}>{f.baslik}</div>
                    {f.aciklama && <p className="text-xs mt-1 line-clamp-2" style={{ color: '#6b7280' }}>{f.aciklama}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                    <Link href={`/org/${org?.slug}/formlar/${f.id}`}
                      className="text-xs px-2.5 py-1 rounded-lg font-medium"
                      style={{ color: '#475569', background: '#f8fafc', border: '1px solid #e5e7eb', textDecoration: 'none' }}>
                      Cevaplar
                    </Link>
                    <button onClick={() => gonderAc(f)} className="text-xs px-2.5 py-1 rounded-lg font-medium"
                      style={{ color: '#0f766e', background: '#f0fdfa', border: '1px solid #99f6e4' }}>
                      Gönder
                    </button>
                    {duzenleyebilirMi(f) && (
                      <>
                        <Link href={`/org/${org?.slug}/formlar/${f.id}/duzenle`}
                          className="text-xs px-2.5 py-1.5 rounded-lg font-semibold"
                          style={{ color: '#2288c9', background: '#eff6ff', border: '1px solid #bfdbfe', textDecoration: 'none' }}>
                          Düzenle
                        </Link>
                        <button onClick={() => sil(f)} className="text-xs px-2.5 py-1 rounded-lg font-medium"
                          style={{ color: '#dc2626', background: '#fff1f1', border: '1px solid #fecaca' }}>
                          Sil
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </main>

      {/* ── Gönder ── */}
      <ResponsiveModal open={gonderAcik} onClose={() => setGonderAcik(false)} title="Formu Gönder" maxWidth="md">
        {uretilenLink ? (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: '#374151' }}>
              Bağlantı hazır. <strong>Bu bağlantı yalnızca şimdi gösteriliyor</strong> — güvenlik
              için sistemde saklanmıyor. Kaybederseniz yeniden gönderin.
            </p>
            <div className="rounded-xl px-3 py-2.5 text-xs break-all"
              style={{ background: '#f8fafc', border: '1px solid #e5e7eb', color: '#0f766e' }}>
              {uretilenLink}
            </div>
            <div className="flex gap-3">
              <button type="button" className="btn-secondary flex-1"
                onClick={() => navigator.clipboard?.writeText(uretilenLink)}>
                Kopyala
              </button>
              <button type="button" className="btn-primary flex-1" onClick={() => setGonderAcik(false)}>Kapat</button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>
                Bağlanacak görev
              </label>
              <select className="input" value={gGorev} onChange={e => setGGorev(e.target.value)}>
                <option value="">-- Görev bağlama --</option>
                {gorevler.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
              </select>
              <p className="text-[11px] mt-1" style={{ color: '#9ca3af' }}>
                Form doldurulunca bu görev otomatik &quot;tamamlandı&quot; olur.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>Alıcı (üye)</label>
              <select className="input" value={gAlici} onChange={e => setGAlici(e.target.value)}>
                <option value="">-- Üye seçme --</option>
                {uyeler.map(u => <option key={u.id} value={u.id}>{u.full_name || u.id}</option>)}
              </select>
              <p className="text-[11px] mt-1" style={{ color: '#9ca3af' }}>
                Üye seçilirse bildirim gönderilir. Dışarıdan biriyse boş bırakıp aşağıya not düşün.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>Alıcı notu</label>
              <input className="input" value={gEtiket} onChange={e => setGEtiket(e.target.value)}
                placeholder="ör. Çankaya DENEYAP eğitmeni" />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>
                Bağlantı kaç gün geçerli
              </label>
              <input type="number" min={1} className="input" style={{ width: 130 }}
                value={gGun} onChange={e => setGGun(e.target.value)} placeholder="boş = süresiz" />
            </div>

            {gonderHata && (
              <div className="text-xs rounded-xl px-4 py-3" style={{ background: '#fee2e2', color: '#dc2626' }}>{gonderHata}</div>
            )}

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setGonderAcik(false)} className="btn-secondary flex-1">İptal</button>
              <button type="button" onClick={gonder} disabled={gonderiliyor} className="btn-primary flex-1">
                {gonderiliyor ? 'Oluşturuluyor...' : 'Bağlantı oluştur'}
              </button>
            </div>
          </div>
        )}
      </ResponsiveModal>
    </div>
  )
}
