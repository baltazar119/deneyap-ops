'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { X as XIcon } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl'
  /**
   * Kapatmayı kilitler: Escape, arka plana tıklama ve X düğmesi devre dışı.
   * Kullanıcının bir seçim yapması zorunlu olduğunda (örn. onaylanması
   * gereken kritik duyuru) kullanılır.
   */
  kapatilamaz?: boolean
}

const MAX_WIDTH: Record<NonNullable<Props['maxWidth']>, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-xl',
}

/**
 * Masaüstünde ortalanmış modal, mobilde (sm altı) alttan açılan tam
 * genişlikte sheet — aynı DOM, sadece CSS ile konum/köşe/yükseklik değişir.
 *
 * Escape ile kapanır, açıkken arka plan kaydırması kilitlenir ve odak modalın
 * içine alınır. Bunlar olmadan mobilde modal açıkken sayfa arkada kayıyor ve
 * klavye kullanıcısı modalın dışındaki bağlantılara sekebiliyordu.
 */
export default function ResponsiveModal({
  open, onClose, title, children, maxWidth = 'md', kapatilamaz = false,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Escape ile kapatma
  useEffect(() => {
    if (!open || kapatilamaz) return
    const el = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', el)
    return () => window.removeEventListener('keydown', el)
  }, [open, kapatilamaz, onClose])

  // Arka plan kaydırma kilidi — mobilde modal açıkken sayfa arkada kayıyordu
  useEffect(() => {
    if (!open) return
    const onceki = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = onceki }
  }, [open])

  // Odağı modalın içine al (klavye kullanıcısı arka plandaki bağlantılara
  // sekmesin). Basit yaklaşım: açılışta panele odaklan.
  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(13,26,42,0.45)', backdropFilter: 'blur(2px)' }}
        onClick={kapatilamaz ? undefined : onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`relative w-full ${MAX_WIDTH[maxWidth]} max-h-[90vh] sm:max-h-[85vh] overflow-y-auto
          rounded-t-2xl sm:rounded-2xl bg-white shadow-brand-lg outline-none`}
      >
        {title && (
          <div className="sticky top-0 flex items-center justify-between px-6 py-4 bg-white border-b border-slate-100">
            <h2 className="text-lg font-bold text-brand-700">{title}</h2>
            {!kapatilamaz && (
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                aria-label="Kapat"
              >
                <XIcon size={18} />
              </button>
            )}
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}
