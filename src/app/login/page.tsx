'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import Image from 'next/image'
import { Turnstile } from '@marsidev/react-turnstile'
import { supabase } from '@/lib/supabase/client'
import { DEMO_HESAPLAR, DEMO_MODU_ACIK, DEMO_SIFRE } from '@/lib/demoHesaplar'

type Mode = 'login' | 'signup'

/* ── Sağ panel — ürün tanıtım ───────────────────────────────── */
function ShowcasePanel() {
  const NAV_ITEMS = ['Dashboard', 'Sprint', 'Ekip', 'Rapor']
  const STATS = [
    { label: 'Aktif Görev', val: '24', color: '#2abbd5' },
    { label: 'Tamamlanan', val: '68', color: '#10b981' },
    { label: 'Ekip Üyesi', val: '9',  color: '#f59e0b' },
  ]
  const TEAM = [
    { name: 'Ahmet Y.', task: 'Saha ziyareti', color: '#10b981' },
    { name: 'Selin K.', task: 'Rapor hazırlığı', color: '#2abbd5' },
    { name: 'Burak M.', task: 'Eğitim planı',   color: '#f59e0b' },
  ]

  return (
    <div className="lp-showcase">
      <div className="lp-showcase-bg" />
      <div className="lp-showcase-orb1" />
      <div className="lp-showcase-orb2" />

      <div className="lp-showcase-content">

        {/* Eyebrow */}
        <div className="lp-showcase-eyebrow">✦ DENEYAP Operasyon Platformu</div>

        {/* Başlık */}
        <h2 className="lp-showcase-title">
          Operasyonunuzu kolayca<br />
          <span className="lp-showcase-accent">organize edin.</span>
        </h2>
        <p className="lp-showcase-sub">
          Görev takibi, sprint planlama ve AI destekli operasyon yönetimi.
        </p>

        {/* ── Floating app window ── */}
        <div className="lp-window-wrapper">
          <div className="lp-app-window">

            {/* Browser chrome */}
            <div className="lp-window-chrome">
              <div className="lp-window-dots">
                <span style={{ background: '#ff5f57' }} />
                <span style={{ background: '#febc2e' }} />
                <span style={{ background: '#28c840' }} />
              </div>
              <div className="lp-window-appname">DENEYAP Ops — Dashboard</div>
            </div>

            {/* App top-bar */}
            <div className="lp-dash-topbar">
              <div style={{ width: 18, height: 18, borderRadius: 5, background: 'rgba(42,187,213,0.3)', border: '1px solid rgba(42,187,213,0.45)', flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 800, color: 'rgba(255,255,255,0.88)', letterSpacing: '-0.01em' }}>DENEYAP Ops</span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                {NAV_ITEMS.map(t => (
                  <span key={t} style={{
                    fontSize: 11, padding: '3px 10px', borderRadius: 5, fontWeight: 600,
                    background: t === 'Dashboard' ? 'rgba(42,187,213,0.18)' : 'transparent',
                    color: t === 'Dashboard' ? '#7acfe6' : 'rgba(255,255,255,0.35)',
                  }}>{t}</span>
                ))}
              </div>
            </div>

            {/* Sidebar + Main */}
            <div className="lp-dash-layout">

              {/* Sidebar */}
              <div className="lp-dash-sidebar">
                {['D','T','S','E'].map((label, i) => (
                  <div key={label} style={{
                    width: 30, height: 30, borderRadius: 8,
                    background: i === 0 ? 'rgba(42,187,213,0.2)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${i === 0 ? 'rgba(42,187,213,0.4)' : 'rgba(255,255,255,0.07)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 800,
                    color: i === 0 ? '#7acfe6' : 'rgba(255,255,255,0.3)',
                  }}>{label}</div>
                ))}
              </div>

              {/* Main content */}
              <div className="lp-dash-main">

                {/* Stat row */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  {STATS.map(({ label, val, color }) => (
                    <div key={label} style={{
                      flex: 1, borderRadius: 9, padding: '10px 12px',
                      background: 'rgba(255,255,255,0.045)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}>
                      <div style={{ fontSize: 20, fontWeight: 900, color, lineHeight: 1 }}>{val}</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 4, lineHeight: 1.2 }}>{label}</div>
                    </div>
                  ))}
                </div>

                {/* Sprint card */}
                <div style={{
                  borderRadius: 10, padding: '12px 14px',
                  background: 'rgba(255,255,255,0.045)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  marginBottom: 12,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.65)' }}>Sprint #4 — Q2</span>
                    <span style={{
                      fontSize: 10, background: 'rgba(16,185,129,0.15)', color: '#6ee7b7',
                      border: '1px solid rgba(16,185,129,0.28)', padding: '2px 8px',
                      borderRadius: 5, fontWeight: 700,
                    }}>Aktif</span>
                  </div>
                  <div style={{ height: 5, background: 'rgba(255,255,255,0.09)', borderRadius: 100, overflow: 'hidden' }}>
                    <div style={{ width: '68%', height: '100%', background: 'linear-gradient(90deg,#2288c9,#2abbd5)', borderRadius: 100 }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.32)' }}>17 / 25 görev</span>
                    <span style={{ fontSize: 10, color: '#2abbd5', fontWeight: 700 }}>%68</span>
                  </div>
                </div>

                {/* Team list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(122,207,230,0.5)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>Ekip Durumu</div>
                  {TEAM.map(({ name, task, color }) => (
                    <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 24, height: 24, borderRadius: 50,
                        background: `${color}22`, border: `1px solid ${color}55`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, fontWeight: 900, color, flexShrink: 0,
                      }}>{name[0]}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.8)', lineHeight: 1 }}>{name}</div>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.32)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task}</div>
                      </div>
                      <div style={{ width: 8, height: 8, borderRadius: 50, background: color, flexShrink: 0, boxShadow: `0 0 6px ${color}` }} />
                    </div>
                  ))}
                </div>

              </div>
            </div>
          </div>

          {/* Ambient glow under window */}
          <div className="lp-window-glow" />
        </div>
        {/* ── /Floating app window ── */}

        {/* Özellik çipleri */}
        <div className="lp-feature-chips">
          {['Saha Takibi', 'Sprint Planlama', 'AI Görev Üretimi', 'Operasyon Riski', 'Raporlama'].map((f) => (
            <span key={f} className="lp-feature-chip">{f}</span>
          ))}
        </div>

      </div>
    </div>
  )
}

/* ── Ana sayfa ──────────────────────────────────────────────── */
export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [kvkkAccepted, setKvkkAccepted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  // Demo paneli varsayılan olarak KAPALI — açıkken sayfa uzuyor ve
  // gerçek kullanıcı için gürültü oluyordu
  const [demoAcik, setDemoAcik] = useState(false)
  const TURNSTILE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  const captchaEnabled = !!TURNSTILE_KEY

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    if (captchaEnabled && !turnstileToken) {
      setError('Lütfen robot olmadığınızı doğrulayın.')
      return
    }
    setLoading(true)
    try {
      if (mode === 'signup') await handleSignup()
      else await handleLogin()
    } catch {
      setError('Beklenmedik bir hata oluştu.')
      setLoading(false)
    }
  }

  async function handleGoogleLogin() {
    setGoogleLoading(true)
    setError(null)
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (oauthError) {
      setError('Google ile giriş başarısız. Lütfen tekrar deneyin.')
      setGoogleLoading(false)
    }
  }

  /** Demo hesapla tek tıkla giriş — panel yalnızca DEMO_MODU_ACIK iken görünür */
  async function handleDemoLogin(demoEmail: string) {
    setError(null); setMessage(null)
    setEmail(demoEmail); setPassword(DEMO_SIFRE)
    setLoading(true)
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: demoEmail, password: DEMO_SIFRE,
    })
    if (signInError || !data.session) {
      setError('Demo hesabı bulunamadı. Kurulum için: npm run seed:demo')
      setLoading(false)
      return
    }
    window.location.href = '/workspaces'
  }

  async function handleSignup() {
    if (!kvkkAccepted) {
      setError('Devam etmek için Gizlilik Politikası ve Kullanım Şartlarını kabul etmelisiniz.')
      setLoading(false)
      return
    }
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    if (signUpError) { setError(signUpError.message); setLoading(false); return }

    if (signUpData.session && signUpData.user) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('profiles').upsert({
        id: signUpData.user.id,
        role: 'member',
        full_name: fullName || email.split('@')[0],
        kvkk_accepted_at: new Date().toISOString(),
      }, { onConflict: 'id', ignoreDuplicates: false })
      window.location.href = '/onboarding/create-org'
      return
    }
    setMessage('Kayıt başarılı! Şimdi giriş yapabilirsiniz.')
    setMode('login')
    setLoading(false)
  }

  async function handleLogin() {
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) {
      if (signInError.message.includes('Email not confirmed')) {
        setError('E-posta adresiniz doğrulanmamış.')
      } else if (signInError.message.includes('Invalid login credentials')) {
        setError('E-posta veya şifre hatalı.')
      } else {
        setError(`Giriş hatası: ${signInError.message}`)
      }
      setLoading(false)
      return
    }
    if (!data.session) {
      setError('Oturum açılamadı. Lütfen tekrar deneyin.')
      setLoading(false)
      return
    }
    const searchParams = new URLSearchParams(window.location.search)
    const next = searchParams.get('next')
    window.location.href = next || '/workspaces'
  }

  return (
    <div className="lp-root">

      {/* ── Sol panel — form ── */}
      <div className="lp-left">
        <div className="lp-left-inner">

          {/* Logo */}
          <div className="flex items-center gap-2.5 mb-8">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(34,136,201,0.1)', border: '1px solid rgba(34,136,201,0.22)' }}>
              <Image src="/logo.svg" alt="DENEYAP" width={22} height={22} />
            </div>
            <span className="font-bold text-lg tracking-tight" style={{ color: '#0d1a2a' }}>DENEYAP Ops</span>
          </div>

          {/* Başlık */}
          <div className="mb-7">
            <h1 className="text-2xl font-black tracking-tight" style={{ color: '#0d1a2a' }}>
              {mode === 'login' ? 'Tekrar hoş geldiniz' : 'Hesap oluşturun'}
            </h1>
            <p className="text-sm mt-1.5" style={{ color: '#64748b' }}>
              {mode === 'login'
                ? 'Hesabınıza erişmek için giriş yapın.'
                : 'Operasyon ekibinizle çalışmaya hemen başlayın.'}
            </p>
          </div>

          {/* Tab toggle */}
          <div className="lp-tab-bar mb-6">
            <button type="button" onClick={() => { setMode('login'); setError(null) }}
              className={`lp-tab${mode === 'login' ? ' lp-tab-active' : ''}`}>
              Giriş Yap
            </button>
            <button type="button" onClick={() => { setMode('signup'); setError(null) }}
              className={`lp-tab${mode === 'signup' ? ' lp-tab-active' : ''}`}>
              Kayıt Ol
            </button>
          </div>

          {/* Demo hesapları — yalnızca NEXT_PUBLIC_DEMO_MODE=true iken */}
          {DEMO_MODU_ACIK && mode === 'login' && (
            <div className="lp-demo mb-4">
              <button type="button" className="lp-demo-ac" onClick={() => setDemoAcik(v => !v)}>
                <span>DEMO HESAPLA DENE</span>
                <span style={{ color: '#94a3b8', fontWeight: 500, fontSize: 11 }}>
                  {demoAcik ? `şifre: ${DEMO_SIFRE}` : 'rol seç, karşılaştır'}
                </span>
              </button>

              {demoAcik && (
                <div className="lp-demo-govde">
                  <div className="lp-demo-liste">
                    {DEMO_HESAPLAR.map((h, i) => (
                      <button
                        key={h.email}
                        type="button"
                        onClick={() => handleDemoLogin(h.email)}
                        disabled={loading || googleLoading}
                        className={`lp-demo-btn${i === DEMO_HESAPLAR.length - 1 && DEMO_HESAPLAR.length % 2 === 1 ? ' lp-demo-genis' : ''}`}
                      >
                        <span className="lp-demo-btn-ad">{h.rolAdi}</span>
                        <span className="lp-demo-btn-alt">
                          {h.role === 'member' ? h.il : h.email.split('@')[0]}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Google butonu */}
          <button type="button" onClick={handleGoogleLogin}
            disabled={googleLoading || loading} className="lp-social-btn mb-4">
            {googleLoading ? <span className="lp-spinner" /> : (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8064.54-1.8368.859-3.0477.859-2.3441 0-4.3282-1.5836-5.036-3.7104H.9574v2.3318C2.4382 15.9832 5.4818 18 9 18z" fill="#34A853"/>
                <path d="M3.964 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2822-1.71V4.9582H.9574A8.9965 8.9965 0 0 0 0 9c0 1.4523.3477 2.8268.9574 4.0418L3.964 10.71z" fill="#FBBC05"/>
                <path d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.4259 0 9 0 5.4818 0 2.4382 2.0168.9574 4.9582L3.964 7.29C4.6718 5.1632 6.6559 3.5795 9 3.5795z" fill="#EA4335"/>
              </svg>
            )}
            <span>{googleLoading ? 'Yönlendiriliyor…' : 'Google ile Giriş Yap'}</span>
          </button>

          {/* Ayırıcı */}
          <div className="lp-divider mb-5">
            <span>veya e-posta ile devam et</span>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="lp-label">Ad Soyad</label>
                <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
                  placeholder="Adınız Soyadınız" className="lp-field" required />
              </div>
            )}

            <div>
              <label className="lp-label">E-posta</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="ornek@deneyap.org" className="lp-field" required autoComplete="email" />
            </div>

            <div>
              <label className="lp-label">Şifre</label>
              <div style={{ position: 'relative' }}>
                <input type={showPass ? 'text' : 'password'} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'En az 8 karakter' : 'Şifreniz'}
                  className="lp-field" required minLength={mode === 'signup' ? 8 : 6}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  style={{ paddingRight: 40 }} />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  {showPass ? (
                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {mode === 'signup' && (
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={kvkkAccepted} onChange={(e) => setKvkkAccepted(e.target.checked)}
                  style={{ marginTop: 2, accentColor: '#2288c9', width: 15, height: 15, flexShrink: 0 }} />
                <span style={{ color: '#64748b', fontSize: 12, lineHeight: 1.5 }}>
                  <a href="/gizlilik" target="_blank" rel="noopener noreferrer" style={{ color: '#2288c9', textDecoration: 'underline' }}>Gizlilik Politikası</a>
                  {' '}ve{' '}
                  <a href="/kullanim-sartlari" target="_blank" rel="noopener noreferrer" style={{ color: '#2288c9', textDecoration: 'underline' }}>Kullanım Şartları</a>
                  {' '}okudum ve kabul ediyorum.
                </span>
              </label>
            )}

            {captchaEnabled && (
              <Turnstile
                siteKey={TURNSTILE_KEY!}
                onSuccess={(token) => setTurnstileToken(token)}
                onExpire={() => setTurnstileToken(null)}
                onError={() => setTurnstileToken(null)}
                options={{ theme: 'light', language: 'tr' }}
              />
            )}

            {error && <div className="lp-alert-error">{error}</div>}
            {message && <div className="lp-alert-success">{message}</div>}

            <button type="submit" disabled={loading || googleLoading || (captchaEnabled && !turnstileToken)} className="lp-submit-btn">
              {loading ? (
                <><span className="lp-spinner lp-spinner-white" />&nbsp;İşleniyor…</>
              ) : mode === 'login' ? 'Giriş Yap →' : 'Hesap Oluştur →'}
            </button>
          </form>

          {/* Footer */}
          <p className="text-xs text-center mt-6" style={{ color: '#94a3b8' }}>
            © {new Date().getFullYear()} DENEYAP Ops · Tüm hakları saklıdır.
          </p>
        </div>
      </div>

      {/* ── Sağ panel — showcase (masaüstünde görünür) ── */}
      <ShowcasePanel />
    </div>
  )
}
