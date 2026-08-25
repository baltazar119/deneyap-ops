'use client'

import { useEffect, useState } from 'react'

/**
 * Sadece DOM yapısının gerçekten değiştiği durumlar için (örn. tablo↔kart,
 * sürükle-bırak↔durum seçici) kullanılır. Salt görsel/spacing/grid
 * farkları için Tailwind breakpoint sınıfları tercih edilir.
 */
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpoint)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [breakpoint])

  return isMobile
}
