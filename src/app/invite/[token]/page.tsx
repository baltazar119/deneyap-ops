'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'

interface InvitationInfo {
  organizationName: string
  role: string
  inviterName: string | null
}

export default function InvitePage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = params?.token as string

  const [info, setInfo] = useState<InvitationInfo | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'accepting' | 'error' | 'expired' | 'no-auth'>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    async function load() {
      // Davet bilgilerini API'den al
      const res = await fetch(`/api/org/invite?token=${token}`)
      if (!res.ok) {
        const data = await res.json()
        if (data.code === 'expired') setStatus('expired')
        else { setErrorMsg(data.error ?? 'Davet bulunamadı.'); setStatus('error') }
        return
      }
      const data = await res.json()
      setInfo(data)

      // Auth kontrolü
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setStatus('no-auth'); return }

      setStatus('ready')
    }
    load()
  }, [token])

  async function handleAccept() {
    setStatus('accepting')
    const res = await fetch('/api/org/invite/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    const data = await res.json()
    if (!res.ok) {
      setErrorMsg(data.error ?? 'Davet kabul edilemedi.')
      setStatus('error')
      return
    }
    router.replace(`/org/${data.slug}/dashboard`)
  }

  function handleLogin() {
    router.push(`/login?next=/invite/${token}`)
  }

  const roleLabel: Record<string, string> = {
    owner: 'Sahip',
    admin: 'Yönetici',
    member: 'Üye',
    consultant: 'Danışman',
  }

  return (
    <div className="min-h-screen bg-[#060e18] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {status === 'loading' && (
          <div className="flex justify-center">
            <div className="w-8 h-8 border-2 border-[#2288c9] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {status === 'expired' && (
          <div className="bg-[#0d1a2a] border border-red-400/20 rounded-2xl p-8 text-center">
            <div className="text-4xl mb-4">⏱️</div>
            <h2 className="text-white font-bold text-xl mb-2">Davet Süresi Doldu</h2>
            <p className="text-[#8baac4] text-sm">Bu davet linki artık geçerli değil. Yeni bir davet isteyin.</p>
          </div>
        )}

        {status === 'error' && (
          <div className="bg-[#0d1a2a] border border-red-400/20 rounded-2xl p-8 text-center">
            <div className="text-4xl mb-4">❌</div>
            <h2 className="text-white font-bold text-xl mb-2">Hata</h2>
            <p className="text-[#8baac4] text-sm">{errorMsg}</p>
          </div>
        )}

        {(status === 'ready' || status === 'no-auth' || status === 'accepting') && info && (
          <div className="bg-[#0d1a2a] border border-[#1a2f45] rounded-2xl p-8 text-center">
            <div className="text-4xl mb-4">✉️</div>
            <h2 className="text-white font-bold text-xl mb-2">Davet Aldınız!</h2>
            <p className="text-[#8baac4] text-sm mb-6">
              <strong className="text-white">{info.organizationName}</strong> workspace'ine{' '}
              <strong className="text-[#2288c9]">{roleLabel[info.role] ?? info.role}</strong> olarak davet edildiniz.
            </p>

            {status === 'no-auth' ? (
              <div className="space-y-3">
                <p className="text-[#8baacac] text-xs mb-3">Daveti kabul etmek için önce giriş yapın.</p>
                <button
                  onClick={handleLogin}
                  className="w-full bg-[#2288c9] hover:bg-[#1a6fa0] text-white font-semibold rounded-xl py-3 transition-colors"
                >
                  Giriş Yap & Kabul Et
                </button>
              </div>
            ) : (
              <button
                onClick={handleAccept}
                disabled={status === 'accepting'}
                className="w-full bg-[#2288c9] hover:bg-[#1a6fa0] disabled:opacity-50 text-white font-semibold rounded-xl py-3 transition-colors"
              >
                {status === 'accepting' ? 'Kabul ediliyor...' : 'Daveti Kabul Et'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
