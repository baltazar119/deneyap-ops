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
    <div className="min-h-screen flex flex-col items-center px-4 py-8" style={{ background: '#f5f7fa' }}>
      <div className="w-full max-w-2xl">
        <div className="mb-4 text-center">
          <div className="text-sm font-bold" style={{ color: '#0f2942', letterSpacing: '-0.01em' }}>
            DENEYAP OYS
          </div>
        </div>

        <div className="rounded-2xl p-6 md:p-8" style={{ background: '#fff', border: '1px solid #e5e7eb' }}>
          {yukleniyor ? (
            <div className="space-y-3">
              <div className="skeleton h-7 w-2/3 rounded-xl" />
              {[0, 1, 2].map(i => <div key={i} className="skeleton h-12 rounded-xl" />)}
            </div>
          ) : bitti ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">✓</div>
              <h1 className="text-lg font-bold mb-2" style={{ color: '#111827' }}>Teşekkürler</h1>
              <p className="text-sm" style={{ color: '#6b7280' }}>
                Cevaplarınız kaydedildi. Bu sayfayı kapatabilirsiniz.
              </p>
            </div>
          ) : hata ? (
            <div className="text-center py-8">
              <p className="text-sm mb-4" style={{ color: '#dc2626' }}>{hata}</p>
              {girisGerekli && (
                <Link href={`/login?next=${encodeURIComponent(`/form/${token}`)}`}
                  className="btn-primary inline-block" style={{ textDecoration: 'none' }}>
                  Giriş yap
                </Link>
              )}
            </div>
          ) : !acik ? (
            <div className="text-center py-8">
              <p className="text-sm" style={{ color: '#6b7280' }}>{sebep ?? 'Bu form artık doldurulamıyor.'}</p>
            </div>
          ) : form ? (
            <>
              <h1 className="text-xl font-bold mb-1" style={{ color: '#111827', letterSpacing: '-0.02em' }}>
                {form.baslik}
              </h1>
              {form.aciklama && (
                <p className="text-sm mb-6 whitespace-pre-wrap leading-relaxed" style={{ color: '#6b7280' }}>
                  {form.aciklama}
                </p>
              )}
              {!form.aciklama && <div className="mb-6" />}
              <FormDoldurucu alanlar={form.alanlar} onGonder={gonder} />
            </>
          ) : null}
        </div>

        <p className="text-center text-xs mt-4" style={{ color: '#9ca3af' }}>
          Bu form DENEYAP OYS üzerinden gönderildi.
        </p>
      </div>
    </div>
  )
}
