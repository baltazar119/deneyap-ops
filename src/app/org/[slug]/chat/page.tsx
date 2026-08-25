'use client'

import { useEffect, useState, useRef } from 'react'
import { Hash, Search, Pin, Loader2 } from 'lucide-react'
import { useOrg } from '@/lib/supabase/orgContext'
import { supabase } from '@/lib/supabase/client'
import { useIsMobile } from '@/lib/useIsMobile'
import {
  ChatChannel, ChatMessage, ChatReaction, ChatPin,
  OrgMember, Profile, DmChannel,
} from './_components/types'
import { parseMentionIds } from './_components/helpers'
import ChannelSidebar from './_components/ChannelSidebar'
import MessageArea from './_components/MessageArea'
import MessageInput from './_components/MessageInput'
import ThreadPanel from './_components/ThreadPanel'
import PinsModal from './_components/PinsModal'
import SearchModal from './_components/SearchModal'
import CreateTaskModal from './_components/CreateTaskModal'

export default function ChatPage() {
  const { userId, org } = useOrg()

  // ── Core data ────────────────────────────────────────────────────────────────
  const [myProfile, setMyProfile] = useState<Profile | null>(null)
  const [myRole, setMyRole] = useState<string>('member')
  const [members, setMembers] = useState<OrgMember[]>([])
  const [profileMap, setProfileMap] = useState<Record<string, Profile | null>>({})

  // ── Channels ─────────────────────────────────────────────────────────────────
  const [channels, setChannels] = useState<ChatChannel[]>([])
  const [dmChannels, setDmChannels] = useState<DmChannel[]>([])
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // ── Messages ──────────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [reactions, setReactions] = useState<Record<string, ChatReaction[]>>({})
  const [pins, setPins] = useState<ChatPin[]>([])

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [threadMsg, setThreadMsg] = useState<ChatMessage | null>(null)
  const [showPins, setShowPins] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [taskMsg, setTaskMsg] = useState<ChatMessage | null>(null)
  const [jumpToId, setJumpToId] = useState<string | null>(null)
  const isMobile = useIsMobile()
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(true)

  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const isAdmin = myRole === 'owner' || myRole === 'admin'

  // ── Keyboard shortcut (Ctrl+K) ───────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setShowSearch(s => !s)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ── Initial load ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId || !org?.id) return
    loadAll()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, org?.id])

  async function loadAll() {
    setLoading(true)

    // 1) Üyeleri çek (role bilgisiyle)
    const { data: mems } = await supabase
      .from('organization_members')
      .select('user_id, role')
      .eq('organization_id', org!.id)

    const rawMems = mems ?? []

    // 2) Profilleri ayrı sorgula — join yerine .in() ile
    const userIds = rawMems.map(m => m.user_id)
    let profilesData: Profile[] = []
    if (userIds.length > 0) {
      const { data: pd } = await supabase
        .from('profiles')
        .select('*')
        .in('id', userIds)
      profilesData = (pd ?? []) as Profile[]
    }

    // profileMap oluştur
    const pmap: Record<string, Profile | null> = {}
    for (const p of profilesData) pmap[p.id] = p

    // Kendi rolünü ve profilini set et
    const myMem = rawMems.find(m => m.user_id === userId!)
    if (myMem) setMyRole(myMem.role)
    setMyProfile(pmap[userId!] ?? null)

    // Üye listesi
    const memList: OrgMember[] = rawMems.map(m => ({
      user_id: m.user_id,
      role: m.role,
      profile: pmap[m.user_id] ?? null,
    }))
    setMembers(memList)
    setProfileMap(pmap)

    await loadChannels(pmap, memList)
    setLoading(false)
  }

  async function loadChannels(
    pmap: Record<string, Profile | null> = profileMap,
    _memList: OrgMember[] = members
  ) {
    const { data: chData } = await supabase
      .from('chat_channels')
      .select('*')
      .eq('organization_id', org!.id)
      .order('created_at', { ascending: true })

    const chList = (chData ?? []) as ChatChannel[]

    // Ensure at least one workspace channel
    let workspaceChannels = chList.filter(c => c.type === 'workspace')
    if (workspaceChannels.length === 0) {
      // Try with name/created_by (migration 041+), fall back to bare insert
      const { data: c1, error: e1 } = await supabase
        .from('chat_channels')
        .insert({ organization_id: org!.id, type: 'workspace', name: 'Genel', created_by: userId })
        .select().single()
      if (!e1 && c1) {
        workspaceChannels = [c1 as ChatChannel]
      } else {
        const { data: c2 } = await supabase
          .from('chat_channels')
          .insert({ organization_id: org!.id, type: 'workspace' })
          .select().single()
        if (c2) workspaceChannels = [c2 as ChatChannel]
      }
    }

    setChannels(workspaceChannels)

    const dmList = chList
      .filter(c => c.type === 'dm')
      .map(c => {
        const otherId = c.participant_a === userId ? c.participant_b : c.participant_a
        return { ...c, otherProfile: pmap[otherId ?? ''] ?? null } as DmChannel
      })
    setDmChannels(dmList)

    setActiveChannelId(prev => {
      if (prev && chList.find(c => c.id === prev)) return prev
      return workspaceChannels[0]?.id ?? chList[0]?.id ?? null
    })
  }

  // ── Load messages when channel changes ────────────────────────────────────────
  useEffect(() => {
    if (!activeChannelId) return
    loadMessages(activeChannelId)
    setupRealtime(activeChannelId)
    markRead(activeChannelId)
    return () => {
      if (realtimeChannelRef.current) supabase.removeChannel(realtimeChannelRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannelId])

  async function loadMessages(channelId: string) {
    // Try with parent_message_id filter (migration 041+), fall back without it
    let { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('channel_id', channelId)
      .is('parent_message_id', null)
      .order('created_at', { ascending: true })
      .limit(150)

    if (error) {
      // Column doesn't exist yet — load all messages without thread filter
      const res = await supabase
        .from('chat_messages')
        .select('*')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: true })
        .limit(150)
      data = res.data
    }

    const msgs = (data ?? []) as ChatMessage[]
    setMessages(msgs)
    setJumpToId(null)

    // Reactions (table only exists after migration 041)
    const ids = msgs.map(m => m.id)
    if (ids.length > 0) {
      const { data: rxData, error: rxErr } = await supabase.from('chat_reactions').select('*').in('message_id', ids)
      if (!rxErr) {
        const rmap: Record<string, ChatReaction[]> = {}
        for (const r of (rxData as ChatReaction[]) ?? []) {
          if (!rmap[r.message_id]) rmap[r.message_id] = []
          rmap[r.message_id].push(r)
        }
        setReactions(rmap)
      } else {
        setReactions({})
      }
    } else {
      setReactions({})
    }

    // Pins (table only exists after migration 041)
    const { data: pinData } = await supabase
      .from('chat_pins')
      .select('*, message:chat_messages(*)')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: false })
    setPins((pinData ?? []) as ChatPin[])
  }

  function setupRealtime(channelId: string) {
    if (realtimeChannelRef.current) supabase.removeChannel(realtimeChannelRef.current)

    const ch = supabase
      .channel(`chat-main-${channelId}-${userId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chat_messages',
        filter: `channel_id=eq.${channelId}`,
      }, payload => {
        const msg = payload.new as ChatMessage
        if (msg.parent_message_id) {
          setMessages(prev => prev.map(m =>
            m.id === msg.parent_message_id ? { ...m, thread_count: m.thread_count + 1 } : m
          ))
          return
        }
        setMessages(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg])
      })
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'chat_messages',
      }, payload => {
        const del = payload.old as { id: string }
        setMessages(prev => prev.filter(m => m.id !== del.id))
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chat_reactions',
      }, payload => {
        const r = payload.new as ChatReaction
        setReactions(prev => ({
          ...prev,
          [r.message_id]: [...(prev[r.message_id] ?? []).filter(x => x.id !== r.id), r],
        }))
      })
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'chat_reactions',
      }, payload => {
        const r = payload.old as ChatReaction
        setReactions(prev => ({
          ...prev,
          [r.message_id]: (prev[r.message_id] ?? []).filter(x => x.id !== r.id),
        }))
      })
      .subscribe()

    realtimeChannelRef.current = ch
  }

  async function markRead(channelId: string) {
    if (!userId) return
    const { data: latest } = await supabase
      .from('chat_messages')
      .select('id')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (latest) {
      await supabase.from('chat_message_reads').upsert(
        { channel_id: channelId, user_id: userId, last_read_message_id: latest.id, updated_at: new Date().toISOString() },
        { onConflict: 'channel_id,user_id' }
      )
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────────────

  async function sendMessage(content: string) {
    if (!activeChannelId || !userId) return
    const myName = myProfile?.full_name ?? myProfile?.username ?? 'Kullanıcı'

    await supabase.from('chat_messages').insert({
      channel_id: activeChannelId,
      sender_id: userId,
      content,
    })

    const mentionIds = parseMentionIds(content)
    for (const uid of mentionIds) {
      if (uid === userId) continue
      await supabase.from('notifications').insert({
        user_id: uid,
        type: 'system',
        event_type: 'mention',
        title: `${myName} sizi sohbette etiketledi`,
        description: content.replace(/<@[^>]+>/g, m => {
          const u = m.slice(2, -1)
          return '@' + (profileMap[u]?.full_name ?? 'kullanıcı')
        }),
        actor_id: userId,
        actor_name: myName,
        link: `/org/${org?.slug}/chat`,
        is_read: false,
        organization_id: org?.id ?? null,
      })
    }
  }

  async function deleteMessage(msgId: string) {
    await supabase.from('chat_messages').delete().eq('id', msgId)
  }

  async function toggleReaction(messageId: string, emoji: string) {
    const existing = (reactions[messageId] ?? []).find(r => r.user_id === userId && r.emoji === emoji)
    if (existing) {
      // Optimistic: hemen UI'dan kaldır, DB'den de sil
      setReactions(prev => ({
        ...prev,
        [messageId]: (prev[messageId] ?? []).filter(r => r.id !== existing.id),
      }))
      await supabase.from('chat_reactions').delete().eq('id', existing.id)
    } else {
      // Optimistic: hemen UI'a ekle
      const tempReaction: ChatReaction = {
        id: `temp-${Date.now()}`,
        message_id: messageId,
        user_id: userId!,
        emoji,
        created_at: new Date().toISOString(),
      }
      setReactions(prev => ({
        ...prev,
        [messageId]: [...(prev[messageId] ?? []), tempReaction],
      }))
      const { data } = await supabase
        .from('chat_reactions')
        .insert({ message_id: messageId, user_id: userId, emoji })
        .select()
        .single()
      // Temp ID'yi gerçek ID ile değiştir
      if (data) {
        setReactions(prev => ({
          ...prev,
          [messageId]: (prev[messageId] ?? []).map(r => r.id === tempReaction.id ? data as ChatReaction : r),
        }))
      }
    }
  }

  async function pinMessage(msg: ChatMessage) {
    const { data } = await supabase
      .from('chat_pins')
      .insert({ channel_id: activeChannelId, message_id: msg.id, pinned_by: userId })
      .select('*, message:chat_messages(*)')
      .single()
    if (data) setPins(prev => [data as ChatPin, ...prev])
  }

  async function unpinMessage(pinId: string) {
    await supabase.from('chat_pins').delete().eq('id', pinId)
    setPins(prev => prev.filter(p => p.id !== pinId))
  }

  async function getOrCreateDm(otherId: string) {
    if (!userId || !org?.id) return
    const a = userId < otherId ? userId : otherId
    const b = userId < otherId ? otherId : userId

    // Check if DM already exists
    const { data: existing, error: selErr } = await supabase
      .from('chat_channels')
      .select('*')
      .eq('organization_id', org.id)
      .eq('type', 'dm')
      .eq('participant_a', a)
      .eq('participant_b', b)
      .maybeSingle()

    if (selErr) console.error('DM select error:', selErr)
    if (existing) { setActiveChannelId(existing.id); return }

    // Create new DM
    const { data: created, error: insErr } = await supabase
      .from('chat_channels')
      .insert({ organization_id: org.id, type: 'dm', participant_a: a, participant_b: b })
      .select()
      .single()

    if (insErr) { console.error('DM insert error:', insErr); return }

    if (created) {
      const dm: DmChannel = { ...(created as ChatChannel), otherProfile: profileMap[otherId] ?? null }
      setDmChannels(prev => {
        // Avoid duplicates
        if (prev.find(d => d.id === created.id)) return prev
        return [...prev, dm]
      })
      setActiveChannelId(created.id)
    }
  }

  function handleThreadCountChange(messageId: string, delta: number) {
    setMessages(prev => prev.map(m =>
      m.id === messageId ? { ...m, thread_count: Math.max(0, m.thread_count + delta) } : m
    ))
  }

  // ── Derived ───────────────────────────────────────────────────────────────────
  const allChannels: ChatChannel[] = [...channels, ...(dmChannels as ChatChannel[])]
  const activeChannel = allChannels.find(c => c.id === activeChannelId) ?? null
  const isDm = activeChannel?.type === 'dm'
  const otherParticipantId = isDm
    ? (activeChannel?.participant_a === userId ? activeChannel?.participant_b : activeChannel?.participant_a)
    : null
  const channelDisplayName = isDm
    ? (profileMap[otherParticipantId ?? '']?.full_name ?? profileMap[otherParticipantId ?? '']?.username ?? 'DM')
    : (activeChannel?.name ?? 'Genel')

  if (!userId || !org) return null

  // Mobile: sidebar kapatınca mesaj alanı aç
  function handleChannelSelect(id: string) {
    setActiveChannelId(id)
    setThreadMsg(null)
    if (isMobile) setMobileSidebarOpen(false)
  }

  // 100svh = tarayıcı UI (URL çubuğu) görünürken bile gerçek görünür yükseklik
  const chatH = isMobile ? 'calc(100svh - 68px)' : '100vh'

  return (
    <div style={{
      display: 'flex', height: chatH, background: '#f5f6fa',
      overflow: 'hidden', fontFamily: 'Inter, system-ui, sans-serif',
    }}>

      {/* LEFT SIDEBAR */}
      <div style={{
        width: isMobile ? '100%' : 260,
        height: chatH,
        flexShrink: 0,
        background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
        borderRight: '1px solid rgba(255,255,255,0.07)',
        display: isMobile && !mobileSidebarOpen ? 'none' : 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Loader2 size={24} color="rgba(255,255,255,0.3)" style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        ) : (
          <ChannelSidebar
            channels={channels}
            dmChannels={dmChannels}
            activeChannelId={activeChannelId}
            userId={userId}
            orgId={org.id}
            myProfile={myProfile}
            isAdmin={isAdmin}
            members={members}
            profileMap={profileMap}
            supabase={supabase}
            onSelect={handleChannelSelect}
            onChannelsChanged={() => loadChannels()}
            onDmStart={getOrCreateDm}
          />
        )}
      </div>

      {/* MAIN AREA */}
      <div style={{
        flex: 1, display: isMobile && mobileSidebarOpen ? 'none' : 'flex',
        flexDirection: 'column', minWidth: 0, overflow: 'hidden', background: '#ffffff',
      }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: isMobile ? '0 12px' : '0 20px', height: 60, flexShrink: 0,
          borderBottom: '1px solid #e5e7eb',
          background: '#ffffff',
        }}>
          {/* Mobilde geri butonu */}
          {isMobile && (
            <button
              onClick={() => setMobileSidebarOpen(true)}
              style={{
                width: 32, height: 32, borderRadius: 8, background: 'transparent',
                border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 18, color: '#64748b', flexShrink: 0,
              }}
            >
              ←
            </button>
          )}
          {isDm
            ? <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
            : <Hash size={18} color="#94a3b8" style={{ flexShrink: 0 }} />
          }
          <span style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{channelDisplayName}</span>
          {!isDm && !isMobile && activeChannel?.description && (
            <span style={{
              fontSize: 13, color: '#94a3b8',
              borderLeft: '1px solid #e5e7eb', paddingLeft: 12,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              flex: 1, minWidth: 0,
            }}>
              {activeChannel.description}
            </span>
          )}

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            {pins.length > 0 && (
              <button
                onClick={() => setShowPins(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: isMobile ? '5px 8px' : '5px 11px',
                  borderRadius: 9, background: 'rgba(245,158,11,0.1)',
                  border: '1px solid rgba(245,158,11,0.3)', cursor: 'pointer',
                  color: '#d97706', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
                }}
              >
                <Pin size={12} />
                {pins.length}
              </button>
            )}
            <button
              onClick={() => setShowSearch(true)}
              style={{
                width: 34, height: 34, borderRadius: 9,
                background: '#f5f6fa', border: '1px solid #e5e7eb',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              title="Mesajlarda ara (Ctrl+K)"
            >
              <Search size={15} color="#94a3b8" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <MessageArea
          messages={messages}
          reactions={reactions}
          pins={pins}
          userId={userId}
          isAdmin={isAdmin}
          members={members}
          profileMap={profileMap}
          jumpToId={jumpToId}
          onThread={msg => setThreadMsg(msg)}
          onDelete={deleteMessage}
          onReact={toggleReaction}
          onPin={pinMessage}
          onUnpin={unpinMessage}
          onCreateTask={msg => setTaskMsg(msg)}
        />

        {/* Input */}
        <div style={{ padding: isMobile ? '10px 12px 14px' : '12px 20px 16px', flexShrink: 0, borderTop: '1px solid #e5e7eb' }}>
          <MessageInput
            placeholder={isDm
              ? `${channelDisplayName} ile mesajlaş`
              : `#${channelDisplayName} kanalına yaz…`
            }
            members={members}
            profileMap={profileMap}
            disabled={!activeChannelId}
            onSend={sendMessage}
          />
        </div>
      </div>

      {/* THREAD PANEL */}
      {threadMsg && (
        <div style={isMobile
          ? { position: 'fixed', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff' }
          : { width: 380, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }
        }>
          <ThreadPanel
            parentMessage={threadMsg}
            userId={userId}
            orgId={org.id}
            myProfile={myProfile}
            isAdmin={isAdmin}
            members={members}
            profileMap={profileMap}
            supabase={supabase}
            orgSlug={org.slug}
            onClose={() => setThreadMsg(null)}
            onThreadCountChange={handleThreadCountChange}
          />
        </div>
      )}

      {/* MODALS */}
      {showPins && activeChannelId && (
        <PinsModal
          pins={pins}
          profileMap={profileMap}
          isAdmin={isAdmin}
          onUnpin={unpinMessage}
          onClose={() => setShowPins(false)}
          onJumpTo={id => { setJumpToId(id); setShowPins(false) }}
        />
      )}

      {showSearch && activeChannelId && (
        <SearchModal
          channelId={activeChannelId}
          channelName={channelDisplayName}
          profileMap={profileMap}
          supabase={supabase}
          onClose={() => setShowSearch(false)}
          onJumpTo={id => { setJumpToId(id); setShowSearch(false) }}
        />
      )}

      {taskMsg && (
        <CreateTaskModal
          message={taskMsg}
          orgId={org.id}
          userId={userId}
          members={members}
          supabase={supabase}
          onClose={() => setTaskMsg(null)}
          onCreated={() => setTaskMsg(null)}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
