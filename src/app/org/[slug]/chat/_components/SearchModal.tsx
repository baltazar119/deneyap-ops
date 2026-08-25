'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Search } from 'lucide-react'
import { SupabaseClient } from '@supabase/supabase-js'
import { ChatMessage, Profile } from './types'
import { formatTime, avatarBg, getInitials, renderMentions } from './helpers'

interface Props {
  channelId: string
  channelName: string
  profileMap: Record<string, Profile | null>
  supabase: SupabaseClient
  onClose: () => void
  onJumpTo: (messageId: string) => void
}

export default function SearchModal({ channelId, channelName, profileMap, supabase, onClose, onJumpTo }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!query.trim()) { setResults([]); return }
    timerRef.current = setTimeout(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('channel_id', channelId)
        .is('parent_message_id', null)
        .ilike('content', `%${query}%`)
        .order('created_at', { ascending: false })
        .limit(30)
      setResults((data as ChatMessage[]) ?? [])
      setLoading(false)
    }, 300)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, channelId])

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 80 }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 560, borderRadius: 20,
          background: '#0f1e2e', border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
          overflow: 'hidden', maxHeight: '65vh', display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <Search size={18} color="rgba(255,255,255,0.4)" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={`#${channelName} kanalında ara…`}
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: '#fff', fontSize: 15, fontFamily: 'inherit',
            }}
          />
          {query && (
            <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', display: 'flex' }}>
              <X size={16} />
            </button>
          )}
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 7, padding: '3px 8px', cursor: 'pointer', color: 'rgba(255,255,255,0.55)', fontSize: 11.5 }}>
            ESC
          </button>
        </div>

        {/* Results */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading && (
            <div style={{ padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Aranıyor…</div>
          )}
          {!loading && query && results.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>
              &ldquo;{query}&rdquo; için sonuç bulunamadı
            </div>
          )}
          {!loading && !query && (
            <div style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 13.5 }}>
              Mesajlarda aramak için yazmaya başlayın
            </div>
          )}
          {results.map(msg => {
            const sender = profileMap[msg.sender_id ?? '']
            const bg = avatarBg(msg.sender_id ?? msg.id)
            // Highlight matching text
            const highlighted = msg.content.replace(
              new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
              '<mark style="background:rgba(250,204,21,0.3);color:#fde68a;border-radius:3px;padding:0 1px">$1</mark>'
            )
            return (
              <div
                key={msg.id}
                onClick={() => { onJumpTo(msg.id); onClose() }}
                style={{
                  padding: '12px 16px', cursor: 'pointer',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: bg, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', overflow: 'hidden' }}>
                    {sender?.avatar_url
                      ? <img src={sender.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : getInitials(sender)
                    }
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#60a5fa' }}>
                    {sender?.full_name ?? sender?.username ?? 'Kullanıcı'}
                  </span>
                  <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.35)' }}>{formatTime(msg.created_at)}</span>
                </div>
                <div
                  style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                  dangerouslySetInnerHTML={{ __html: renderMentions(highlighted, profileMap) }}
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
