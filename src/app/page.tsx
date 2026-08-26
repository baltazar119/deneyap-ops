'use client'

export const dynamic = 'force-dynamic'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'

/**
 * Kök sayfa — DENEYAP Ops bir iç operasyon aracı olduğu için tanıtım/pazarlama
 * sayfası yok. Oturum varsa workspace seçimine, yoksa girişe yönlendirilir.
 */
export default function Home() {
  const router = useRouter()

  useEffect(() => {
    let iptal = false
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (iptal) return
      router.replace(session ? '/workspaces' : '/login')
    })
    return () => { iptal = true }
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#f5f7fa' }}>
      <div className="flex flex-col items-center gap-3">
        <div
          className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{ borderColor: '#bee5f0', borderTopColor: '#2288c9' }}
        />
        <span className="text-sm font-medium" style={{ color: '#2288c9' }}>
          Yönlendiriliyor…
        </span>
      </div>
    </div>
  )
}
