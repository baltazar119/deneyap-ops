'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Profile } from './types'
import Avatar from './Avatar'
import { statusColor, statusLabel } from './helpers'

interface Props {
  userId: string
  profile: Profile | null
  onClose: () => void
  onUpdate: (status: string, emoji: string, text: string) => void
}

const STATUSES = [
  { key: 'online', label: 'Çevrimiçi', color: '#22c55e' },
  { key: 'away',   label: 'Uzakta',    color: '#f59e0b' },
  { key: 'dnd',    label: 'Rahatsız Etme', color: '#ef4444' },
  { key: 'offline',label: 'Görünmez',  color: '#94a3b8' },
]

const QUICK_EMOJIS = ['💬', '🎯', '🔧', '📚', '🏖️', '🤒', '🚗', '🎮']

export default function StatusPicker({ userId, profile, onClose, onUpdate }: Props) {
  const [status, setStatus] = useState(profile?.chat_status ?? 'online')
  const [emoji, setEmoji] = useState(profile?.status_emoji ?? '')
  const [text, setText] = useState(profile?.status_text ?? '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    await supabase.from('profiles').update({
      chat_status: status,
      status_emoji: emoji || null,
      status_text: text || null,
      status_updated_at: new Date().toISOString(),
    }).eq('id', userId)
    onUpdate(status, emoji, text)
    setSaving(false)
    onClose()
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 999,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-start',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          margin: '0 0 70px 12px', width: 280, borderRadius: 16,
          background: '#1a2b3c', border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar profile={profile} id={userId} size={36} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
                {profile?.full_name ?? profile?.username ?? 'Sen'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor(status) }} />
                <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.5)' }}>{statusLabel(status)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Status seçenekleri */}
        <div style={{ padding: '8px 8px 4px' }}>
          {STATUSES.map(s => (
            <button
              key={s.key}
              onClick={() => setStatus(s.key)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 10px', borderRadius: 9, border: 'none', cursor: 'pointer',
                background: status === s.key ? 'rgba(37,99,235,0.25)' : 'transparent',
                transition: 'background 0.1s', textAlign: 'left',
              }}
              onMouseEnter={e => { if (status !== s.key) e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
              onMouseLeave={e => { if (status !== s.key) e.currentTarget.style.background = 'transparent' }}
            >
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
              <span style={{ fontSize: 13.5, color: status === s.key ? '#fff' : 'rgba(255,255,255,0.75)', fontWeight: status === s.key ? 600 : 400 }}>
                {s.label}
              </span>
              {status === s.key && <span style={{ marginLeft: 'auto', color: '#60a5fa', fontSize: 12 }}>✓</span>}
            </button>
          ))}
        </div>

        {/* Durum mesajı */}
        <div style={{ padding: '8px 12px 12px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.35)', marginBottom: 8, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Durum mesajı
          </div>
          {/* Hızlı emoji */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {QUICK_EMOJIS.map(e => (
              <button
                key={e}
                onClick={() => setEmoji(emoji === e ? '' : e)}
                style={{
                  width: 30, height: 30, borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 16,
                  background: emoji === e ? 'rgba(37,99,235,0.35)' : 'rgba(255,255,255,0.07)',
                  transition: 'background 0.1s',
                }}
              >
                {e}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {emoji && <span style={{ fontSize: 20 }}>{emoji}</span>}
            <input
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Ne yapıyorsunuz?"
              maxLength={100}
              style={{
                flex: 1, padding: '8px 10px', borderRadius: 9,
                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                color: '#fff', fontSize: 13, outline: 'none', fontFamily: 'inherit',
              }}
            />
          </div>

          <button
            onClick={save}
            disabled={saving}
            style={{
              width: '100%', marginTop: 10, padding: '9px 0', borderRadius: 10,
              background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', border: 'none',
              color: '#fff', fontSize: 13.5, fontWeight: 600, cursor: saving ? 'default' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  )
}
