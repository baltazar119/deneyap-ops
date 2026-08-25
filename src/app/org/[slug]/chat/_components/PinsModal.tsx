'use client'

import { X, Pin } from 'lucide-react'
import { ChatPin, Profile } from './types'
import { formatTime, avatarBg, getInitials, renderMentions } from './helpers'

interface Props {
  pins: ChatPin[]
  profileMap: Record<string, Profile | null>
  isAdmin: boolean
  onUnpin: (pinId: string) => void
  onClose: () => void
  onJumpTo: (messageId: string) => void
}

export default function PinsModal({ pins, profileMap, isAdmin, onUnpin, onClose, onJumpTo }: Props) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 520, maxHeight: '75vh', borderRadius: 20,
          background: '#0f1e2e', border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Pin size={18} color="#f59e0b" />
            <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Pinlenmiş Mesajlar</span>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>{pins.length}</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', padding: 4, borderRadius: 6, display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        {/* Liste */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '8px 0' }}>
          {pins.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>
              Henüz pinlenmiş mesaj yok.
            </div>
          )}
          {pins.map(pin => {
            const msg = pin.message
            if (!msg) return null
            const sender = profileMap[msg.sender_id ?? '']
            const bg = avatarBg(msg.sender_id ?? pin.id)
            return (
              <div
                key={pin.id}
                style={{
                  margin: '4px 12px', borderRadius: 12,
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                  padding: '12px 14px', cursor: 'pointer', transition: 'background 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                onClick={() => { onJumpTo(msg.id); onClose() }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                    {/* Avatar */}
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: bg, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff' }}>
                      {sender?.avatar_url
                        ? <img src={sender.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                        : getInitials(sender)
                      }
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#60a5fa', whiteSpace: 'nowrap' }}>
                      {sender?.full_name ?? sender?.username ?? 'Kullanıcı'}
                    </span>
                    <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.35)' }}>{formatTime(msg.created_at)}</span>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={e => { e.stopPropagation(); onUnpin(pin.id) }}
                      style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 7, padding: '3px 8px', cursor: 'pointer', color: '#f87171', fontSize: 11.5, fontWeight: 600, flexShrink: 0 }}
                    >
                      Kaldır
                    </button>
                  )}
                </div>
                <div style={{ marginTop: 8, fontSize: 13.5, color: 'rgba(255,255,255,0.75)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {renderMentions(msg.content, profileMap)}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
