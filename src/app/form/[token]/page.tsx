'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import FormDoldurucu from '@/components/form/FormDoldurucu'
import type { FormAlani, Cevaplar } from '@/lib/form/tipler'

/**
 * Form doldurma sayfası — org düzeninin DIŞINDA.
 *
 * `/eylem/[token]` ile aynı desen: kenar çubuğu, org bağlamı ve giriş zorunlu
 * değil. Açık bağlantıyla gelen kişi sistemin geri kalanını hiç görmemeli.
 *
 * "Sadece üyeler" formlarında sunucu 401 döndürüyor; bu sayfa o durumda
 * giriş bağlantısı gösteriyor ve oturum varsa token'ı başlıkla yolluyor.
 */

interface FormTanimi {
  baslik: string
  aciklama: string | null
  alanlar: FormAlani[]
  erisim: 'uyeler' | 'baglanti'
}

export default function FormDoldurPage() {
  const params = useParams<{ token: string }>()
  const token = params?.token ?? ''

  const [form, setForm] = useState<FormTanimi | null>(null)
  const [acik, setAcik] = useState(true)
  const [sebep, setSebep] = useState<string | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [girisGerekli, setGirisGerekli] = useState(false)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [bitti, setBitti] = useState(false)

  /** Oturum varsa Authorization ekle — üye formu bunu şart koşuyor. */
  const basliklar = useCallback(async (): Promise<HeadersInit> => {
    const { data: { session } } = await supabase.auth.getSession()
    return session
      ? { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }
      : { 'Content-Type': 'application/json' }
  }, [])

  useEffect(() => {
    if (!token) return
    let iptal = false
    ;(async () => {
      try {
        const r = await fetch(`/api/form/${token}`, { headers: await basliklar() })
        const d = await r.json().catch(() => ({}))
        if (iptal) return
        if (!r.ok) {
          setHata(d.error ?? 'Form açılamadı.')
          setGirisGerekli(d.girisGerekli === true)
        } else {
          setForm(d.form)
          setAcik(d.acik)
          setSebep(d.sebep)
        }
      } catch {
        if (!iptal) setHata('Bağlantı kurulamadı.')
      } finally {
        if (!iptal) setYukleniyor(false)
      }
    })()
    return () => { iptal = true }
  }, [token, basliklar])

  async function gonder(cevaplar: Cevaplar): Promise<string | null> {
    try {
      const r = await fetch(`/api/form/${token}`, {
        method: 'POST',
        headers: await basliklar(),
        body: JSON.stringify({ cevaplar }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) return d.error ?? 'Gönderilemedi.'
      setBitti(true)
      return null
    } catch {
      return 'Bağlantı kurulamadı.'
    }
  }

  return (
    <div className="min-h-screen" style={{ background: '#eef2f7' }}>
      {/* Marka bandı: dışarıdan gelen kişi formun nereden geldiğini görsün. */}
      <div style={{ background: '#0f2942' }}>
        <div className="max-w-2xl mx-auto px-4 py-3.5 flex items-center gap-2">
          <span className="text-[15px] font-bold text-white" style={{ letterSpacing: '-0.01em' }}>
            DENEYAP
          </span>
          <span className="text-[11px] font-semibold" style={{ color: 'rgba(255,255,255,0.5)' }}>OYS</span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 md:py-10">
        {yukleniyor ? (
          <div className="rounded-2xl p-6 md:p-8 space-y-3"
            style={{ background: '#fff', border: '1px solid #e2e8f0' }}>
            <div className="skeleton h-7 w-2/3 rounded-xl" />
            {[0, 1, 2].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}
          </div>
        ) : bitti ? (
          <div className="rounded-2xl p-8 text-center"
            style={{ background: '#fff', border: '1px solid #e2e8f0' }}>
            <div className="mx-auto mb-4 flex items-center justify-center rounded-full"
              style={{ width: 56, height: 56, background: '#dcfce7' }}>
              <span style={{ fontSize: 26, color: '#15803d' }}>✓</span>
            </div>
            <h1 className="text-lg font-bold mb-1.5" style={{ color: '#0f172a' }}>Cevaplarınız alındı</h1>
            <p className="text-sm leading-relaxed" style={{ color: '#64748b' }}>
              Teşekkürler. Bu sayfayı kapatabilirsiniz.
            </p>
          </div>
        ) : hata ? (
          <div className="rounded-2xl p-8 text-center"
            style={{ background: '#fff', border: '1px solid #e2e8f0' }}>
            <div className="mx-auto mb-4 flex items-center justify-center rounded-full"
              style={{ width: 56, height: 56, background: '#fee2e2' }}>
              <span style={{ fontSize: 24, color: '#dc2626' }}>!</span>
            </div>
            <p className="text-sm mb-5 font-medium" style={{ color: '#0f172a' }}>{hata}</p>
            {girisGerekli && (
              <Link href={`/login?next=${encodeURIComponent(`/form/${token}`)}`}
                className="inline-block rounded-xl text-sm font-bold"
                style={{ padding: '11px 24px', background: '#2288c9', color: '#fff', textDecoration: 'none' }}>
                Giriş yap
              </Link>
            )}
          </div>
        ) : !acik ? (
          <div className="rounded-2xl p-8 text-center"
            style={{ background: '#fff', border: '1px solid #e2e8f0' }}>
            <div className="mx-auto mb-4 flex items-center justify-center rounded-full"
              style={{ width: 56, height: 56, background: '#f1f5f9' }}>
              <span style={{ fontSize: 24, color: '#64748b' }}>⏳</span>
            </div>
            <p className="text-sm font-medium" style={{ color: '#334155' }}>
              {sebep ?? 'Bu form artık doldurulamıyor.'}
            </p>
          </div>
        ) : form ? (
          <>
            {/* Başlık kartı gövdeden ayrı: uzun formda kaydırınca sorular
                kendi kartlarında kalıyor, başlık karışmıyor. */}
            <div className="rounded-2xl px-6 py-5 mb-4"
              style={{ background: '#fff', border: '1px solid #e2e8f0', borderTop: '4px solid #2288c9' }}>
              <h1 className="text-[22px] font-bold leading-tight" style={{ color: '#0f172a', letterSpacing: '-0.02em' }}>
                {form.baslik}
              </h1>
              {form.aciklama && (
                <p className="text-sm mt-2 whitespace-pre-wrap leading-relaxed" style={{ color: '#475569' }}>
                  {form.aciklama}
                </p>
              )}
              <div className="flex items-center gap-3 mt-3 pt-3 text-xs" style={{ borderTop: '1px solid #f1f5f9', color: '#64748b' }}>
                <span>{form.alanlar.length} soru</span>
                {form.alanlar.some(a => a.zorunlu) && (
                  <span><span style={{ color: '#dc2626' }}>*</span> işaretli alanlar zorunlu</span>
                )}
              </div>
            </div>

            <FormDoldurucu alanlar={form.alanlar} onGonder={gonder} />
          </>
        ) : null}

        <p className="text-center text-xs mt-6" style={{ color: '#94a3b8' }}>
          Bu form DENEYAP OYS üzerinden gönderildi.
        </p>
      </div>
    </div>
  )
}
