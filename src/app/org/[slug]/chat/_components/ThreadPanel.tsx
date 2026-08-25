'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Trash2 } from 'lucide-react'
import { SupabaseClient } from '@supabase/supabase-js'
import { ChatMessage, ChatReaction, OrgMember, Profile } from './types'
import { formatTime, avatarBg, getInitials, renderMentions, parseMentionIds } from './helpers'
import MessageInput from './MessageInput'
import Avatar from './Avatar'

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🔥', '👀', '✅']

interface Props {
  parentMessage: ChatMessage
  userId: string
  orgId: string
  myProfile: Profile | null
  isAdmin: boolean
  members: OrgMember[]
  profileMap: Record<string, Profile | null>
  supabase: SupabaseClient
  orgSlug: string
  onClose: () => void
  onThreadCountChange: (messageId: string, delta: number) => void
}

export default function ThreadPanel({
  parentMessage, userId, orgId, myProfile, isAdmin,
  members, profileMap, supabase, orgSlug,
  onClose, onThreadCountChange,
}: Props) {
  const [replies, setReplies] = useState<ChatMessage[]>([])
  const [reactions, setReactions] = useState<Record<string, ChatReaction[]>>({})
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [emojiOpenId, setEmojiOpenId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadReplies()
    const sub = supabase
      .channel(`thread-${parentMessage.id}-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `parent_message_id=eq.${parentMessage.id}` }, payload => {
        const msg = payload.new as ChatMessage
        setReplies(prev => {
          if (prev.find(m => m.id === msg.id)) return prev
          return [...prev, msg]
        })
        onThreadCountChange(parentMessage.id, 1)
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages' }, payload => {
        const del = payload.old as { id: string }
        setReplies(prev => prev.filter(m => m.id !== del.id))
        onThreadCountChange(parentMessage.id, -1)
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_reactions' }, payload => {
        const r = payload.new as ChatReaction
        setReactions(prev => ({ ...prev, [r.message_id]: [...(prev[r.message_id] ?? []), r] }))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_reactions' }, payload => {
        const r = payload.old as ChatReaction
        setReactions(prev => ({ ...prev, [r.message_id]: (prev[r.message_id] ?? []).filter(x => x.id !== r.id) }))
      })
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentMessage.id])

  async function loadReplies() {
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('parent_message_id', parentMessage.id)
      .order('created_at', { ascending: true })
    setReplies((data as ChatMessage[]) ?? [])

    // Load reactions
    const ids = [(data as ChatMessage[]) ?? []].flat().map(m => m.id)
    if (ids.length > 0) {
      const { data: rxData } = await supabase.from('chat_reactions').select('*').in('message_id', ids)
      const map: Record<string, ChatReaction[]> = {}
      for (const r of (rxData as ChatReaction[]) ?? []) {
        if (!map[r.message_id]) map[r.message_id] = []
        map[r.message_id].push(r)
      }
      setReactions(map)
    }
    setTimeout(() => bottomRef.current?.scrollIntoView(), 50)
  }

  async function sendReply(content: string) {
    const myName = myProfile?.full_name ?? myProfile?.username ?? 'Kullanıcı'
    const { data: msg } = await supabase
      .from('chat_messages')
      .insert({ channel_id: parentMessage.channel_id, sender_id: userId, content, parent_message_id: parentMessage.id })
      .select()
      .single()

    if (!msg) return

    // Mention notifications
    const mentionIds = parseMentionIds(content)
    for (const uid of mentionIds) {
      if (uid === userId) continue
      await supabase.from('notifications').insert({
        user_id: uid,
        type: 'system',
        event_type: 'mention',
        title: `${myName} sizi thread'de etiketledi`,
        description: content.replace(/<@[^>]+>/g, m => {
          const uid2 = m.slice(2, -1)
          return '@' + (profileMap[uid2]?.full_name ?? 'kullanıcı')
        }),
        actor_id: userId,
        actor_name: myName,
        link: `/org/${orgSlug}/chat`,
        is_read: false,
        organization_id: orgId,
      })
    }
  }

  async function deleteReply(msgId: string) {
    await supabase.from('chat_messages').delete().eq('id', msgId)
  }

  async function toggleReaction(messageId: string, emoji: string) {
    const existing = (reactions[messageId] ?? []).find(r => r.user_id === userId && r.emoji === emoji)
    if (existing) {
      await supabase.from('chat_reactions').delete().eq('id', existing.id)
    } else {
      await supabase.from('chat_reactions').insert({ message_id: messageId, user_id: userId, emoji })
    }
    setEmojiOpenId(null)
  }

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

  const parentSender = profileMap[parentMessage.sender_id ?? '']
  const parentBg = avatarBg(parentMessage.sender_id ?? parentMessage.id)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0f1e2e', borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Thread</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', display: 'flex', padding: 4, borderRadius: 6 }}>
          <X size={18} />
        </button>
      </div>

      {/* Original message */}
      <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, background: 'rgba(255,255,255,0.025)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: parentBg, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', overflow: 'hidden' }}>
            {parentSender?.avatar_url
              ? <img src={parentSender.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : getInitials(parentSender)
            }
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: '#60a5fa' }}>{parentSender?.full_name ?? parentSender?.username ?? 'Kullanıcı'}</span>
              <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.35)' }}>{formatTime(parentMessage.created_at)}</span>
            </div>
            <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.8)', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {renderMentions(parentMessage.content, profileMap)}
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>
              {replies.length} yanıt
            </div>
          </div>
        </div>
      </div>

      {/* Replies */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {replies.map(msg => {
          const sender = profileMap[msg.sender_id ?? '']
          const bg = avatarBg(msg.sender_id ?? msg.id)
          const isOwn = msg.sender_id === userId
          const canDelete = isOwn || isAdmin
          const rxGroups = getReactionGroups(msg.id)
          const isHovered = hoveredId === msg.id

          return (
            <div
              key={msg.id}
              onMouseEnter={() => setHoveredId(msg.id)}
              onMouseLeave={() => { setHoveredId(null); setEmojiOpenId(null) }}
              style={{ padding: '6px 16px', position: 'relative' }}
            >
              {/* Hover actions */}
              {isHovered && (
                <div style={{
                  position: 'absolute', top: -2, right: 14,
                  display: 'flex', gap: 4, background: '#1a2b3c',
                  borderRadius: 10, padding: '3px 6px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.3)', zIndex: 5,
                }}>
                  <button
                    onClick={() => setEmojiOpenId(emojiOpenId === msg.id ? null : msg.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, padding: '2px 4px', borderRadius: 6 }}
                    title="Tepki ekle"
                  >😊</button>
                  {canDelete && (
                    <button
                      onClick={() => deleteReply(msg.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', padding: '2px 4px', borderRadius: 6, display: 'flex' }}
                      title="Sil"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              )}

              {/* Emoji picker */}
              {emojiOpenId === msg.id && (
                <div style={{
                  position: 'absolute', top: 28, right: 14, zIndex: 10,
                  background: '#1a2b3c', borderRadius: 12, padding: '8px 10px',
                  border: '1px solid rgba(255,255,255,0.12)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  display: 'flex', gap: 6,
                }}>
                  {QUICK_EMOJIS.map(e => (
                    <button key={e} onClick={() => toggleReaction(msg.id, e)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: '2px 3px', borderRadius: 7 }}>
                      {e}
                    </button>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: bg, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', overflow: 'hidden' }}>
                  {sender?.avatar_url
                    ? <img src={sender.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : getInitials(sender)
                  }
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: isOwn ? '#60a5fa' : '#a5b4fc' }}>{sender?.full_name ?? sender?.username ?? 'Kullanıcı'}</span>
                    <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.35)' }}>{formatTime(msg.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.82)', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {renderMentions(msg.content, profileMap)}
                  </div>

                  {/* Reactions */}
                  {rxGroups.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 5 }}>
                      {rxGroups.map(([emoji, data]) => (
                        <button
                          key={emoji}
                          onClick={() => toggleReaction(msg.id, emoji)}
                          title={data.users.join(', ')}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '3px 8px', borderRadius: 20, cursor: 'pointer',
                            background: data.mine ? 'rgba(37,99,235,0.25)' : 'rgba(255,255,255,0.07)',
                            border: data.mine ? '1px solid rgba(37,99,235,0.4)' : '1px solid rgba(255,255,255,0.1)',
                            fontSize: 14, color: '#fff', fontFamily: 'inherit',
                          }}
                        >
                          {emoji}
                          <span style={{ fontSize: 12, fontWeight: 600 }}>{data.count}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Reply input */}
      <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
        <MessageInput
          placeholder={`Thread'e yanıt ver…`}
          members={members}
          profileMap={profileMap}
          onSend={sendReply}
        />
      </div>
    </div>
  )
}
