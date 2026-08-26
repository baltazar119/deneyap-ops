'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'

function toSlug(name: string) {
  return name
    // Türkçe karakterler toLowerCase()'ten ÖNCE çevrilir: "İ".toLowerCase()
    // JavaScript'te "i" + birleşik nokta (U+0307) üretir ve bu nokta sonraki
    // adımda tireye dönüşerek "İSTANBUL" → "i-stanbul" gibi bozuk sonuç verir.
    .replace(/[İIı]/g, 'i')
    .replace(/[Ğğ]/g, 'g')
    .replace(/[Üü]/g, 'u')
    .replace(/[Şş]/g, 's')
    .replace(/[Öö]/g, 'o')
    .replace(/[Çç]/g, 'c')
    .toLowerCase()
    // Geriye kalan birleşik aksan işaretlerini temizle
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

export default function CreateOrgPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function handleNameChange(v: string) {
    setName(v)
    if (!slugEdited) setSlug(toSlug(v))
  }

  function handleSlugChange(v: string) {
    setSlugEdited(true)
    setSlug(toSlug(v) || v.toLowerCase().replace(/[^a-z0-9-]/g, ''))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !slug.trim()) return

    setLoading(true)
    setError('')

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.replace('/login'); return }

    // Org oluşturma — service role ile (RLS bypass için API üzerinden)
    const res = await fetch('/api/org/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ name: name.trim(), slug: slug.trim() }),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Workspace oluşturulamadı')
      setLoading(false)
      return
    }

    router.replace(`/org/${data.slug}/dashboard`)
  }

  return (
    <div className="min-h-screen bg-[#060e18] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">Workspace Oluştur</h1>
          <p className="text-[#8baac4] text-sm mt-1">İliniz veya biriminiz için yeni bir çalışma alanı oluşturun</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-[#0d1a2a] border border-[#1a2f45] rounded-2xl p-6 space-y-5">
          {/* Org adı */}
          <div>
            <label className="block text-sm font-medium text-[#c4d8ea] mb-1.5">
              Workspace Adı
            </label>
            <input
              type="text"
              value={name}
              onChange={e => handleNameChange(e.target.value)}
              placeholder="Örn. DENEYAP Ankara"
              maxLength={60}
              required
              className="w-full bg-[#0a1420] border border-[#1a2f45] focus:border-[#2288c9] rounded-xl px-4 py-3 text-white placeholder-[#8baac4] text-sm outline-none transition-colors"
            />
          </div>

          {/* Slug */}
          <div>
            <label className="block text-sm font-medium text-[#c4d8ea] mb-1.5">
              Workspace URL&apos;i
            </label>
            <div className="flex items-center bg-[#0a1420] border border-[#1a2f45] focus-within:border-[#2288c9] rounded-xl px-4 py-3 gap-1 transition-colors">
              <span className="text-[#8baac4] text-sm select-none">/org/</span>
              <input
                type="text"
                value={slug}
                onChange={e => handleSlugChange(e.target.value)}
                placeholder="workspace-adiniz"
                maxLength={50}
                required
                className="flex-1 bg-transparent text-white text-sm outline-none placeholder-[#8baac4]"
              />
            </div>
            <p className="text-xs text-[#8baac4] mt-1.5">Sadece küçük harf, rakam ve tire kullanın</p>
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !name.trim() || !slug.trim()}
            className="w-full bg-[#2288c9] hover:bg-[#1a6fa0] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3 transition-colors"
          >
            {loading ? 'Oluşturuluyor...' : 'Workspace Oluştur'}
          </button>
        </form>

        <div className="text-center mt-4">
          <button onClick={() => router.push('/workspaces')} className="text-[#8baac4] hover:text-white text-sm transition-colors">
            ← Geri dön
          </button>
        </div>
      </div>
    </div>
  )
}
