'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useParams } from 'next/navigation'

/**
 * E-postadaki aksiyon düğmesinin onay ekranı.
 *
 * Bu sayfa SALT OKUNURDUR. Hiçbir şeyi değiştirmez; yalnızca ne olacağını
 * anlatır ve kullanıcının basacağı düğmeyi gösterir. Değişikliği o düğme
 * POST ile yapar.
 *
 * Neden böyle: kurumsal e-posta tarayıcıları e-postadaki tüm linkleri
 * otomatik açar. Bu ekran doğrudan işlemi uygulasaydı, kimse tıklamadan
 * görevler kendiliğinden tamamlanmış olurdu.
 */

interface Sonuc {
  ok?: boolean
  mesaj?: string
  gorevBasligi?: string
  gorevUrl?: string | null
  error?: string
}

export default function EylemOnayPage() {
  const params = useParams()
  const token = params.token as string

  const [calisiyor, setCalisiyor] = useState(false)
  const [sonuc, setSonuc] = useState<Sonuc | null>(null)

  async function uygula() {
    setCalisiyor(true)
    try {
      const res = await fetch(`/api/eylem/${token}`, { method: 'POST' })
      setSonuc(await res.json())
    } catch {
      setSonuc({ error: 'Bağlantı kurulamadı. Lütfen tekrar deneyin.' })
    } finally {
      setCalisiyor(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#f0f4f8' }}>
      <div className="w-full" style={{ maxWidth: 460 }}>
        <div className="card">

          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(34,136,201,0.1)', border: '1px solid rgba(34,136,201,0.22)' }}>
              <span style={{ fontSize: 16 }}>⚡</span>
            </div>
            <span className="font-bold text-lg tracking-tight" style={{ color: '#0d1a2a' }}>DENEYAP OYS</span>
          </div>

          {!sonuc ? (
            <>
              <h1 className="text-lg font-bold mb-1" style={{ color: '#0d1a2a' }}>
                İşlemi onaylayın
              </h1>
              <p className="text-sm mb-5" style={{ color: '#64748b', lineHeight: 1.6 }}>
                E-postanızdaki düğmeye tıkladınız. Devam etmek için aşağıdaki
                düğmeye basın — işlem ancak o zaman uygulanır.
              </p>
              <button onClick={uygula} disabled={calisiyor} className="btn-primary w-full">
                {calisiyor ? 'Uygulanıyor…' : 'Onaylıyorum, uygula'}
              </button>
              <p className="text-xs mt-4 text-center" style={{ color: '#94a3b8' }}>
                Bu bağlantı tek kullanımlıktır.
              </p>
            </>
          ) : sonuc.ok ? (
            <>
              <div className="text-center py-3">
                <div className="text-4xl mb-2">✅</div>
                <h1 className="text-lg font-bold" style={{ color: '#0d1a2a' }}>{sonuc.mesaj}</h1>
                {sonuc.gorevBasligi && (
                  <p className="text-sm mt-1" style={{ color: '#64748b' }}>{sonuc.gorevBasligi}</p>
                )}
              </div>
              {sonuc.gorevUrl && (
                <a href={sonuc.gorevUrl} className="btn-secondary w-full mt-3" style={{ display: 'block', textAlign: 'center' }}>
                  Görevi uygulamada aç
                </a>
              )}
            </>
          ) : (
            <>
              <div className="text-center py-3">
                <div className="text-4xl mb-2">⚠️</div>
                <h1 className="text-base font-bold" style={{ color: '#0d1a2a' }}>İşlem yapılamadı</h1>
                <p className="text-sm mt-1" style={{ color: '#64748b' }}>{sonuc.error}</p>
              </div>
              <a href="/workspaces" className="btn-secondary w-full mt-3" style={{ display: 'block', textAlign: 'center' }}>
                Uygulamayı Aç
              </a>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
