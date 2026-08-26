'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useOrg } from '@/lib/supabase/orgContext'
import { rolAdi, rolAciklamasi } from '@/lib/roller'
import { ilEtiketi } from '@/lib/iller'

/**
 * Profil ve bildirim tercihleri.
 *
 * Bu sayfa daha önce YOKTU ama "Profilim" dört rolün de menüsünde duruyordu —
 * yani herkes 404 alıyordu. E-posta şablonlarının altındaki "profil
 * ayarlarınızdan yönetin" linki de buraya geliyor.
 *
 * Tercih ekranının olmaması, kullanıcıların `frequency` alanını hiçbir zaman
 * 'daily'/'weekly' yapamaması demekti; digest cron'u da bu yüzden pratikte
 * hep sıfır e-posta gönderiyordu.
 */

interface Tercihler {
  email_enabled: boolean
  frequency: 'instant' | 'daily' | 'weekly'
  task_assigned: boolean
  mention: boolean
  review_reply: boolean
  annotation_resolved: boolean
  sprint_changed: boolean
  new_version: boolean
}

const VARSAYILAN: Tercihler = {
  email_enabled: true,
  frequency: 'instant',
  task_assigned: true,
  mention: true,
  review_reply: true,
  annotation_resolved: true,
  sprint_changed: true,
  new_version: false,
}

const OLAYLAR: { key: keyof Tercihler; label: string; desc: string }[] = [
  { key: 'task_assigned',       label: 'Görev atama ve durum değişikliği', desc: 'Size görev atandığında, durumu değiştiğinde veya termini geçtiğinde' },
  { key: 'mention',             label: 'Bahsedilme',                       desc: 'Bir yorumda veya mesajda sizden bahsedildiğinde' },
  { key: 'sprint_changed',      label: 'Sprint güncellemeleri',            desc: 'Sprint başladığında, bittiğinde veya değiştiğinde' },
  { key: 'review_reply',        label: 'Danışmanlık yanıtları',            desc: 'Açtığınız bir soruya yanıt geldiğinde' },
  { key: 'annotation_resolved', label: 'Not çözümlendi',                   desc: 'Eklediğiniz bir not çözümlendi olarak işaretlendiğinde' },
  { key: 'new_version',         label: 'Yeni sürüm bildirimleri',          desc: 'Bir dosyanın yeni sürümü yüklendiğinde' },
]

const FREKANSLAR: { value: Tercihler['frequency']; label: string; desc: string }[] = [
  { value: 'instant', label: 'Anında',        desc: 'Her olay için ayrı e-posta (10 dk tekrar koruması var)' },
  { value: 'daily',   label: 'Günlük özet',   desc: 'Her sabah 08:00\'de tek e-postada toplanır' },
  { value: 'weekly',  label: 'Haftalık özet', desc: 'Pazartesi 09:00\'da tek e-postada toplanır' },
]

export default function ProfilePage() {
  const router = useRouter()
  const { org, orgRole, userIl, userId, userEmail, avatarUrl, loading: orgLoading } = useOrg()

  const slug = org?.slug ?? ''

  const [adSoyad, setAdSoyad]   = useState('')
  const [unvan, setUnvan]       = useState('')
  const [tercihler, setTercihler] = useState<Tercihler>(VARSAYILAN)
  const [loading, setLoading]   = useState(true)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [mesaj, setMesaj]       = useState<{ tip: 'ok' | 'hata'; metin: string } | null>(null)
  const [disaAktariliyor, setDisaAktariliyor] = useState(false)

  // Telegram bağlantısı
  const [tgHazir, setTgHazir]       = useState(false)
  const [tgBagli, setTgBagli]       = useState<{ gorunen_ad: string | null } | null>(null)
  const [tgBaglanti, setTgBaglanti] = useState<{ derinBaglanti: string; gecerlilikDakika: number } | null>(null)
  const [tgYukleniyor, setTgYukleniyor] = useState(false)

  useEffect(() => {
    if (orgLoading) return
    if (!org || !userId) { router.replace('/login'); return }

    async function yukle() {
      const [profilRes, tercihRes] = await Promise.all([
        supabase.from('profiles').select('full_name, title').eq('id', userId!).maybeSingle(),
        supabase.from('email_preferences').select('*').eq('user_id', userId!).maybeSingle(),
      ])

      setAdSoyad(profilRes.data?.full_name ?? '')
      setUnvan(profilRes.data?.title ?? '')

      if (tercihRes.data) {
        const d = tercihRes.data as unknown as Tercihler
        setTercihler({
          email_enabled:       d.email_enabled,
          frequency:           d.frequency,
          task_assigned:       d.task_assigned,
          mention:             d.mention,
          review_reply:        d.review_reply,
          annotation_resolved: d.annotation_resolved,
          sprint_changed:      d.sprint_changed,
          new_version:         d.new_version,
        })
      }
      await kanallariYukle()
      setLoading(false)
    }
    yukle()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgLoading, org?.id, userId])

  async function kanallariYukle() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch(`/api/org/${slug}/kanal/kod`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (!res.ok) return
    const j = await res.json()
    setTgHazir(!!j.telegramHazir)
    const tg = (j.baglantilar ?? []).find((b: { kanal: string }) => b.kanal === 'telegram')
    setTgBagli(tg ?? null)
  }

  async function telegramBagla() {
    setTgYukleniyor(true); setMesaj(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch(`/api/org/${slug}/kanal/kod`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ kanal: 'telegram' }),
      })
      const j = await res.json()
      if (!res.ok) { setMesaj({ tip: 'hata', metin: j.error ?? 'Bağlantı kodu alınamadı.' }); return }
      setTgBaglanti(j)
      window.open(j.derinBaglanti, '_blank', 'noopener')
    } finally {
      setTgYukleniyor(false)
    }
  }

  async function telegramKaldir() {
    if (!confirm('Telegram bağlantısı kaldırılacak. Bildirimleri artık yalnızca e-posta ile alacaksınız.')) return
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await fetch(`/api/org/${slug}/kanal/kod?kanal=telegram`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${session.access_token}` },
    })
    setTgBagli(null); setTgBaglanti(null)
  }

  async function kaydet() {
    if (!userId) return
    setKaydediliyor(true); setMesaj(null)

    const [profilHata, tercihHata] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from('profiles')
        .update({ full_name: adSoyad.trim() || null, title: unvan.trim() || null })
        .eq('id', userId)
        .then((r: { error: unknown }) => r.error),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from('email_preferences')
        .upsert({ user_id: userId, ...tercihler }, { onConflict: 'user_id' })
        .then((r: { error: unknown }) => r.error),
    ])

    setKaydediliyor(false)
    if (profilHata || tercihHata) {
      setMesaj({ tip: 'hata', metin: 'Kaydedilemedi. Lütfen tekrar deneyin.' })
      return
    }
    setMesaj({ tip: 'ok', metin: 'Kaydedildi.' })
    setTimeout(() => setMesaj(null), 3000)
  }

  /** KVKK md.20 — kişisel veri dışa aktarımı. API vardı ama çağıran arayüz yoktu. */
  async function verileriIndir() {
    setDisaAktariliyor(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch('/api/me/export', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) throw new Error('export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `deneyap-verilerim-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      setMesaj({ tip: 'hata', metin: 'Veriler indirilemedi.' })
    } finally {
      setDisaAktariliyor(false)
    }
  }

  if (orgLoading || loading) {
    return (
      <div className="min-h-screen px-6 py-5 space-y-4" style={{ background: '#f5f7fa' }}>
        <div className="skeleton h-8 w-48 rounded-xl" />
        <div className="skeleton h-40 rounded-2xl" />
        <div className="skeleton h-64 rounded-2xl" />
      </div>
    )
  }

  const bas = (adSoyad || userEmail || '?').charAt(0).toUpperCase()

  return (
    <div className="min-h-screen px-4 sm:px-6 py-5" style={{ background: '#f5f7fa' }}>
      <div className="max-w-3xl mx-auto space-y-5">

        {/* ── Başlık ── */}
        <div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight" style={{ color: '#0d1a2a' }}>
            Profilim
          </h1>
          <p className="text-sm mt-0.5" style={{ color: '#64748b' }}>
            {org?.name} · Kişisel bilgileriniz ve bildirim tercihleriniz
          </p>
        </div>

        {/* ── Kimlik ── */}
        <div className="card">
          <div className="flex items-center gap-4 mb-5">
            <div
              className="rounded-2xl flex items-center justify-center font-bold text-white shrink-0 overflow-hidden"
              style={{ width: 56, height: 56, fontSize: 22, background: avatarUrl ? '#e2eaf2' : '#2288c9' }}
            >
              {avatarUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : bas}
            </div>
            <div className="min-w-0">
              <div className="font-bold truncate" style={{ color: '#0d1a2a' }}>
                {adSoyad || 'İsimsiz kullanıcı'}
              </div>
              <div className="text-sm truncate" style={{ color: '#94a3b8' }}>{userEmail}</div>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-lg"
                  style={{ background: '#eff6ff', color: '#1e40af', border: '1px solid #93c5fd' }}
                >
                  {rolAdi(orgRole)}
                </span>
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-lg"
                  style={{ background: '#f0fdfa', color: '#0f766e', border: '1px solid #5eead4' }}
                >
                  📍 {ilEtiketi(userIl)}
                </span>
              </div>
            </div>
          </div>

          <p className="text-xs mb-4" style={{ color: '#94a3b8' }}>
            {rolAciklamasi(orgRole)} Rolünüzü ve sorumlu olduğunuz ili yöneticiniz belirler.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>Ad Soyad</label>
              <input value={adSoyad} onChange={e => setAdSoyad(e.target.value)} className="input" placeholder="Adınız Soyadınız" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>Unvan</label>
              <input value={unvan} onChange={e => setUnvan(e.target.value)} className="input" placeholder="Örn. Atölye Sorumlusu" />
            </div>
          </div>
        </div>

        {/* ── Bildirim tercihleri ── */}
        <div className="card">
          <h2 className="font-semibold mb-1" style={{ color: '#0d1a2a' }}>E-posta Bildirimleri</h2>
          <p className="text-xs mb-4" style={{ color: '#94a3b8' }}>
            Uygulama içi bildirimler her zaman gelir; buradaki ayarlar yalnızca e-postayı etkiler.
          </p>

          <label className="flex items-start gap-3 cursor-pointer mb-5">
            <input
              type="checkbox"
              checked={tercihler.email_enabled}
              onChange={e => setTercihler(t => ({ ...t, email_enabled: e.target.checked }))}
              className="mt-0.5 accent-[#2288c9] w-4 h-4 flex-shrink-0"
            />
            <div>
              <span className="text-sm font-medium" style={{ color: '#374151' }}>E-posta bildirimleri açık</span>
              <p className="text-xs" style={{ color: '#9ca3af' }}>Kapatırsanız aşağıdaki ayarların hiçbiri uygulanmaz.</p>
            </div>
          </label>

          <div style={{ opacity: tercihler.email_enabled ? 1 : 0.45, pointerEvents: tercihler.email_enabled ? 'auto' : 'none' }}>
            {/* Frekans */}
            <div className="mb-5">
              <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#64748b' }}>
                Gönderim sıklığı
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {FREKANSLAR.map(f => {
                  const secili = tercihler.frequency === f.value
                  return (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setTercihler(t => ({ ...t, frequency: f.value }))}
                      className="text-left rounded-xl transition-all"
                      style={{
                        padding: '10px 12px',
                        background: secili ? '#eff6ff' : '#fff',
                        border: `1.5px solid ${secili ? '#2288c9' : '#e5e7eb'}`,
                        cursor: 'pointer',
                      }}
                    >
                      <div className="text-sm font-semibold" style={{ color: secili ? '#1e40af' : '#374151' }}>
                        {f.label}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>{f.desc}</div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Olaylar */}
            <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#64748b' }}>
              Hangi olaylarda
            </div>
            <div className="space-y-3">
              {OLAYLAR.map(({ key, label, desc }) => (
                <label key={key} className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tercihler[key] as boolean}
                    onChange={e => setTercihler(t => ({ ...t, [key]: e.target.checked }))}
                    className="mt-0.5 accent-[#2288c9] w-4 h-4 flex-shrink-0"
                  />
                  <div>
                    <span className="text-sm font-medium" style={{ color: '#374151' }}>{label}</span>
                    <p className="text-xs" style={{ color: '#9ca3af' }}>{desc}</p>
                  </div>
                </label>
              ))}
            </div>

            {tercihler.frequency !== 'instant' && (
              <p
                className="text-xs mt-4 rounded-xl"
                style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fcd34d', padding: '9px 12px' }}
              >
                Özet modunda gecikme ve termin uyarıları da özete girer — acil durumları
                anında görmek istiyorsanız &quot;Anında&quot; seçeneğini tercih edin.
              </p>
            )}
          </div>
        </div>

        {/* ── Kaydet ── */}
        <div className="flex items-center gap-3">
          <button onClick={kaydet} disabled={kaydediliyor} className="btn-primary">
            {kaydediliyor ? 'Kaydediliyor…' : 'Değişiklikleri Kaydet'}
          </button>
          {mesaj && (
            <span
              className="text-sm font-semibold"
              style={{ color: mesaj.tip === 'ok' ? '#16a34a' : '#dc2626' }}
            >
              {mesaj.tip === 'ok' ? '✓ ' : '✕ '}{mesaj.metin}
            </span>
          )}
        </div>

        {/* ── Telegram ── */}
        {tgHazir && (
          <div className="card">
            <h2 className="font-semibold mb-1" style={{ color: '#0d1a2a' }}>Telegram Bildirimleri</h2>
            <p className="text-xs mb-4" style={{ color: '#94a3b8' }}>
              Gecikme ve termin uyarılarını Telegram&apos;dan alın. Gelen mesajdaki
              düğmeyle görevi tek dokunuşla tamamlandı olarak işaretleyebilir veya
              terminini bir hafta erteleyebilirsiniz.
            </p>

            {tgBagli ? (
              <div className="flex items-center justify-between gap-3 rounded-xl px-4 py-3 flex-wrap"
                style={{ background: '#f0fdfa', border: '1px solid #5eead4' }}>
                <div>
                  <div className="text-sm font-semibold" style={{ color: '#0f766e' }}>✓ Bağlı</div>
                  {tgBagli.gorunen_ad && (
                    <div className="text-xs" style={{ color: '#64748b' }}>{tgBagli.gorunen_ad}</div>
                  )}
                </div>
                <button onClick={telegramKaldir}
                  className="text-sm font-semibold px-3 py-1.5 rounded-lg"
                  style={{ background: '#fff', color: '#dc2626', border: '1.5px solid #fca5a5' }}>
                  Bağlantıyı Kaldır
                </button>
              </div>
            ) : (
              <>
                <button onClick={telegramBagla} disabled={tgYukleniyor} className="btn-secondary">
                  {tgYukleniyor ? 'Hazırlanıyor…' : "Telegram'a Bağla"}
                </button>
                {tgBaglanti && (
                  <div className="mt-3 rounded-xl px-4 py-3 text-xs"
                    style={{ background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e' }}>
                    Telegram yeni sekmede açıldı. Açılmadıysa{' '}
                    <a href={tgBaglanti.derinBaglanti} target="_blank" rel="noopener noreferrer"
                      style={{ color: '#2288c9', fontWeight: 600 }}>bu bağlantıya</a>{' '}
                    tıklayın ve <strong>Başlat</strong> düğmesine basın.
                    Bağlantı kodu {tgBaglanti.gecerlilikDakika} dakika geçerli.
                    <div className="mt-2">
                      <button onClick={kanallariYukle} className="btn-secondary" style={{ fontSize: 12, padding: '5px 10px' }}>
                        Bağlandım, kontrol et
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Verilerim (KVKK) ── */}
        <div className="card">
          <h2 className="font-semibold mb-1" style={{ color: '#0d1a2a' }}>Verilerim</h2>
          <p className="text-xs mb-4" style={{ color: '#94a3b8' }}>
            KVKK kapsamında sizinle ilgili tuttuğumuz verilerin tamamını JSON dosyası
            olarak indirebilirsiniz: profil bilgileriniz, görevleriniz, saha kayıtlarınız,
            çalışma planınız ve bildirim tercihleriniz.
          </p>
          <button onClick={verileriIndir} disabled={disaAktariliyor} className="btn-secondary">
            {disaAktariliyor ? 'Hazırlanıyor…' : 'Verilerimi İndir (JSON)'}
          </button>
        </div>

      </div>
    </div>
  )
}
