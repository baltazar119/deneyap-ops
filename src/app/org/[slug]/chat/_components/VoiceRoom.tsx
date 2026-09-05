'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Mic, MicOff, PhoneOff, Phone, Volume2 } from 'lucide-react'
import { SupabaseClient } from '@supabase/supabase-js'
import { Profile } from './types'
import { avatarBg, getInitials } from './helpers'

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

interface Props {
  orgId: string
  userId: string
  profileMap: Record<string, Profile | null>
  supabase: SupabaseClient
}

export default function VoiceRoom({ orgId, userId, profileMap, supabase }: Props) {
  const [inRoom, setInRoom] = useState(false)
  const [joining, setJoining] = useState(false)
  const [participants, setParticipants] = useState<string[]>([])
  const [isMuted, setIsMuted] = useState(false)
  const [speaking, setSpeaking] = useState<string[]>([])
  const [micError, setMicError] = useState<string | null>(null)

  const localStreamRef = useRef<MediaStream | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const peersRef = useRef<Map<string, any>>(new Map())
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelRef = useRef<any>(null)
  const audioElemsRef = useRef<Map<string, HTMLAudioElement>>(new Map())
  const analyserTimersRef = useRef<Map<string, number>>(new Map())
  const audioCtxRef = useRef<Map<string, AudioContext>>(new Map())
  /** Karşı tarafın remote description'ı set edilmeden önce gelen ICE adayları
   *  buraya kuyruklanır — yoksa addIceCandidate sessizce başarısız olur ve
   *  bağlantı hiç kurulamaz (ses gitmez/gelmez). */
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map())

  const channelName = `voice-${orgId}`

  function broadcast(payload: object) {
    channelRef.current?.send({ type: 'broadcast', event: 'signal', payload })
  }

  function setupSpeakingDetector(streamUserId: string, stream: MediaStream) {
    try {
      const ctx = new AudioContext()
      audioCtxRef.current.set(streamUserId, ctx)
      // Chrome bazı durumlarda AudioContext'i 'suspended' başlatır; resume
      // edilmezse analyser hep sıfır veri döner ve konuşma hiç algılanmaz.
      ctx.resume().catch(() => {})
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      source.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      const timer = window.setInterval(() => {
        analyser.getByteFrequencyData(data)
        const avg = data.reduce((a, b) => a + b, 0) / data.length
        setSpeaking(prev => {
          const isSpeaking = avg > 10
          const already = prev.includes(streamUserId)
          if (isSpeaking && !already) return [...prev, streamUserId]
          if (!isSpeaking && already) return prev.filter(id => id !== streamUserId)
          return prev
        })
      }, 100)
      analyserTimersRef.current.set(streamUserId, timer)
    } catch { /* AudioContext might not be available in some environments */ }
  }

  function createAudioElement(remoteUserId: string, stream: MediaStream) {
    let audio = audioElemsRef.current.get(remoteUserId)
    if (!audio) {
      audio = new Audio()
      audio.autoplay = true
      audioElemsRef.current.set(remoteUserId, audio)
    }
    audio.srcObject = stream
    setupSpeakingDetector(remoteUserId, stream)
  }

  const removePeer = useCallback((remoteUserId: string) => {
    const pc = peersRef.current.get(remoteUserId)
    if (pc) { pc.close(); peersRef.current.delete(remoteUserId) }
    const audio = audioElemsRef.current.get(remoteUserId)
    if (audio) { audio.srcObject = null; audioElemsRef.current.delete(remoteUserId) }
    const timer = analyserTimersRef.current.get(remoteUserId)
    if (timer) { clearInterval(timer); analyserTimersRef.current.delete(remoteUserId) }
    const ctx = audioCtxRef.current.get(remoteUserId)
    if (ctx) { ctx.close().catch(() => {}); audioCtxRef.current.delete(remoteUserId) }
    pendingIceRef.current.delete(remoteUserId)
    setParticipants(prev => prev.filter(id => id !== remoteUserId))
    setSpeaking(prev => prev.filter(id => id !== remoteUserId))
  }, [])

  async function createPeerConnection(remoteUserId: string, isInitiator: boolean) {
    if (peersRef.current.has(remoteUserId)) return peersRef.current.get(remoteUserId)

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    peersRef.current.set(remoteUserId, pc)

    // Add local audio tracks
    localStreamRef.current?.getTracks().forEach(t => {
      pc.addTrack(t, localStreamRef.current!)
    })

    // Handle incoming remote stream
    const remoteStream = new MediaStream()
    pc.ontrack = (e) => {
      remoteStream.addTrack(e.track)
      createAudioElement(remoteUserId, remoteStream)
    }

    // ICE candidates → send via broadcast
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        broadcast({ type: 'ice', from: userId, to: remoteUserId, candidate: e.candidate.toJSON() })
      }
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        removePeer(remoteUserId)
      }
    }

    if (isInitiator) {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      broadcast({ type: 'offer', from: userId, to: remoteUserId, sdp: pc.localDescription })
    }

    return pc
  }

  /** setRemoteDescription tamamlanana kadar biriken ICE adaylarını sırayla ekler. */
  async function flushPendingIce(remoteUserId: string, pc: RTCPeerConnection) {
    const queued = pendingIceRef.current.get(remoteUserId)
    if (!queued?.length) return
    pendingIceRef.current.delete(remoteUserId)
    for (const candidate of queued) {
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)) } catch { /* ignore */ }
    }
  }

  async function joinRoom() {
    setMicError(null)
    setJoining(true)

    // 1. Check mediaDevices API availability
    if (!navigator?.mediaDevices?.getUserMedia) {
      setMicError('Tarayıcınız ses erişimini desteklemiyor. HTTPS gereklidir.')
      setJoining(false)
      return
    }

    // 2. Request microphone access
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    } catch (err: unknown) {
      const name = (err as { name?: string })?.name ?? 'UnknownError'
      const msg = (err as { message?: string })?.message ?? ''
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setMicError('blocked')
      } else if (name === 'NotFoundError') {
        setMicError('notfound')
      } else {
        setMicError('other')
      }
      setJoining(false)
      return
    }
    localStreamRef.current = stream
    setupSpeakingDetector(userId, stream)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ch = supabase.channel(channelName, { config: { presence: { key: userId }, broadcast: { self: false } } })

    // WebRTC signaling via broadcast
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ch.on('broadcast', { event: 'signal' }, async ({ payload }: any) => {
      if (payload.to !== userId) return

      if (payload.type === 'offer') {
        let pc = peersRef.current.get(payload.from)
        if (!pc) pc = await createPeerConnection(payload.from, false)
        if (!pc) return
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
          await flushPendingIce(payload.from, pc)
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          broadcast({ type: 'answer', from: userId, to: payload.from, sdp: pc.localDescription })
        } catch { /* ignore race conditions */ }
      }

      if (payload.type === 'answer') {
        const pc = peersRef.current.get(payload.from)
        if (pc && pc.signalingState !== 'stable') {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
            await flushPendingIce(payload.from, pc)
          } catch {}
        }
      }

      if (payload.type === 'ice') {
        const pc = peersRef.current.get(payload.from)
        if (!pc) return
        if (pc.remoteDescription) {
          try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)) } catch {}
        } else {
          // remote description henüz gelmedi — kuyruğa al, flushPendingIce ile eklenecek
          const q = pendingIceRef.current.get(payload.from) ?? []
          q.push(payload.candidate)
          pendingIceRef.current.set(payload.from, q)
        }
      }
    })

    // Presence sync → update participant list
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ids = Object.values(state).flat().map((p: any) => p.userId).filter((id: string) => id !== userId)
      setParticipants(ids)
    })

    // User left → clean up peer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ch.on('presence', { event: 'leave' }, ({ leftPresences }: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      leftPresences.forEach((p: any) => removePeer(p.userId))
    })

    ch.subscribe(async (status: string) => {
      if (status === 'SUBSCRIBED') {
        try {
          await ch.track({ userId, joinedAt: Date.now() })
        } catch { /* track failure is non-fatal */ }

        // Send offers to everyone already in the room
        const state = ch.presenceState()
        const existingIds = Object.values(state)
          .flat()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((p: any) => p.userId)
          .filter((id: string) => id !== userId)

        for (const remoteId of existingIds) {
          await createPeerConnection(remoteId, true)
        }
        setParticipants(existingIds)
        setInRoom(true)
        setJoining(false)
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        setMicError(`Sunucuya bağlanılamadı (${status}). Tekrar dene.`)
        stream.getTracks().forEach(t => t.stop())
        localStreamRef.current = null
        setJoining(false)
      }
    })

    channelRef.current = ch
  }

  function leaveRoom() {
    // Stop local mic
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    localStreamRef.current = null

    // Close all peer connections
    peersRef.current.forEach(pc => pc.close())
    peersRef.current.clear()

    // Remove audio elements
    audioElemsRef.current.forEach(a => { a.srcObject = null })
    audioElemsRef.current.clear()

    // Stop all speaking detectors
    analyserTimersRef.current.forEach(t => clearInterval(t))
    analyserTimersRef.current.clear()
    audioCtxRef.current.forEach(ctx => ctx.close().catch(() => {}))
    audioCtxRef.current.clear()
    pendingIceRef.current.clear()

    // Unsubscribe from Supabase channel
    channelRef.current?.untrack()
    channelRef.current?.unsubscribe()
    channelRef.current = null

    setInRoom(false)
    setParticipants([])
    setSpeaking([])
    setIsMuted(false)
  }

  function toggleMute() {
    const stream = localStreamRef.current
    if (!stream) return
    const track = stream.getAudioTracks()[0]
    if (track) {
      track.enabled = !track.enabled
      setIsMuted(!track.enabled)
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (channelRef.current) leaveRoom()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isSpeaking = (uid: string) => speaking.includes(uid)

  return (
    <div style={{
      margin: '8px 8px 6px',
      borderRadius: 12,
      background: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(255,255,255,0.09)',
      overflow: 'hidden',
    }}>
      {/* Header row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '9px 12px',
        borderBottom: (inRoom || participants.length > 0) ? '1px solid rgba(255,255,255,0.07)' : 'none',
      }}>
        <div style={{
          width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
          background: inRoom ? '#22c55e' : 'rgba(255,255,255,0.2)',
          boxShadow: inRoom ? '0 0 6px rgba(34,197,94,0.6)' : 'none',
          transition: 'all 0.3s',
        }} />
        <span style={{
          fontSize: 11, fontWeight: 700,
          color: 'rgba(255,255,255,0.4)',
          letterSpacing: '0.09em', textTransform: 'uppercase', flex: 1,
        }}>
          Ses Odası
        </span>
        {!inRoom && (
          <button
            onClick={joinRoom}
            disabled={joining}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: micError ? 'rgba(239,68,68,0.12)' : joining ? 'rgba(255,255,255,0.08)' : 'rgba(34,197,94,0.12)',
              border: micError ? '1px solid rgba(239,68,68,0.3)' : joining ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(34,197,94,0.28)',
              color: micError ? '#f87171' : joining ? 'rgba(255,255,255,0.45)' : '#4ade80',
              fontSize: 11.5, fontWeight: 600,
              cursor: joining ? 'default' : 'pointer', padding: '3px 9px', borderRadius: 7,
              fontFamily: 'inherit',
            }}
          >
            <Phone size={11} />
            {joining ? 'Bağlanıyor…' : micError ? 'Tekrar Dene' : 'Katıl'}
          </button>
        )}
      </div>

      {/* Mic permission error banner */}
      {micError && (
        <div style={{
          padding: '8px 12px 10px',
          borderBottom: '1px solid rgba(239,68,68,0.15)',
          background: 'rgba(239,68,68,0.07)',
        }}>
          {micError === 'blocked' ? (
            <>
              <div style={{ fontSize: 11.5, color: '#fca5a5', fontWeight: 600, marginBottom: 5 }}>
                🔒 Mikrofon izni gerekiyor
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, marginBottom: 8 }}>
                1. Adres çubuğundaki <strong style={{ color: 'rgba(255,255,255,0.7)' }}>🔒 kilit</strong> ikonuna tıkla<br />
                2. <strong style={{ color: 'rgba(255,255,255,0.7)' }}>Mikrofon → İzin Ver</strong> seç<br />
                3. Aşağıdaki butona bas 👇
              </div>
              <button
                onClick={() => window.location.reload()}
                style={{
                  width: '100%', padding: '6px 0', borderRadius: 8,
                  background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.35)',
                  color: '#4ade80', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                }}
              >
                🔄 Sayfayı Yenile (İzin Verdikten Sonra)
              </button>
            </>
          ) : micError === 'notfound' ? (
            <div style={{ fontSize: 11.5, color: '#fca5a5' }}>🎤 Mikrofon bulunamadı. Bir mikrofon bağlı mı?</div>
          ) : micError === 'other' ? (
            <div style={{ fontSize: 11.5, color: '#fca5a5' }}>⚠️ Mikrofona erişilemedi. Başka bir uygulama mikrofonu kullanıyor olabilir.</div>
          ) : micError ? (
            <div style={{ fontSize: 11.5, color: '#fca5a5' }}>⚠️ Bağlantı kurulamadı. Tekrar deneyin.</div>
          ) : null}
        </div>
      )}

      {/* Participant list */}
      {(inRoom || participants.length > 0) && (
        <div style={{ padding: '4px 8px 4px' }}>
          {/* Self */}
          {inRoom && (
            <ParticipantRow
              uid={userId}
              label={(profileMap[userId]?.full_name ?? 'Sen') + ' (sen)'}
              avatarUrl={profileMap[userId]?.avatar_url ?? null}
              isMe
              isMuted={isMuted}
              isSpeaking={isSpeaking(userId) && !isMuted}
            />
          )}
          {/* Others */}
          {participants.map(pid => (
            <ParticipantRow
              key={pid}
              uid={pid}
              label={profileMap[pid]?.full_name ?? profileMap[pid]?.username ?? 'Kullanıcı'}
              avatarUrl={profileMap[pid]?.avatar_url ?? null}
              isMe={false}
              isMuted={false}
              isSpeaking={isSpeaking(pid)}
            />
          ))}
        </div>
      )}

      {/* Controls */}
      {inRoom && (
        <div style={{
          display: 'flex', gap: 6, padding: '8px 10px',
          borderTop: '1px solid rgba(255,255,255,0.07)',
        }}>
          <button
            onClick={toggleMute}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              padding: '5px 0', borderRadius: 8,
              background: isMuted ? 'rgba(239,68,68,0.18)' : 'rgba(255,255,255,0.07)',
              border: isMuted ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(255,255,255,0.12)',
              color: isMuted ? '#f87171' : 'rgba(255,255,255,0.65)',
              fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {isMuted ? <MicOff size={12} /> : <Mic size={12} />}
            {isMuted ? 'Sessiz' : 'Mikrofon'}
          </button>
          <button
            onClick={leaveRoom}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              padding: '5px 10px', borderRadius: 8,
              background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
              color: '#f87171', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <PhoneOff size={12} />
            Ayrıl
          </button>
        </div>
      )}
    </div>
  )
}

// ── Small helper sub-component ──────────────────────────────────────────────
function ParticipantRow({ uid, label, avatarUrl, isMe, isMuted, isSpeaking }: {
  uid: string
  label: string
  avatarUrl: string | null
  isMe: boolean
  isMuted: boolean
  isSpeaking: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 4px', borderRadius: 8 }}>
      <div style={{
        width: 26, height: 26, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
        background: avatarBg(uid),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, fontWeight: 700, color: '#fff',
        boxShadow: isSpeaking ? '0 0 0 2.5px #22c55e' : '0 0 0 2.5px transparent',
        transition: 'box-shadow 0.15s',
        position: 'relative',
      }}>
        {avatarUrl
          ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : getInitials(null)
        }
        {isMe && isMuted && (
          <div style={{
            position: 'absolute', bottom: -2, right: -2,
            width: 12, height: 12, borderRadius: '50%',
            background: '#ef4444',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1.5px solid #1e293b',
          }}>
            <MicOff size={6} color="#fff" />
          </div>
        )}
      </div>
      <span style={{
        fontSize: 12.5, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        color: isMe ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.85)',
      }}>
        {label}
      </span>
      {isSpeaking && <Volume2 size={12} color="#4ade80" />}
    </div>
  )
}
