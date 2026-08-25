'use client'

import type { ReactNode } from 'react'
import { X as XIcon } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl'
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
 */
export default function ResponsiveModal({ open, onClose, title, children, maxWidth = 'md' }: Props) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(13,26,42,0.45)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />
      <div
        className={`relative w-full ${MAX_WIDTH[maxWidth]} max-h-[90vh] sm:max-h-[85vh] overflow-y-auto
          rounded-t-2xl sm:rounded-2xl bg-white shadow-brand-lg`}
      >
        {title && (
          <div className="sticky top-0 flex items-center justify-between px-6 py-4 bg-white border-b border-slate-100">
            <h2 className="text-lg font-bold text-brand-700">{title}</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              aria-label="Kapat"
            >
              <XIcon size={18} />
            </button>
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}
