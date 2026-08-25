'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { Trash2, MessageSquare, Pin, CheckSquare, Smile } from 'lucide-react'
import { ChatMessage, ChatReaction, ChatPin, OrgMember, Profile } from './types'
import { formatTime, avatarBg, getInitials, renderMentions } from './helpers'

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🔥', '👀', '✅', '❌']
const GROUP_WINDOW_MS = 5 * 60 * 1000

interface Props {
  messages: ChatMessage[]
  reactions: Record<string, ChatReaction[]>
  pins: ChatPin[]
  userId: string
  isAdmin: boolean
  members: OrgMember[]
  profileMap: Record<string, Profile | null>
  jumpToId: string | null
  onThread: (msg: ChatMessage) => void
  onDelete: (msgId: string) => void
  onReact: (messageId: string, emoji: string) => void
  onPin: (msg: ChatMessage) => void
  onUnpin: (pinId: string) => void
  onCreateTask: (msg: ChatMessage) => void
}

export default function MessageArea({
  messages, reactions, pins, userId, isAdmin, profileMap,
  jumpToId, onThread, onDelete, onReact, onPin, onUnpin, onCreateTask,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const msgRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [emojiOpenId, setEmojiOpenId] = useState<string | null>(null)
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMsgEnter = useCallback((id: string) => {
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current)
    setHoveredId(id)
  }, [])

  const handleMsgLeave = useCallback(() => {
    leaveTimerRef.current = setTimeout(() => {
      setHoveredId(null)
      setEmojiOpenId(null)
    }, 280)
  }, [])

  useEffect(() => {
    if (!jumpToId) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, jumpToId])

  useEffect(() => {
    if (!jumpToId) return
    const el = msgRefs.current[jumpToId]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.style.outline = '2px solid #fbbf24'
      setTimeout(() => { if (el) el.style.outline = 'none' }, 1800)
    }
  }, [jumpToId])

  function getReactionGroups(messageId: string) {
    const rxs = reactions[messageId] ?? []
    const map: Record<string, { count: number; mine: boolean; users: string[] }> = {}
    for (const r of rxs) {
      if (!map[r.emoji]) map[r.emoji] = { count: 0, mine: false, users: [] }
      map[r.emoji].count++
      if (r.user_id === userId) map[r.emoji].mine = true
      map[r.emoji].users.push(profileMap[r.user_id]?.full_name ?? 'Kullanıcı')
    }
    return Object.entries(map)
  }

  function isPinned(msgId: string) {
    return pins.some(p => p.message_id === msgId)
  }

  const groups: Array<{ msgs: ChatMessage[]; senderId: string | null }> = []
  for (const msg of messages) {
    if (msg.parent_message_id) continue
    const last = groups[groups.length - 1]
    const prevMsg = last?.msgs[last.msgs.length - 1]
    const sameUser = last && last.senderId === msg.sender_id
    const withinWindow = prevMsg && (new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime()) < GROUP_WINDOW_MS
    if (sameUser && withinWindow) last.msgs.push(msg)
    else groups.push({ msgs: [msg], senderId: msg.sender_id })
  }

  return (
    <div
      style={{ flex: 1, overflowY: 'auto', background: '#f3f6fb', padding: '20px 0 8px' }}
      onClick={() => setEmojiOpenId(null)}
    >
      {messages.filter(m => !m.parent_message_id).length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: '#94a3b8' }}>
          <MessageSquare size={44} strokeWidth={1.2} />
          <div style={{ fontSize: 15, fontWeight: 600 }}>Henüz mesaj yok</div>
          <div style={{ fontSize: 13 }}>İlk mesajı sen gönder!</div>
        </div>
      )}

      {groups.map((group, gi) => {
        const sender = profileMap[group.senderId ?? '']
        const bg = avatarBg(group.senderId ?? 'x')
        const isOwn = group.senderId === userId
        const isLast = gi === groups.length - 1

        return (
          <div
            key={group.msgs[0].id}
            style={{
              display: 'flex',
              flexDirection: isOwn ? 'row-reverse' : 'row',
              alignItems: 'flex-start',
              gap: 10,
              padding: '2px 20px',
              marginBottom: isLast ? 8 : 14,
            }}
          >
            {/* Avatar — diğer kullanıcılar için */}
            {!isOwn && (
              <div style={{
                width: 38, height: 38, borderRadius: '50%', background: bg, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 700, color: '#fff', overflow: 'hidden',
                marginTop: 2, boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
              }}>
                {sender?.avatar_url
                  ? <img src={sender.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : getInitials(sender)
                }
              </div>
            )}

            {/* Bubble column */}
            <div style={{
              display: 'flex', flexDirection: 'column',
              maxWidth: '62%',
              alignItems: isOwn ? 'flex-end' : 'flex-start',
              gap: 3,
            }}>
              {/* Gönderen adı + zaman (diğerleri) */}
              {!isOwn && (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, paddingLeft: 2, marginBottom: 2 }}>
                  <span style={{
                    fontSize: 13, fontWeight: 700,
                    color: bg, // avatar rengiyle eşleşsin
                  }}>
                    {sender?.full_name ?? sender?.username ?? 'Kullanıcı'}
                  </span>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>
                    {formatTime(group.msgs[0].created_at)}
                  </span>
                </div>
              )}

              {group.msgs.map((msg, idx) => {
                const isLastMsg = idx === group.msgs.length - 1
                const isFirstMsg = idx === 0
                const rxGroups = getReactionGroups(msg.id)
                const isHovered = hoveredId === msg.id
                const canDelete = msg.sender_id === userId || isAdmin
                const pinned = isPinned(msg.id)

                // Köşe yuvarlama: grup içinde mesajlar birbirine yakın görünsün
                const r = 20
                const rSmall = 6
                const brOwn = `${isFirstMsg ? r : rSmall}px ${isFirstMsg ? r : rSmall}px ${isLastMsg ? r : rSmall}px ${isLastMsg ? r : rSmall}px`
                const brOther = `${isFirstMsg ? r : rSmall}px ${isFirstMsg ? r : rSmall}px ${isLastMsg ? r : rSmall}px ${isLastMsg ? r : rSmall}px`

                return (
                  <div
                    key={msg.id}
                    ref={el => { msgRefs.current[msg.id] = el }}
                    onMouseEnter={() => handleMsgEnter(msg.id)}
                    onMouseLeave={handleMsgLeave}
                    style={{ position: 'relative', maxWidth: '100%' }}
                  >
                    {/* Hover action bar — mesajın yanında, içeriği itmez */}
                    {isHovered && (
                      <div
                        onClick={e => e.stopPropagation()}
                        style={{
                          position: 'absolute',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          [isOwn ? 'right' : 'left']: 'calc(100% + 8px)',
                          zIndex: 30,
                          display: 'flex', alignItems: 'center', gap: 1,
                          background: '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderRadius: 12, padding: '4px 6px',
                          boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {/* Emoji */}
                        <div style={{ position: 'relative' }}>
                          <button
                            onClick={e => { e.stopPropagation(); setEmojiOpenId(emojiOpenId === msg.id ? null : msg.id) }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px 5px', borderRadius: 7, color: '#64748b', display: 'flex', alignItems: 'center' }}
                            title="Tepki"
                          >
                            <Smile size={15} />
                          </button>
                          {emojiOpenId === msg.id && (
                            <div
                              onClick={e => e.stopPropagation()}
                              style={{
                                position: 'absolute',
                                bottom: 'calc(100% + 6px)',
                                [isOwn ? 'right' : 'left']: 0,
                                zIndex: 50,
                                background: '#fff', borderRadius: 14, padding: '8px 12px',
                                border: '1px solid #e2e8f0',
                                boxShadow: '0 8px 28px rgba(0,0,0,0.13)',
                                display: 'flex', gap: 4,
                              }}
                            >
                              {QUICK_EMOJIS.map(e => (
                                <button
                                  key={e}
                                  onClick={() => { onReact(msg.id, e); setEmojiOpenId(null) }}
                                  style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    fontSize: 22, padding: '2px 4px', borderRadius: 8,
                                    transition: 'transform 0.1s',
                                  }}
                                  onMouseEnter={el => { (el.currentTarget as HTMLElement).style.transform = 'scale(1.25)' }}
                                  onMouseLeave={el => { (el.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
                                >
                                  {e}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <div style={{ width: 1, height: 16, background: '#e2e8f0', margin: '0 2px' }} />

                        <button onClick={() => onThread(msg)} style={actionBtn} title="Yanıtla">
                          <MessageSquare size={14} />
                        </button>

                        {isAdmin && (
                          <button
                            onClick={() => pinned ? onUnpin(pins.find(p => p.message_id === msg.id)!.id) : onPin(msg)}
                            style={{ ...actionBtn, color: pinned ? '#d97706' : '#64748b' }}
                            title={pinned ? 'Pini kaldır' : 'Pinle'}
                          >
                            <Pin size={14} />
                          </button>
                        )}

                        <button onClick={() => onCreateTask(msg)} style={actionBtn} title="Görev oluştur">
                          <CheckSquare size={14} />
                        </button>

                        {canDelete && (
                          <>
                            <div style={{ width: 1, height: 16, background: '#e2e8f0', margin: '0 2px' }} />
                            <button
                              onClick={() => onDelete(msg.id)}
                              style={{ ...actionBtn, color: '#ef4444' }}
                              title="Sil"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {/* Mesaj balonu */}
                    <div style={{
                      padding: '10px 14px',
                      background: isOwn
                        ? 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)'
                        : '#ffffff',
                      borderRadius: isOwn ? brOwn : brOther,
                      boxShadow: isOwn
                        ? '0 2px 8px rgba(37,99,235,0.22)'
                        : '0 1px 4px rgba(0,0,0,0.07)',
                      border: isOwn ? 'none' : '1px solid #e8edf3',
                      position: 'relative',
                      wordBreak: 'break-word',
                    }}>
                      {pinned && (
                        <Pin size={10} color="#f59e0b" style={{ position: 'absolute', top: 7, right: 10 }} />
                      )}
                      <div style={{
                        fontSize: 14, lineHeight: 1.6,
                        color: isOwn ? '#ffffff' : '#1e293b',
                        whiteSpace: 'pre-wrap',
                      }}>
                        {renderMentions(msg.content, profileMap)}
                      </div>

                      {/* Zaman — kendi mesajlarında balonun altı */}
                      {isOwn && isLastMsg && (
                        <div style={{
                          fontSize: 10.5, color: 'rgba(255,255,255,0.65)',
                          textAlign: 'right', marginTop: 4,
                        }}>
                          {formatTime(msg.created_at)}
                        </div>
                      )}
                    </div>

                    {/* Thread sayacı */}
                    {msg.thread_count > 0 && (
                      <button
                        onClick={() => onThread(msg)}
                        style={{
                          marginTop: 5, display: 'flex', alignItems: 'center', gap: 5,
                          background: 'rgba(79,70,229,0.08)', border: '1px solid rgba(79,70,229,0.2)',
                          cursor: 'pointer', color: '#4f46e5', fontSize: 12, fontWeight: 600,
                          padding: '3px 10px', borderRadius: 20, fontFamily: 'inherit',
                        }}
                      >
                        <MessageSquare size={12} />
                        {msg.thread_count} yanıt
                      </button>
                    )}

                    {/* Reaksiyonlar */}
                    {rxGroups.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                        {rxGroups.map(([emoji, data]) => (
                          <button
                            key={emoji}
                            onClick={() => onReact(msg.id, emoji)}
                            title={data.users.join(', ')}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 4,
                              padding: '3px 9px', borderRadius: 20, cursor: 'pointer',
                              background: data.mine ? 'rgba(37,99,235,0.1)' : '#ffffff',
                              border: data.mine ? '1.5px solid rgba(37,99,235,0.35)' : '1px solid #e2e8f0',
                              fontSize: 14, color: '#1e293b', fontFamily: 'inherit',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                              transition: 'all 0.15s',
                            }}
                          >
                            {emoji}
                            <span style={{ fontSize: 12, fontWeight: 700, color: data.mine ? '#2563eb' : '#475569' }}>
                              {data.count}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Kendi mesajlarında zaman etiketi — son mesaj + sağ alt */}
              {isOwn && (
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1, paddingRight: 4 }}>
                  {formatTime(group.msgs[group.msgs.length - 1].created_at)}
                </div>
              )}
            </div>

            {/* Kendi mesajları için sağ boşluk (avatar hizası) */}
            {isOwn && <div style={{ width: 38, flexShrink: 0 }} />}
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}

// Küçük action button stili
const actionBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: '#64748b', padding: '3px 5px', borderRadius: 7,
  display: 'flex', alignItems: 'center',
}
