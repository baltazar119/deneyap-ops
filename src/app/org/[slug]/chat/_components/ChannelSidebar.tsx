'use client'

import { useState } from 'react'
import { Hash, Plus, ChevronDown, ChevronRight, X, MessageCircle } from 'lucide-react'
import { SupabaseClient } from '@supabase/supabase-js'
import { ChatChannel, OrgMember, Profile, DmChannel } from './types'
import { statusColor } from './helpers'
import Avatar from './Avatar'
import StatusPicker from './StatusPicker'
import VoiceRoom from './VoiceRoom'

interface Props {
  channels: ChatChannel[]
  dmChannels: DmChannel[]
  activeChannelId: string | null
  userId: string
  orgId: string
  myProfile: Profile | null
  isAdmin: boolean
  members: OrgMember[]
  profileMap: Record<string, Profile | null>
  supabase: SupabaseClient
  onSelect: (id: string) => void
  onChannelsChanged: () => void
  onDmStart: (memberId: string) => void
}

export default function ChannelSidebar({
  channels, dmChannels, activeChannelId, userId, orgId, myProfile,
  isAdmin, members, profileMap, supabase,
  onSelect, onChannelsChanged, onDmStart,
}: Props) {
  const [channelsOpen, setChannelsOpen] = useState(true)
  const [dmsOpen, setDmsOpen] = useState(true)
  const [showAddChannel, setShowAddChannel] = useState(false)
  const [showDmPicker, setShowDmPicker] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [addingChannel, setAddingChannel] = useState(false)
  const [showStatus, setShowStatus] = useState(false)
  const [myStatus, setMyStatus] = useState(myProfile?.chat_status ?? 'online')
  const [myStatusEmoji, setMyStatusEmoji] = useState(myProfile?.status_emoji ?? '')
  const [myStatusText, setMyStatusText] = useState(myProfile?.status_text ?? '')
  const [addError, setAddError] = useState('')

  async function createChannel() {
    const name = newName.trim().toLowerCase().replace(/\s+/g, '-')
    if (!name) return
    setAddingChannel(true)
    setAddError('')
    const { error } = await supabase.from('chat_channels').insert({
      organization_id: orgId,
      type: 'workspace',
      name,
      description: newDesc.trim() || null,
      created_by: userId,
    })
    if (error) {
      setAddError('Kanal oluşturulamadı: ' + error.message)
      setAddingChannel(false)
      return
    }
    setNewName('')
    setNewDesc('')
    setShowAddChannel(false)
    setAddingChannel(false)
    setAddError('')
    onChannelsChanged()
  }

  async function deleteChannel(channelId: string) {
    if (!confirm('Bu kanalı silmek istediğinize emin misiniz?')) return
    await supabase.from('chat_channels').delete().eq('id', channelId)
    onChannelsChanged()
  }

  const sectionTitle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)',
    letterSpacing: '0.09em', textTransform: 'uppercase',
    display: 'flex', alignItems: 'center', gap: 5,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '18px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>Sohbet</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>Ekip iletişimi</div>
      </div>

      {/* Scrollable list */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 0' }}>

        {/* KANALLAR */}
        <div>
          <div
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 14px 6px', cursor: 'pointer' }}
            onClick={() => setChannelsOpen(o => !o)}
          >
            <span style={sectionTitle}>
              {channelsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              Kanallar
            </span>
            {/* + butonu herkese açık */}
            <button
              onClick={e => { e.stopPropagation(); setShowAddChannel(v => !v) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', padding: 2, borderRadius: 5, display: 'flex' }}
              title="Kanal Ekle"
            >
              <Plus size={14} />
            </button>
          </div>

          {channelsOpen && channels.map(ch => {
            const isActive = ch.id === activeChannelId
            const isDefault = ch.name === 'Genel'
            return (
              <div
                key={ch.id}
                onClick={() => onSelect(ch.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  margin: '1px 8px', padding: '8px 10px', borderRadius: 10,
                  cursor: 'pointer', userSelect: 'none',
                  background: isActive ? 'rgba(37,99,235,0.3)' : 'transparent',
                  border: isActive ? '1px solid rgba(37,99,235,0.35)' : '1px solid transparent',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
              >
                <Hash size={15} color={isActive ? '#93c5fd' : 'rgba(255,255,255,0.4)'} />
                <span style={{ fontSize: 14, fontWeight: isActive ? 700 : 500, color: isActive ? '#fff' : 'rgba(255,255,255,0.75)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ch.name ?? 'genel'}
                </span>
                {/* Silme sadece admin'e */}
                {isAdmin && !isDefault && (
                  <button
                    onClick={e => { e.stopPropagation(); deleteChannel(ch.id) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.25)', padding: 2, display: 'flex', opacity: 0 }}
                    onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#f87171' }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = '0' }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            )
          })}

          {/* Kanal ekleme formu */}
          {showAddChannel && (
            <div style={{ margin: '8px 10px', padding: '12px', borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') createChannel(); if (e.key === 'Escape') setShowAddChannel(false) }}
                placeholder="kanal-adı"
                style={{
                  width: '100%', padding: '7px 10px', borderRadius: 8, boxSizing: 'border-box',
                  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                  color: '#fff', fontSize: 13, outline: 'none', fontFamily: 'inherit', marginBottom: 7,
                }}
              />
              <input
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder="Açıklama (opsiyonel)"
                style={{
                  width: '100%', padding: '7px 10px', borderRadius: 8, boxSizing: 'border-box',
                  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                  color: '#fff', fontSize: 12, outline: 'none', fontFamily: 'inherit', marginBottom: 8,
                }}
              />
              {addError && <div style={{ fontSize: 11.5, color: '#f87171', marginBottom: 4 }}>{addError}</div>}
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={createChannel}
                  disabled={addingChannel}
                  style={{ flex: 1, padding: '6px 0', borderRadius: 8, background: '#2563eb', border: 'none', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: addingChannel ? 0.7 : 1 }}
                >
                  {addingChannel ? 'Oluşturuluyor…' : 'Oluştur'}
                </button>
                <button
                  onClick={() => { setShowAddChannel(false); setAddError('') }}
                  style={{ padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.08)', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  İptal
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ÖZEL MESAJLAR */}
        <div style={{ marginTop: 8 }}>
          <div
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 14px 6px', cursor: 'pointer' }}
            onClick={() => setDmsOpen(o => !o)}
          >
            <span style={sectionTitle}>
              {dmsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              Özel Mesajlar
            </span>
            <button
              onClick={e => { e.stopPropagation(); setShowDmPicker(o => !o) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', padding: 2, borderRadius: 5, display: 'flex' }}
              title="Yeni DM"
            >
              <Plus size={14} />
            </button>
          </div>

          {/* DM Kullanıcı seçici */}
          {showDmPicker && (
            <div style={{ margin: '0 10px 8px', borderRadius: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden', maxHeight: 220, overflowY: 'auto' }}>
              {members.filter(m => m.user_id !== userId).length === 0 && (
                <div style={{ padding: '12px 14px', fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Başka üye yok</div>
              )}
              {members.filter(m => m.user_id !== userId).map(m => (
                <div
                  key={m.user_id}
                  onClick={() => { onDmStart(m.user_id); setShowDmPicker(false) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', cursor: 'pointer' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{ position: 'relative' }}>
                    <Avatar profile={m.profile} id={m.user_id} size={28} />
                    <div style={{ position: 'absolute', bottom: 0, right: 0, width: 9, height: 9, borderRadius: '50%', background: statusColor(profileMap[m.user_id]?.chat_status), border: '1.5px solid #1e293b' }} />
                  </div>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.profile?.full_name ?? m.profile?.username ?? m.user_id.slice(0, 8)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {dmsOpen && dmChannels.map(dm => {
            const isActive = dm.id === activeChannelId
            const other = dm.otherProfile
            const otherId = dm.participant_a === userId ? dm.participant_b : dm.participant_a
            return (
              <div
                key={dm.id}
                onClick={() => onSelect(dm.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9,
                  margin: '1px 8px', padding: '7px 10px', borderRadius: 10,
                  cursor: 'pointer', userSelect: 'none',
                  background: isActive ? 'rgba(37,99,235,0.3)' : 'transparent',
                  border: isActive ? '1px solid rgba(37,99,235,0.35)' : '1px solid transparent',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <Avatar profile={other} id={otherId ?? dm.id} size={28} />
                  <div style={{ position: 'absolute', bottom: 0, right: 0, width: 9, height: 9, borderRadius: '50%', background: statusColor(profileMap[otherId ?? '']?.chat_status), border: '1.5px solid #1e293b' }} />
                </div>
                <span style={{ fontSize: 13.5, fontWeight: isActive ? 700 : 400, color: isActive ? '#fff' : 'rgba(255,255,255,0.75)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {other?.full_name ?? other?.username ?? 'Kullanıcı'}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Ses Odası */}
      <VoiceRoom
        orgId={orgId}
        userId={userId}
        profileMap={profileMap}
        supabase={supabase}
      />

      {/* Alt: mevcut kullanıcı */}
      <div
        style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
        onClick={() => setShowStatus(true)}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
      >
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Avatar profile={myProfile} id={userId} size={34} />
          <div style={{ position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: '50%', background: statusColor(myStatus), border: '2px solid #1e293b' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {myProfile?.full_name ?? myProfile?.username ?? 'Sen'}
          </div>
          <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: 4 }}>
            {myStatusEmoji && <span>{myStatusEmoji}</span>}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {myStatusText || (myStatus === 'online' ? 'Çevrimiçi' : myStatus === 'away' ? 'Uzakta' : myStatus === 'dnd' ? 'Rahatsız Etme' : 'Görünmez')}
            </span>
          </div>
        </div>
        <MessageCircle size={14} color="rgba(255,255,255,0.3)" />
      </div>

      {showStatus && (
        <StatusPicker
          userId={userId}
          profile={{ ...myProfile, id: userId, full_name: myProfile?.full_name ?? null, username: myProfile?.username ?? null, avatar_url: myProfile?.avatar_url ?? null, chat_status: myStatus }}
          onClose={() => setShowStatus(false)}
          onUpdate={(s, e, t) => { setMyStatus(s); setMyStatusEmoji(e); setMyStatusText(t) }}
        />
      )}
    </div>
  )
}
