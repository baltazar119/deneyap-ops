'use client'

import { useEffect, useState, useRef } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useOrg } from '@/lib/supabase/orgContext'

export default function SettingsPage() {
  const router = useRouter()
  const { org, orgRole, userId, userEmail, avatarUrl, isAdmin, isOwner, isPro, loading: orgLoading } = useOrg()

  const [orgName, setOrgName] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#0d1a2a')
  const [accentColor, setAccentColor] = useState('#2288c9')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [claimingOwner, setClaimingOwner] = useState(false)
  const [claimMsg, setClaimMsg] = useState<string | null>(null)
  const [rotatingCode, setRotatingCode] = useState(false)
  const [copyMsg, setCopyMsg] = useState<string | null>(null)

  // Logo
  const [logoUrl, setLogoUrl]           = useState<string | null>(null)
  const [logoPreview, setLogoPreview]   = useState<string | null>(null)
  const [logoFile, setLogoFile]         = useState<File | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoMsg, setLogoMsg]           = useState<string | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)

  // Otomasyon ayarları
  const [autoSettings, setAutoSettings] = useState({
    task_overdue:          true,
    task_due_soon:         true,
    sprint_ending_soon:    true,
    meeting_notifications: true,
    member_overload:       true,
    overload_threshold:    5,
  })
  const [autoSaving, setAutoSaving] = useState(false)
  const [autoSaved, setAutoSaved]   = useState(false)

  useEffect(() => {
    if (orgLoading) return
    if (!org || !userId) { router.replace('/login'); return }
    if (!isAdmin) { router.replace(`/org/${org.slug}/dashboard`); return }

    setOrgName(org.name)
    setPrimaryColor(org.primary_color ?? '#0d1a2a')
    setAccentColor(org.accent_color ?? '#2288c9')
    setLogoUrl(org.logo_url ?? null)

    // Otomasyon ayarlarını çek
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      fetch(`/api/org/${org.slug}/automation-settings`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      })
        .then(r => r.json())
        .then(data => {
          if (data.settings) setAutoSettings(s => ({ ...s, ...data.settings }))
        })
        .catch(() => {})
    })
  }, [orgLoading, org, userId, isAdmin, router])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!org) return
    setSaving(true)
    setSaved(false)

    await supabase
      .from('organizations')
      .update({ name: orgName.trim(), primary_color: primaryColor, accent_color: accentColor })
      .eq('id', org.id)

    await supabase
      .from('brand_settings')
      .upsert({ organization_id: org.id, org_name: orgName.trim(), primary_color: primaryColor, accent_color: accentColor })

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  async function handleClaimOwner() {
    if (!org || !isAdmin || isOwner) return
    setClaimingOwner(true)
    setClaimMsg(null)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setClaimingOwner(false); return }

    const res = await fetch(`/api/org/${org.slug}/claim-owner`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}` },
    })
    const data = await res.json()
    if (!res.ok) {
      setClaimMsg(data.error ?? 'Hata oluştu')
      setClaimingOwner(false)
    } else {
      window.location.reload()
    }
  }

  async function handleCopyCode() {
    if (!org?.join_code) return
    try {
      await navigator.clipboard.writeText(org.join_code)
      setCopyMsg('Kopyalandı!')
      setTimeout(() => setCopyMsg(null), 2000)
    } catch {
      setCopyMsg('Kopyalanamadı')
      setTimeout(() => setCopyMsg(null), 2000)
    }
  }

  async function handleRotateJoinCode() {
    if (!org || !isAdmin) return
    setRotatingCode(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setRotatingCode(false); return }

    const res = await fetch(`/api/org/${org.slug}/rotate-join-code`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}` },
    })
    if (res.ok) {
      window.location.reload()
    } else {
      setRotatingCode(false)
    }
  }

  function handleLogoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      setLogoMsg('Dosya 2 MB\'ı geçemez')
      return
    }
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
    setLogoMsg(null)
  }

  async function handleLogoUpload() {
    if (!logoFile || !org) return
    setLogoUploading(true)
    setLogoMsg(null)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setLogoUploading(false); return }

    const form = new FormData()
    form.append('file', logoFile)

    const res = await fetch(`/api/org/${org.slug}/logo`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}` },
      body: form,
    })
    const data = await res.json()
    if (!res.ok) {
      setLogoMsg(data.error ?? 'Yükleme başarısız')
    } else {
      setLogoUrl(data.logo_url)
      setLogoPreview(null)
      setLogoFile(null)
      setLogoMsg('Logo güncellendi!')
      setTimeout(() => setLogoMsg(null), 3000)
      // Sayfayı yenilemeden cache'i temizle
      sessionStorage.removeItem(`deneyap_org_v2_${session.user.id}_${org.slug}`)
    }
    setLogoUploading(false)
  }

  async function handleLogoRemove() {
    if (!org) return
    setLogoUploading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setLogoUploading(false); return }

    await fetch(`/api/org/${org.slug}/logo`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${session.access_token}` },
    })
    setLogoUrl(null)
    setLogoPreview(null)
    setLogoFile(null)
    sessionStorage.removeItem(`deneyap_org_v2_${session.user.id}_${org.slug}`)
    setLogoUploading(false)
  }

  async function handleAutoSave(e: React.FormEvent) {
    e.preventDefault()
    if (!org) return
    setAutoSaving(true)
    setAutoSaved(false)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setAutoSaving(false); return }
    await fetch(`/api/org/${org.slug}/automation-settings`, {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(autoSettings),
    })
    setAutoSaving(false)
    setAutoSaved(true)
    setTimeout(() => setAutoSaved(false), 2500)
  }

  async function handleDelete() {
    if (!org || !isOwner) return
    const confirmed = window.prompt(`Workspace'i silmek için "${org.name}" yazın`)
    if (confirmed !== org.name) return

    setDeleting(true)
    await supabase.from('organizations').delete().eq('id', org.id)
    window.location.href = '/workspaces'
  }

  const planFeatures = [
    { label: 'Görev & Sprint Yönetimi', free: true, pro: true },
    { label: 'Kanban Panosu', free: true, pro: true },
    { label: 'Bildirimler (Uygulama içi)', free: true, pro: true },
    { label: 'Üye Sayısı', free: '5 üye', pro: 'Sınırsız' },
    { label: 'AI Görev Asistanı', free: false, pro: true },
    { label: 'Danışmanlık Modülü', free: false, pro: true },
    { label: 'Google Drive Entegrasyonu', free: false, pro: true },
    { label: 'Email Bildirimleri', free: false, pro: true },
    { label: 'Özel Marka (Logo & Renkler)', free: false, pro: true },
    { label: 'CSV Dışa Aktarma', free: false, pro: true },
  ]

  if (orgLoading) {
    return <div className="min-h-screen bg-[#060e18]"><div className="sticky top-0 h-[60px] bg-gradient-to-r from-[#0d1a2a] to-[#182c3f]" /></div>
  }

  return (
    <div className="min-h-screen" style={{ background: '#f5f7fa' }}>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <h1 className="text-2xl font-bold text-[#0d1a2a]">Workspace Ayarları</h1>

        {/* Kurum Kimliği — Logo */}
        {isAdmin && (
          <div className="bg-white rounded-2xl border border-[#e5e7eb] p-6 space-y-5">
            <div>
              <h2 className="font-semibold text-[#0d1a2a]">Kurum Kimliği</h2>
              <p className="text-sm text-[#6b7280] mt-0.5">Logo ve isim tüm sayfalarda belirgin şekilde görünür.</p>
            </div>

            {/* Logo önizleme + yükleme */}
            <div className="flex items-start gap-5">
              {/* Mevcut / önizleme */}
              <div
                className="shrink-0 w-20 h-20 rounded-2xl overflow-hidden flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, rgba(34,136,201,0.12), rgba(42,187,213,0.08))',
                  border: '2px solid rgba(34,136,201,0.18)',
                  boxShadow: '0 2px 12px rgba(34,136,201,0.1)',
                }}
              >
                {(logoPreview || logoUrl) ? (
                  <Image
                    src={logoPreview ?? logoUrl!}
                    alt="Logo"
                    width={80}
                    height={80}
                    className="w-full h-full object-contain"
                    unoptimized={!!logoPreview}
                  />
                ) : (
                  <Image src="/logo.png" alt="DENEYAP" width={44} height={44} />
                )}
              </div>

              <div className="flex-1 space-y-3">
                <div className="text-sm font-medium text-[#374151]">
                  {logoUrl && !logoPreview ? 'Özel logo aktif' : logoPreview ? 'Yeni logo seçildi' : 'Varsayılan logo kullanılıyor'}
                </div>
                <p className="text-xs text-[#9ca3af]">JPG, PNG, WebP veya SVG · En fazla 2 MB · Önerilen: 200×200 px kare</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={logoUploading}
                    className="px-4 py-2 rounded-xl text-sm font-medium border border-[#2288c9] text-[#2288c9] hover:bg-[#2288c9]/5 transition-colors disabled:opacity-50"
                  >
                    Dosya Seç
                  </button>
                  {logoPreview && logoFile && (
                    <button
                      type="button"
                      onClick={handleLogoUpload}
                      disabled={logoUploading}
                      className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#2288c9] hover:bg-[#1a6fa0] text-white transition-colors disabled:opacity-50"
                    >
                      {logoUploading ? 'Yükleniyor...' : 'Kaydet'}
                    </button>
                  )}
                  {logoUrl && !logoPreview && (
                    <button
                      type="button"
                      onClick={handleLogoRemove}
                      disabled={logoUploading}
                      className="px-4 py-2 rounded-xl text-sm font-medium border border-[#e5e7eb] text-[#6b7280] hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors disabled:opacity-50"
                    >
                      Kaldır
                    </button>
                  )}
                  {logoPreview && (
                    <button
                      type="button"
                      onClick={() => { setLogoPreview(null); setLogoFile(null) }}
                      className="px-3 py-2 rounded-xl text-sm text-[#9ca3af] hover:text-[#6b7280] transition-colors"
                    >
                      İptal
                    </button>
                  )}
                </div>
                {logoMsg && (
                  <p className={`text-sm font-medium ${logoMsg.includes('!') ? 'text-green-600' : 'text-red-500'}`}>
                    {logoMsg}
                  </p>
                )}
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={handleLogoSelect}
                />
              </div>
            </div>
          </div>
        )}

        {/* Genel ayarlar */}
        <form onSubmit={handleSave} className="bg-white rounded-2xl border border-[#e5e7eb] p-6 space-y-5">
          <h2 className="font-semibold text-[#0d1a2a]">Genel</h2>

          <div>
            <label className="block text-sm font-medium text-[#374151] mb-1.5">Workspace Adı</label>
            <input
              type="text"
              value={orgName}
              onChange={e => setOrgName(e.target.value)}
              maxLength={60}
              required
              className="w-full border border-[#e5e7eb] rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#2288c9]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#374151] mb-1.5">Workspace URL'i</label>
            <div className="flex items-center bg-[#f9fafb] border border-[#e5e7eb] rounded-xl px-4 py-2.5 gap-1">
              <span className="text-[#9ca3af] text-sm">/org/</span>
              <span className="text-sm text-[#374151] font-mono">{org?.slug}</span>
            </div>
            <p className="text-xs text-[#9ca3af] mt-1">URL değiştirilemez (bağlantılar bozulur)</p>
          </div>

          {/* Marka renkleri (sadece Pro) */}
          {isPro && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-[#374151]">Marka Renkleri</p>
              <div className="flex gap-4">
                <div>
                  <label className="block text-xs text-[#6b7280] mb-1">Arka Plan</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)}
                      className="w-8 h-8 rounded-lg cursor-pointer border border-[#e5e7eb]" />
                    <span className="text-xs font-mono text-[#374151]">{primaryColor}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-[#6b7280] mb-1">Vurgu Rengi</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)}
                      className="w-8 h-8 rounded-lg cursor-pointer border border-[#e5e7eb]" />
                    <span className="text-xs font-mono text-[#374151]">{accentColor}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={saving || !orgName.trim()}
            className="bg-[#2288c9] hover:bg-[#1a6fa0] disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
          >
            {saving ? 'Kaydediliyor...' : saved ? '✓ Kaydedildi' : 'Kaydet'}
          </button>
        </form>

        {/* Plan bilgisi */}
        <div className="bg-white rounded-2xl border border-[#e5e7eb] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-[#0d1a2a]">Plan</h2>
            <span className={`text-xs font-bold px-3 py-1 rounded-full ${isPro ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-gray-100 text-gray-600'}`}>
              {isPro ? '✦ PRO' : 'ÜCRETSİZ'}
            </span>
          </div>

          <div className="divide-y divide-[#f3f4f6]">
            {planFeatures.map(f => (
              <div key={f.label} className="flex items-center justify-between py-2.5">
                <span className="text-sm text-[#374151]">{f.label}</span>
                <div className="flex items-center gap-4 text-sm">
                  <span className={`w-16 text-center ${typeof f.free === 'boolean' ? (f.free ? 'text-green-600' : 'text-[#d1d5db]') : 'text-[#374151]'}`}>
                    {typeof f.free === 'boolean' ? (f.free ? '✓' : '—') : f.free}
                  </span>
                  <span className={`w-20 text-center font-medium ${typeof f.pro === 'boolean' ? 'text-[#2288c9]' : 'text-amber-600'}`}>
                    {typeof f.pro === 'boolean' ? (f.pro ? '✓' : '—') : f.pro}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Plan yönetimi kullanıcı bazlıdır. Admin panelinden kontrol edilir. */}
          {!isPro && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
              Pro özelliklere erişmek için hesap planınızın yükseltilmesi gerekir.
              Ekip yöneticinize veya platform yönetimine başvurun.
            </div>
          )}
        </div>

        {/* Sahip talebi — org'da hiç owner yoksa admin görebilir */}
        {isAdmin && !isOwner && (
          <div className="bg-white rounded-2xl border border-amber-200 p-6">
            <h2 className="font-semibold text-amber-700 mb-1">Sahiplik Talebi</h2>
            <p className="text-sm text-[#6b7280] mb-4">
              Bu workspace'in henüz bir sahibi yok. Sahip olarak atanmak için butona tıkla.
              Sahip; üyeleri yönetebilir, workspace'i silebilir ve tüm ayarlara erişebilir.
            </p>
            <button
              onClick={handleClaimOwner}
              disabled={claimingOwner}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff' }}
            >
              {claimingOwner ? 'İşleniyor...' : '👑 Sahip Ol'}
            </button>
            {claimMsg && (
              <p className="mt-2 text-sm text-red-500">{claimMsg}</p>
            )}
          </div>
        )}

        {/* Otomasyon Ayarları */}
        {isAdmin && (
          <form onSubmit={handleAutoSave} className="bg-white rounded-2xl border border-[#e5e7eb] p-6 space-y-4">
            <div>
              <h2 className="font-semibold text-[#0d1a2a]">Otomasyonlar</h2>
              <p className="text-sm text-[#6b7280] mt-0.5">Her gün sabah 07:00&apos;de otomatik kontroller yapılır.</p>
            </div>

            {[
              { key: 'task_overdue',          label: 'Gecikmiş görev bildirimi',         desc: 'Bitiş tarihi geçmiş görevlerde atanan kişiye bildirim' },
              { key: 'task_due_soon',         label: '24 saat kala hatırlatma',          desc: 'Görev bitiş tarihi 24 saat içindeyse bildirim gönder' },
              { key: 'sprint_ending_soon',    label: 'Sprint bitiş uyarısı (2 gün kala)', desc: 'Aktif sprint 2 gün içinde bitiyorsa tüm üyelere bildirim' },
              { key: 'meeting_notifications', label: 'Toplantı davet bildirimleri',       desc: 'Toplantı oluşturulunca ve iptal edilince katılımcılara bildirim' },
              { key: 'member_overload',       label: 'Aşırı görev yükü uyarısı',         desc: 'Bir üye eşiği aşan sayıda aktif göreve sahipse admin\'e bildirim' },
            ].map(({ key, label, desc }) => (
              <label key={key} className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={autoSettings[key as keyof typeof autoSettings] as boolean}
                  onChange={e => setAutoSettings(s => ({ ...s, [key]: e.target.checked }))}
                  className="mt-0.5 accent-[#2288c9] w-4 h-4 flex-shrink-0"
                />
                <div>
                  <span className="text-sm font-medium text-[#374151]">{label}</span>
                  <p className="text-xs text-[#9ca3af]">{desc}</p>
                </div>
              </label>
            ))}

            {autoSettings.member_overload && (
              <div className="flex items-center gap-3 pl-7">
                <label className="text-sm text-[#374151]">Aşırı yük eşiği</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={autoSettings.overload_threshold}
                  onChange={e => setAutoSettings(s => ({ ...s, overload_threshold: Number(e.target.value) }))}
                  className="w-20 border border-[#e5e7eb] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#2288c9]"
                />
                <span className="text-sm text-[#9ca3af]">aktif görev</span>
              </div>
            )}

            <button
              type="submit"
              disabled={autoSaving}
              className="bg-[#2288c9] hover:bg-[#1a6fa0] disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
            >
              {autoSaving ? 'Kaydediliyor...' : autoSaved ? '✓ Kaydedildi' : 'Kaydet'}
            </button>
          </form>
        )}

        {/* Tehlike bölgesi */}
        {isOwner && (
          <div className="bg-white rounded-2xl border border-red-200 p-6">
            <h2 className="font-semibold text-red-600 mb-2">Tehlike Bölgesi</h2>
            <p className="text-sm text-[#6b7280] mb-4">
              Workspace silindiğinde tüm veriler kalıcı olarak kaybolur. Bu işlem geri alınamaz.
            </p>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50"
            >
              {deleting ? 'Siliniyor...' : 'Workspace\'i Sil'}
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
