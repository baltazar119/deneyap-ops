'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  deneyaplariAra, deneyaplariIleGoreGrupla, secicideGosterilecekler, deneyapKisaEtiket,
} from '@/lib/deneyap'
import type { Deneyap } from '@/types/database'

/** Tek seferde çizilen en fazla satır — 500 DENEYAP'lı bir org'da liste kilitlenmesin. */
const RENDER_TAVANI = 60

interface Props {
  deneyaplar: Deneyap[]
  /** null = DENEYAP seçilmedi (yalnızca il). */
  deger: string | null
  onChange: (deneyapId: string | null) => void
  /** Kullanıcının ili — o ilin DENEYAP'ları listenin başına alınır. */
  oncelikliIl?: string | null
  /** Satır içi "+ Yeni DENEYAP" bağlantısı (yalnızca owner/admin). */
  onYeniIste?: () => void
  disabled?: boolean
  ariaLabel?: string
}

/**
 * DENEYAP seçici — arama kutulu, il gruplu combobox.
 *
 * Neden düz `<select>` değil: bir org'da yüzlerce DENEYAP olabilir ve
 * kullanıcı çoğu zaman ilçe adını hatırlıyor, listedeki sırasını değil.
 *
 * Üç ayrıntı bilinçli:
 *   1. **"DENEYAP yok — yalnızca il seç" kaçış kapısı.** DENEYAP tanımlanmamış
 *      bir org görev oluşturamaz hale gelmemeli; `deneyap_id = null` tamamen
 *      geçerli bir durum.
 *   2. **Pasifler gizli ama SEÇİLİ olan görünür.** Kapatılmış bir DENEYAP'a
 *      bağlı eski görevi düzenlerken seçim listeden düşerse, kaydetmek
 *      görevin birimini sessizce silerdi.
 *   3. **Render tavanı.** Aşılırsa "aramayı daraltın" satırı gösterilir;
 *      liste sessizce kırpılmış gibi görünmez.
 */
export default function DeneyapSecici({
  deneyaplar, deger, onChange, oncelikliIl, onYeniIste, disabled, ariaLabel = 'DENEYAP seç',
}: Props) {
  const [acik, setAcik] = useState(false)
  const [sorgu, setSorgu] = useState('')
  const kapsayiciRef = useRef<HTMLDivElement>(null)

  const secili = deneyaplar.find(d => d.id === deger) ?? null

  // Dışarı tıklayınca kapan
  useEffect(() => {
    if (!acik) return
    const dinle = (e: MouseEvent) => {
      if (!kapsayiciRef.current?.contains(e.target as Node)) setAcik(false)
    }
    document.addEventListener('mousedown', dinle)
    return () => document.removeEventListener('mousedown', dinle)
  }, [acik])

  // Escape ile kapan — modal içinde kullanıldığında modalın Escape'ini
  // yutması gerekiyor, yoksa tek tuşla iki katman birden kapanıyor.
  useEffect(() => {
    if (!acik) return
    const dinle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setAcik(false) }
    }
    document.addEventListener('keydown', dinle, true)
    return () => document.removeEventListener('keydown', dinle, true)
  }, [acik])

  const gruplar = useMemo(() => {
    const gorunur = secicideGosterilecekler(deneyaplar, deger)
    const eslesenler = deneyaplariAra(gorunur, sorgu)
    return deneyaplariIleGoreGrupla(eslesenler, oncelikliIl)
  }, [deneyaplar, deger, sorgu, oncelikliIl])

  const toplam = gruplar.reduce((n, g) => n + g.deneyaplar.length, 0)
  const tavanAsildi = toplam > RENDER_TAVANI

  let kalan = RENDER_TAVANI

  return (
    <div className="relative" ref={kapsayiciRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => { setAcik(a => !a); setSorgu('') }}
        aria-label={ariaLabel}
        aria-expanded={acik}
        aria-haspopup="listbox"
        className="input flex items-center justify-between text-left"
        style={{ opacity: disabled ? 0.6 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
      >
        <span className="truncate" style={{ color: secili ? '#111827' : '#9ca3af' }}>
          {secili ? `${secili.il} — ${deneyapKisaEtiket(secili)}${secili.aktif ? '' : ' (kapalı)'}` : 'DENEYAP seçilmedi'}
        </span>
        <span aria-hidden="true" style={{ color: '#9ca3af', marginLeft: 8 }}>▾</span>
      </button>

      {acik && (
        <div
          role="listbox"
          className="absolute z-30 mt-1 w-full rounded-xl overflow-hidden"
          style={{ background: '#fff', border: '1px solid #e5e7eb', boxShadow: '0 12px 32px rgba(13,26,42,0.16)' }}
        >
          <div className="p-2" style={{ borderBottom: '1px solid #f3f4f6' }}>
            <input
              autoFocus
              type="text"
              value={sorgu}
              onChange={e => setSorgu(e.target.value)}
              placeholder="DENEYAP, il veya ilçe ara..."
              aria-label="DENEYAP ara"
              className="w-full text-sm rounded-lg px-2.5 py-1.5"
              style={{ background: '#f8fafc', border: '1px solid #e5e7eb', outline: 'none', color: '#111827' }}
            />
          </div>

          <div className="max-h-64 overflow-y-auto">
            {/* Kaçış kapısı — her zaman en üstte ve her zaman görünür */}
            <button
              type="button"
              role="option"
              aria-selected={deger === null}
              onClick={() => { onChange(null); setAcik(false) }}
              className="w-full text-left px-3 py-2 text-sm"
              style={{ background: deger === null ? '#f1f5f9' : '#fff', color: '#475569' }}
            >
              DENEYAP yok — yalnızca il seç
            </button>

            {gruplar.length === 0 && (
              <div className="px-3 py-4 text-sm text-center" style={{ color: '#9ca3af' }}>
                {deneyaplar.length === 0
                  ? 'Bu çalışma alanında henüz DENEYAP tanımlı değil.'
                  : 'Eşleşen DENEYAP yok.'}
              </div>
            )}

            {gruplar.map(grup => {
              if (kalan <= 0) return null
              const gosterilecek = grup.deneyaplar.slice(0, kalan)
              kalan -= gosterilecek.length
              return (
                <div key={grup.il}>
                  <div
                    className="px-3 py-1 text-[11px] font-bold uppercase sticky top-0"
                    style={{ background: '#f8fafc', color: '#64748b', letterSpacing: '0.04em' }}
                  >
                    {grup.il}
                  </div>
                  {gosterilecek.map(d => (
                    <button
                      key={d.id}
                      type="button"
                      role="option"
                      aria-selected={d.id === deger}
                      onClick={() => { onChange(d.id); setAcik(false) }}
                      className="w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2"
                      style={{ background: d.id === deger ? '#e0f2fe' : '#fff', color: '#111827' }}
                    >
                      <span className="truncate">{deneyapKisaEtiket(d)}</span>
                      {!d.aktif && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                          style={{ background: '#f1f5f9', color: '#94a3b8' }}>kapalı</span>
                      )}
                    </button>
                  ))}
                </div>
              )
            })}

            {tavanAsildi && (
              <div className="px-3 py-2 text-xs text-center" style={{ color: '#b45309', background: '#fffbeb' }}>
                {toplam} sonuçtan ilk {RENDER_TAVANI} tanesi gösteriliyor — aramayı daraltın.
              </div>
            )}
          </div>

          {onYeniIste && (
            <button
              type="button"
              onClick={() => { setAcik(false); onYeniIste() }}
              className="w-full text-left px-3 py-2 text-sm font-semibold"
              style={{ borderTop: '1px solid #f3f4f6', color: '#2288c9', background: '#fff' }}
            >
              + Yeni DENEYAP ekle
            </button>
          )}
        </div>
      )}
    </div>
  )
}
