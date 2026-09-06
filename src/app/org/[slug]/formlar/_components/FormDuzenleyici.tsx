'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { useOrg } from '@/lib/supabase/orgContext'
import { TASK_TYPES } from '@/lib/taskTypes'
import FormOlusturucu from './FormOlusturucu'
import FormDoldurucu from '@/components/form/FormDoldurucu'
import type { Form, FormAlani } from '@/lib/form/tipler'
import type { Profile } from '@/types/database'

/**
 * Form düzenleyici — TAM SAYFA, modal değil.
 *
 * Önce bir `ResponsiveModal` içindeydi ve yanlıştı: form kurmak çok adımlı
 * bir iş (başlık, erişim, N soru, workflow kuralı) ve hepsi ~560px'lik
 * kaydırmalı bir kutuya sıkışıyordu; kullanıcı ne kurduğunu göremiyordu.
 *
 * Şimdi solda düzenleme, sağda CANLI ÖNİZLEME var — önizleme gerçek
 * `FormDoldurucu` bileşeni, yani cevaplayanın göreceğinin birebir aynısı.
 * Ayrı bir "önizleme" render'ı yazmak, ikisinin zamanla ayrışması demekti.
 */

const ONCELIKLER = [
  { v: 'critical', e: 'Kritik' }, { v: 'high', e: 'Yüksek' },
  { v: 'normal', e: 'Normal' }, { v: 'low', e: 'Düşük' },
]

const R = {
  metin: '#0f172a', etiket: '#1e293b', yardim: '#64748b',
  kenar: '#cbd5e1', kenarHafif: '#e2e8f0',
}

const girdi: React.CSSProperties = {
  width: '100%', border: `1px solid ${R.kenar}`, borderRadius: 10,
  padding: '9px 12px', fontSize: 14, color: R.metin, background: '#fff', outline: 'none',
}

function Kart({ baslik, aciklama, children }: {
  baslik: string; aciklama?: string; children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: `1px solid ${R.kenarHafif}` }}>
      <div className="px-5 py-3.5" style={{ borderBottom: `1px solid ${R.kenarHafif}`, background: '#fbfcfd' }}>
        <h2 className="text-sm font-bold" style={{ color: R.metin }}>{baslik}</h2>
        {aciklama && <p className="text-xs mt-0.5 leading-relaxed" style={{ color: R.yardim }}>{aciklama}</p>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

function Etiket({ children, zorunlu }: { children: React.ReactNode; zorunlu?: boolean }) {
  return (
    <label className="block text-[13px] font-semibold mb-1.5" style={{ color: R.etiket }}>
      {children}{zorunlu && <span style={{ color: '#dc2626' }}> *</span>}
    </label>
  )
}

export default function FormDuzenleyici({ formId }: { formId?: string }) {
  const router = useRouter()
  const { org, loading: orgLoading } = useOrg()

  const [uyeler, setUyeler] = useState<Profile[]>([])
  const [yukleniyor, setYukleniyor] = useState(!!formId)
  const [hata, setHata] = useState<string | null>(null)
  const [kaydediliyor, setKaydediliyor] = useState(false)

  const [baslik, setBaslik] = useState('')
  const [aciklama, setAciklama] = useState('')
  const [erisim, setErisim] = useState<'uyeler' | 'baglanti'>('uyeler')
  const [yayinda, setYayinda] = useState(true)
  const [alanlar, setAlanlar] = useState<FormAlani[]>([])
  const [sonrakiAktif, setSonrakiAktif] = useState(false)
  const [sonrakiBaslik, setSonrakiBaslik] = useState('')
  const [sonrakiAciklama, setSonrakiAciklama] = useState('')
  const [sonrakiOncelik, setSonrakiOncelik] = useState('normal')
  const [sonrakiTur, setSonrakiTur] = useState('other')
  const [sonrakiTermin, setSonrakiTermin] = useState('')
  const [sonrakiKaynak, setSonrakiKaynak] = useState<'gonderen' | 'yanitlayan' | 'sabit'>('gonderen')
  const [sonrakiAtanan, setSonrakiAtanan] = useState('')

  const istek = useCallback(async (yol: string, init?: RequestInit) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Oturum bulunamadı.')
    const r = await fetch(yol, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, ...(init?.headers ?? {}) },
    })
    const g = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(g.error || 'İşlem başarısız.')
    return g
  }, [])

  useEffect(() => {
    if (orgLoading || !org) return
    ;(async () => {
      const { data: uyelikler } = await supabase
        .from('organization_members').select('user_id').eq('organization_id', org.id)
      const idler = (uyelikler ?? []).map((u: { user_id: string }) => u.user_id)
      if (idler.length) {
        const { data: p } = await supabase.from('profiles').select('*').in('id', idler)
        setUyeler(p ?? [])
      }

      if (!formId) return
      try {
        const d = await istek(`/api/org/${org.slug}/formlar/${formId}/yanitlar`)
        const f = d.form as Form
        setBaslik(f.baslik); setAciklama(f.aciklama ?? '')
        setErisim(f.erisim); setYayinda(f.yayinda)
        setAlanlar((f.alanlar ?? []) as FormAlani[])
        setSonrakiAktif(f.sonraki_gorev_aktif)
        setSonrakiBaslik(f.sonraki_gorev_baslik ?? '')
        setSonrakiAciklama(f.sonraki_gorev_aciklama ?? '')
        setSonrakiOncelik(f.sonraki_gorev_oncelik ?? 'normal')
        setSonrakiTur(f.sonraki_gorev_tur ?? 'other')
        setSonrakiTermin(f.sonraki_gorev_termin_gun != null ? String(f.sonraki_gorev_termin_gun) : '')
        setSonrakiKaynak(f.sonraki_gorev_atanan_kaynak ?? 'gonderen')
        setSonrakiAtanan(f.sonraki_gorev_atanan_id ?? '')
      } catch (e) {
        setHata(e instanceof Error ? e.message : 'Form alınamadı.')
      } finally {
        setYukleniyor(false)
      }
    })()
  }, [orgLoading, org, formId, istek])

  async function kaydet(e: React.FormEvent) {
    e.preventDefault()
    if (!org) return
    setKaydediliyor(true); setHata(null)
    const govde = {
      baslik, aciklama, erisim, yayinda, alanlar,
      sonraki_gorev_aktif: sonrakiAktif,
      sonraki_gorev_baslik: sonrakiBaslik,
      sonraki_gorev_aciklama: sonrakiAciklama,
      sonraki_gorev_oncelik: sonrakiOncelik,
      sonraki_gorev_tur: sonrakiTur,
      sonraki_gorev_termin_gun: sonrakiTermin === '' ? null : Number(sonrakiTermin),
      sonraki_gorev_atanan_kaynak: sonrakiKaynak,
      sonraki_gorev_atanan_id: sonrakiAtanan || null,
    }
    try {
      if (formId) {
        await istek(`/api/org/${org.slug}/formlar`, { method: 'PATCH', body: JSON.stringify({ ...govde, id: formId }) })
      } else {
        await istek(`/api/org/${org.slug}/formlar`, { method: 'POST', body: JSON.stringify(govde) })
      }
      router.push(`/org/${org.slug}/formlar`)
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Kaydedilemedi.')
      setKaydediliyor(false)
    }
  }

  if (orgLoading || yukleniyor) {
    return (
      <div className="min-h-screen px-4 md:px-6 py-5 space-y-3" style={{ background: '#f1f5f9' }}>
        <div className="skeleton h-10 w-64 rounded-xl" />
        <div className="skeleton h-40 rounded-2xl" />
        <div className="skeleton h-64 rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: '#f1f5f9' }}>
      <form onSubmit={kaydet}>
        {/* Yapışkan başlık: uzun formda Kaydet her zaman erişilebilir olmalı. */}
        <div className="sticky top-0 z-20 px-4 md:px-6 py-3"
          style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)', borderBottom: `1px solid ${R.kenarHafif}` }}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Link href={`/org/${org?.slug}/formlar`} className="text-xs font-semibold"
                style={{ color: '#2288c9', textDecoration: 'none' }}>
                ← Formlar
              </Link>
              <h1 className="text-base md:text-lg font-bold truncate mt-0.5" style={{ color: R.metin }}>
                {baslik || (formId ? 'Formu düzenle' : 'Yeni form')}
              </h1>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button type="button" onClick={() => setYayinda(v => !v)}
                className="px-3 py-2 rounded-xl text-xs font-bold transition-colors"
                style={yayinda
                  ? { background: '#dcfce7', color: '#15803d', border: '1px solid #86efac' }
                  : { background: '#f1f5f9', color: '#64748b', border: `1px solid ${R.kenar}` }}>
                {yayinda ? 'Yayında' : 'Taslak'}
              </button>
              <button type="submit" disabled={kaydediliyor}
                className="px-5 py-2 rounded-xl text-sm font-bold"
                style={{ background: '#2288c9', color: '#fff', border: 'none', opacity: kaydediliyor ? 0.7 : 1 }}>
                {kaydediliyor ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>

        <div className="px-4 md:px-6 py-5">
          {hata && (
            <div className="text-sm rounded-xl px-4 py-3 mb-4 font-medium"
              style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
              {hata}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-5 items-start">
            {/* ── Sol: düzenleme ── */}
            <div className="space-y-4 min-w-0">
              <Kart baslik="Form bilgileri">
                <div className="space-y-4">
                  <div>
                    <Etiket zorunlu>Form başlığı</Etiket>
                    <input style={girdi} value={baslik} required
                      placeholder="ör. Atölye malzeme sayımı"
                      onChange={e => setBaslik(e.target.value)} />
                  </div>
                  <div>
                    <Etiket>Açıklama</Etiket>
                    <textarea rows={2} style={{ ...girdi, resize: 'vertical' }} value={aciklama}
                      placeholder="Cevaplayana kısa bir yönerge"
                      onChange={e => setAciklama(e.target.value)} />
                  </div>
                  <div>
                    <Etiket>Kimler doldurabilir</Etiket>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {[
                        { v: 'uyeler' as const, b: 'Sadece üyeler', a: 'Giriş yapmış org üyeleri' },
                        { v: 'baglanti' as const, b: 'Bağlantısı olan herkes', a: 'Giriş gerekmez, dış paydaş da doldurur' },
                      ].map(o => {
                        const secili = erisim === o.v
                        return (
                          <button key={o.v} type="button" onClick={() => setErisim(o.v)}
                            className="text-left px-3.5 py-3 rounded-xl transition-colors"
                            style={{
                              background: secili ? '#e0f2fe' : '#fff',
                              border: `1.5px solid ${secili ? '#38bdf8' : R.kenar}`,
                            }}>
                            <div className="text-[13px] font-bold" style={{ color: secili ? '#0369a1' : R.etiket }}>{o.b}</div>
                            <div className="text-[11px] mt-0.5 leading-snug" style={{ color: R.yardim }}>{o.a}</div>
                          </button>
                        )
                      })}
                    </div>
                    {erisim === 'baglanti' && (
                      <p className="text-[12px] mt-2 leading-relaxed rounded-lg px-3 py-2"
                        style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }}>
                        Bağlantıyı alan herkes giriş yapmadan doldurabilir. Kim doldurduğunu bilmek
                        istiyorsanız forma bir &quot;Adınız&quot; sorusu ekleyin.
                      </p>
                    )}
                  </div>
                </div>
              </Kart>

              <Kart baslik="Sorular"
                aciklama="Cevaplayanın dolduracağı alanlar. Tablo tipi, Excel gibi satır satır doldurulur.">
                <FormOlusturucu alanlar={alanlar} onDegis={setAlanlar}
                  sablonlar={[sonrakiBaslik, sonrakiAciklama]} />
              </Kart>

              <Kart baslik="Form dolunca ne olsun"
                aciklama="Bağlı görev her hâlükârda tamamlanır. Buradan ayrıca yeni bir görev açtırabilirsiniz.">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={sonrakiAktif} className="mt-0.5"
                    onChange={e => setSonrakiAktif(e.target.checked)} />
                  <span>
                    <span className="text-sm font-semibold block" style={{ color: R.etiket }}>
                      Sonraki görevi otomatik aç
                    </span>
                    <span className="text-xs leading-relaxed" style={{ color: R.yardim }}>
                      Başlıkta <code style={{ color: '#0f766e', background: '#f0fdfa', padding: '1px 4px', borderRadius: 4 }}>
                      {'{{soru_kimliği}}'}</code> yazarsanız cevapla değişir. Kimlikleri soru
                      kartlarında görebilirsiniz.
                    </span>
                  </span>
                </label>

                {sonrakiAktif && (
                  <div className="space-y-4 mt-4 pt-4" style={{ borderTop: `1px solid ${R.kenarHafif}` }}>
                    <div>
                      <Etiket zorunlu>Görev başlığı şablonu</Etiket>
                      <input style={girdi} value={sonrakiBaslik}
                        placeholder="ör. {{sorumlu}} sayımı sonrası malzeme siparişi"
                        onChange={e => setSonrakiBaslik(e.target.value)} />
                    </div>
                    <div>
                      <Etiket>Açıklama şablonu</Etiket>
                      <textarea rows={2} style={{ ...girdi, resize: 'vertical' }} value={sonrakiAciklama}
                        onChange={e => setSonrakiAciklama(e.target.value)} />
                      <p className="text-[11px] mt-1" style={{ color: R.yardim }}>
                        Tüm cevapların özeti zaten otomatik ekleniyor.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Etiket>Öncelik</Etiket>
                        <select style={girdi} value={sonrakiOncelik} onChange={e => setSonrakiOncelik(e.target.value)}>
                          {ONCELIKLER.map(o => <option key={o.v} value={o.v}>{o.e}</option>)}
                        </select>
                      </div>
                      <div>
                        <Etiket>Tür</Etiket>
                        <select style={girdi} value={sonrakiTur} onChange={e => setSonrakiTur(e.target.value)}>
                          {TASK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Etiket>Termin (kaç gün sonra)</Etiket>
                        <input type="number" min={0} style={girdi} placeholder="boş = terminsiz"
                          value={sonrakiTermin} onChange={e => setSonrakiTermin(e.target.value)} />
                      </div>
                      <div>
                        <Etiket>Kime atansın</Etiket>
                        <select style={girdi} value={sonrakiKaynak}
                          onChange={e => setSonrakiKaynak(e.target.value as typeof sonrakiKaynak)}>
                          <option value="gonderen">Formu gönderen</option>
                          <option value="yanitlayan">Formu dolduran</option>
                          <option value="sabit">Belirli bir kişi</option>
                        </select>
                      </div>
                    </div>
                    {sonrakiKaynak === 'sabit' && (
                      <select style={girdi} value={sonrakiAtanan} onChange={e => setSonrakiAtanan(e.target.value)}>
                        <option value="">-- Kişi seçin --</option>
                        {uyeler.map(u => <option key={u.id} value={u.id}>{u.full_name || u.id}</option>)}
                      </select>
                    )}
                    {sonrakiKaynak === 'yanitlayan' && erisim === 'baglanti' && (
                      <p className="text-[12px] rounded-lg px-3 py-2 leading-relaxed"
                        style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }}>
                        Açık bağlantıda dolduranın kimliği bilinmez; görev atanmamış açılır.
                      </p>
                    )}
                  </div>
                )}
              </Kart>
            </div>

            {/* ── Sağ: canlı önizleme ── */}
            <aside className="lg:sticky lg:top-[76px] min-w-0">
              <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: `1px solid ${R.kenarHafif}` }}>
                <div className="px-5 py-3.5 flex items-center justify-between"
                  style={{ borderBottom: `1px solid ${R.kenarHafif}`, background: '#0f2942' }}>
                  <h2 className="text-sm font-bold text-white">Canlı önizleme</h2>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(255,255,255,0.15)', color: '#bae6fd' }}>
                    Cevaplayanın gördüğü
                  </span>
                </div>
                <div className="p-4 max-h-[70vh] overflow-y-auto" style={{ background: '#eef2f7' }}>
                  {alanlar.length === 0 ? (
                    <div className="text-center py-10 text-sm rounded-xl"
                      style={{ color: R.yardim, background: '#fff', border: `1px dashed ${R.kenar}` }}>
                      Soru ekledikçe burada göreceksiniz.
                    </div>
                  ) : (
                    <>
                      <div className="rounded-xl px-4 py-3.5 mb-3"
                        style={{ background: '#fff', border: `1px solid ${R.kenarHafif}`, borderTop: '3px solid #2288c9' }}>
                        <div className="text-[17px] font-bold leading-tight" style={{ color: R.metin }}>
                          {baslik || 'Form başlığı'}
                        </div>
                        {aciklama && (
                          <p className="text-[13px] mt-1.5 leading-relaxed" style={{ color: '#475569' }}>{aciklama}</p>
                        )}
                      </div>
                      {/* Gerçek doldurma bileşeni — önizleme ile gerçeğin
                          ayrışmaması için ayrı bir render yazılmadı. */}
                      <FormDoldurucu alanlar={alanlar} onGonder={async () => null} onizleme />
                    </>
                  )}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </form>
    </div>
  )
}
