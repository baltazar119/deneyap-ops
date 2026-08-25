'use client'

import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Masaüstünde en fazla kaç kolon gösterilsin (varsayılan 4). */
  maxCols?: 3 | 4 | 5 | 6
}

const DESKTOP_COLS: Record<number, string> = {
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
  6: 'lg:grid-cols-6',
}

/**
 * KPI/stat kart satırı. Masaüstünde çok kolonlu, tablette 2 kolon,
 * mobilde tek kolon — kartlar hiçbir genişlikte kırpılmaz.
 */
export default function ResponsiveKPIGrid({ children, maxCols = 4 }: Props) {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 ${DESKTOP_COLS[maxCols]} gap-4`}>
      {children}
    </div>
  )
}
