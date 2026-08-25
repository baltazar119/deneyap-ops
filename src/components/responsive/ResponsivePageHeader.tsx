'use client'

import type { ReactNode } from 'react'

interface Props {
  title: string
  subtitle?: string
  breadcrumb?: ReactNode
  actions?: ReactNode
}

/**
 * Sayfa başlığı + breadcrumb + aksiyon satırı. Masaüstünde tek satırda,
 * mobilde (sm altı) alt alta dizilir; aksiyonlar mobilde tam genişlik alır.
 */
export default function ResponsivePageHeader({ title, subtitle, breadcrumb, actions }: Props) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
      <div className="min-w-0">
        {breadcrumb && <div className="mb-1 text-xs text-slate-400">{breadcrumb}</div>}
        <h1 className="text-xl sm:text-2xl font-bold text-brand-700 truncate">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          {actions}
        </div>
      )}
    </div>
  )
}
