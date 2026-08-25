'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useOrg } from '@/lib/supabase/orgContext'
import { supabase } from '@/lib/supabase/client'
import { useIsMobile } from '@/lib/useIsMobile'
import type { MeetingWithAttendees } from '@/types/database'
import { Video, Plus, Clock, Users, Link2, Copy, ChevronLeft, Sparkles, X, Calendar, Check, Trash2, Eye, Zap } from 'lucide-react'

// ── Yardımcı fonksiyonlar ─────────────────────────────────────────────────────

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })
}
function fmtShortDate(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
}
function fmtElapsed(sec: number) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function groupMeetings(meetings: MeetingWithAttendees[]) {
  const now   = new Date()
  const today = now.toDateString()
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1)
  const tmrStr = tomorrow.toDateString()

  const groups: { label: string; items: MeetingWithAttendees[] }[] = []
  const todayItems    = meetings.filter(m => new Date(m.start_time).toDateString() === today)
  const tomorrowItems = meetings.filter(m => new Date(m.start_time).toDateString() === tmrStr)
  const laterItems    = meetings.filter(m => {
    const d = new Date(m.start_time).toDateString()
    return d !== today && d !== tmrStr
  })

  if (todayItems.length)    groups.push({ label: 'Bugün',   items: todayItems })
  if (tomorrowItems.length) groups.push({ label: 'Yarın',   items: tomorrowItems })
  if (laterItems.length)    groups.push({ label: 'Gelecek', items: laterItems })
  return groups
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ name, url, size = 36 }: { name: string; url: string | null; size?: number }) {
  const colors = ['#1d4ed8','#0369a1','#0f766e','#166534','#7c2d12','#6d28d9','#be185d','#b45309']
  const bg = colors[(name?.charCodeAt(0) ?? 0) % colors.length]
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: url ? '#e2eaf2' : bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.38, fontWeight: 700, color: '#fff', overflow: 'hidden', flexShrink: 0, border: '2px solid #fff' }}>
      {url ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (name?.charAt(0)?.toUpperCase() ?? '?')}
    </div>
  )
}

// ── Jitsi External API Bileşeni ───────────────────────────────────────────────

// ── Ana Sayfa ─────────────────────────────────────────────────────────────────
export default function MeetingsPage() {
  const router      = useRouter()
  const searchParams = useSearchParams()
  const { org, userId, userEmail, isAdmin, loading: orgLoading } = useOrg()

  const isMobile = useIsMobile()

  // ── Veri ──
  const [upcomingMeetings, setUpcomingMeetings] = useState<MeetingWithAttendees[]>([])
  const [pastMeetings,     setPastMeetings]     = useState<MeetingWithAttendees[]>([])
  const [loading,          setLoading]          = useState(true)
  const [gcalConnected,    setGcalConnected]    = useState(false)
  const [showPast,         setShowPast]         = useState(false)

  // ── Görünüm ──
  const [view, setView] = useState<'list' | 'room'>('list')
  const [activeMeeting, setActiveMeeting] = useState<MeetingWithAttendees | null>(null)

  // ── Not paneli ──
  const [notes,       setNotes]       = useState('')
  const [noteSaving,  setNoteSaving]  = useState(false)
  const [noteSaved,   setNoteSaved]   = useState(false)
  const [aiLoading,   setAiLoading]   = useState(false)
  const [aiResult,    setAiResult]    = useState<{ summary: string; decisions: string[]; action_items: {item: string; owner: string}[]; key_topics: string[] } | null>(null)
  const noteSaveTimer = useRef<ReturnType<typeof setTimeout>>()

  // ── Meet aktif modu (pencere küçültme) ──
  const [meetActive, setMeetActive] = useState(false)

  // ── Zamanlayıcı ──
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval>>()

  // ── Toplantı oluşturma ──
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({
    title: '', description: '', date: '', startTime: '10:00', endTime: '11:00',
    attendeeIds: [] as string[], meetType: 'jitsi' as 'none' | 'jitsi' | 'gcal',
    manualMeetLink: '', jitsiRoomName: '', isInstant: false,
  })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // ── Org üyeleri (katılımcı seçimi için) ──
  const [orgMembers, setOrgMembers] = useState<{ id: string; name: string; email: string; avatar: string | null }[]>([])

  // ── Toast ──
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)
  const showToast = useCallback((msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }, [])

  // ── Filtre sekmesi ──
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming')

  // ── Silme onayı ──
  const [confirmDelete, setConfirmDelete] = useState<MeetingWithAttendees | null>(null)

  // ── Detay drawer ──
  const [detailMeeting, setDetailMeeting] = useState<MeetingWithAttendees | null>(null)

  // ── Mobil room view tab ──
  const [mobileRoomTab, setMobileRoomTab] = useState<'meet' | 'notes'>('meet')

  // ── notesOnly modu: URL'de ?notesOnly=MEETING_ID varsa o toplantıyı yükle ──
  const notesOnlyId = searchParams.get('notesOnly')
  useEffect(() => {
    if (!notesOnlyId || !org) return
    fetch(`/api/org/${org.slug}/meetings?filter=upcoming`)
      .then(r => r.json())
      .then(d => {
        const all = [...(d.meetings || [])]
        return fetch(`/api/org/${org.slug}/meetings?filter=past`).then(r2 => r2.json()).then(d2 => {
          const found = [...all, ...(d2.meetings || [])].find((m: MeetingWithAttendees) => m.id === notesOnlyId)
          if (found) { setActiveMeeting(found); setNotes(found.notes || ''); setView('room'); setMeetActive(true) }
        })
      })
  }, [notesOnlyId, org]) // eslint-disable-line

  // ── URL param: gcal_connected / gcal_error ──
  useEffect(() => {
    if (searchParams.get('gcal_connected') === 'true') {
      setGcalConnected(true)
      showToast('Google hesabı bağlandı!')
      const url = new URL(window.location.href)
      url.searchParams.delete('gcal_connected')
      window.history.replaceState({}, '', url.toString())
    }
    const gcalErr = searchParams.get('gcal_error')
    if (gcalErr) {
      showToast(`Bağlantı hatası: ${decodeURIComponent(gcalErr)}`, 'err')
      const url = new URL(window.location.href)
      url.searchParams.delete('gcal_error')
      window.history.replaceState({}, '', url.toString())
    }
  }, [searchParams, showToast])

  // ── Veri yükle ──
  const loadMeetings = useCallback(async () => {
    if (!org) return
    setLoading(true)
    try {
      const [upRes, pastRes] = await Promise.all([
        fetch(`/api/org/${org.slug}/meetings?filter=upcoming`),
        fetch(`/api/org/${org.slug}/meetings?filter=past`),
      ])
      const upData   = await upRes.json()
      const pastData = await pastRes.json()
      setUpcomingMeetings(upData.meetings || [])
      setPastMeetings(pastData.meetings || [])
    } finally {
      setLoading(false)
    }
  }, [org])

  const checkGcal = useCallback(async () => {
    if (!org || !userId) return
    const res  = await fetch(`/api/gcal/create-event?userId=${userId}&orgId=${org.id}`)
    const data = await res.json()
    setGcalConnected(data.connected)
    setCreateForm(f => ({ ...f, useGcal: data.connected }))
  }, [org, userId])

  const loadMembers = useCallback(async () => {
    if (!org) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/org/${org.slug}/members`, {
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
      })
      if (!res.ok) return
      const data = await res.json()
      if (!data.members) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setOrgMembers(data.members.map((m: any) => ({
        id:     m.id,
        name:   m.name,
        email:  m.email,
        avatar: m.avatar,
      })))
    } catch { /* sessizce devam et */ }
  }, [org])

  useEffect(() => {
    if (orgLoading) return
    if (!org || !userId) { router.replace('/login'); return }
    loadMeetings()
    checkGcal()
    loadMembers()
  }, [orgLoading, org?.id, userId]) // eslint-disable-line

  // ── Zamanlayıcı ──
  useEffect(() => {
    if (view === 'room' && activeMeeting) {
      const start = new Date(activeMeeting.start_time).getTime()
      const now   = Date.now()
      setElapsed(Math.max(0, Math.floor((now - start) / 1000)))
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
    } else {
      clearInterval(timerRef.current)
      setElapsed(0)
    }
    return () => clearInterval(timerRef.current)
  }, [view, activeMeeting])

  // ── Not otomatik kayıt (30s debounce) ──
  useEffect(() => {
    if (!activeMeeting) return
    clearTimeout(noteSaveTimer.current)
    noteSaveTimer.current = setTimeout(async () => {
      if (!org) return
      setNoteSaving(true)
      const { data: { session } } = await supabase.auth.getSession()
      await fetch(`/api/org/${org.slug}/meetings/${activeMeeting.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ notes }),
      })
      setNoteSaving(false)
      setNoteSaved(true)
      setTimeout(() => setNoteSaved(false), 2000)
    }, 30_000)
    return () => clearTimeout(noteSaveTimer.current)
  }, [notes]) // eslint-disable-line

  // ── Toplantıya katıl ──
  function handleJoin(meeting: MeetingWithAttendees) {
    setActiveMeeting(meeting)
    setNotes(meeting.notes || '')
    setAiResult(null)
    setMeetActive(false)
    setView('room')
  }

  // ── Meet penceresini aç + Notlar popup'ını aç ──
  function handleJoinMeet(meetLink: string) {
    if (!activeMeeting || !org) return
    const sw = window.screen.availWidth
    const sh = window.screen.availHeight
    const meetW  = Math.floor(sw * 0.7)
    const notesW = sw - meetW

    window.open(
      meetLink,
      'googleMeet',
      `width=${meetW},height=${sh},left=0,top=0,toolbar=0,menubar=0,scrollbars=0`
    )

    const notesUrl = `${window.location.origin}/org/${org.slug}/meetings?notesOnly=${activeMeeting.id}`
    window.open(
      notesUrl,
      'tarlisNotes',
      `width=${notesW},height=${sh},left=${meetW},top=0,toolbar=0,menubar=0,scrollbars=1`
    )

    setMeetActive(true)
  }

  // ── Not manuel kaydet ──
  async function saveNotes() {
    if (!activeMeeting || !org) return
    clearTimeout(noteSaveTimer.current)
    setNoteSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    await fetch(`/api/org/${org.slug}/meetings/${activeMeeting.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify({ notes }),
    })
    setNoteSaving(false)
    setNoteSaved(true)
    setTimeout(() => setNoteSaved(false), 2000)
  }

  // ── AI Özet ──
  async function handleAiSummary() {
    if (!notes.trim() || !org) return
    setAiLoading(true)
    setAiResult(null)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/ai-tasks/meeting-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify({ orgId: org.id, notes }),
    })
    const data = await res.json()
    setAiLoading(false)
    if (data.error) { showToast(data.error, 'err'); return }
    setAiResult(data)
  }

  // ── Jitsi oda adı üret ──
  function generateJitsiRoom(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
    const rand = Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    return `tarlis-${rand}`
  }

  // ── Toplantı oluştur ──
  async function handleCreateMeeting(e: React.FormEvent) {
    e.preventDefault()
    if (!org || !userId) return
    const { title, description, date, startTime, endTime, attendeeIds, meetType, manualMeetLink, jitsiRoomName, isInstant } = createForm
    if (!title.trim()) { setCreateError('Başlık zorunlu'); return }
    if (!isInstant && !date) { setCreateError('Tarih zorunlu'); return }
    if (meetType === 'gcal' && !gcalConnected) { setCreateError('Google Meet için önce Google hesabınızı bağlayın (sağ üstteki "Google Bağla" butonu).'); return }

    setCreating(true)
    setCreateError(null)
    const { data: { session } } = await supabase.auth.getSession()

    const nowDate = new Date()
    const start_time = isInstant ? nowDate.toISOString() : new Date(`${date}T${startTime}:00`).toISOString()
    const end_time   = isInstant ? new Date(nowDate.getTime() + 60 * 60 * 1000).toISOString() : new Date(`${date}T${endTime}:00`).toISOString()

    // Meet linki belirle
    let manual_meet_link: string | null = null
    let useGcal = false
    if (meetType === 'jitsi') {
      const room = jitsiRoomName || generateJitsiRoom()
      manual_meet_link = `https://meet.jit.si/${room}`
    } else if (meetType === 'gcal') {
      useGcal = true
    } else if (meetType === 'none' && manualMeetLink.trim()) {
      manual_meet_link = manualMeetLink.trim()
    }

    const res = await fetch(`/api/org/${org.slug}/meetings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify({
        title: title.trim(), description: description.trim() || null,
        start_time, end_time, attendee_ids: attendeeIds,
        useGcal, manual_meet_link, meet_type: meetType,
      }),
    })
    const data = await res.json()
    setCreating(false)
    if (!res.ok) { setCreateError(data.error || 'Hata oluştu'); return }

    showToast('Toplantı oluşturuldu!')
    setShowCreate(false)
    setCreateForm({ title: '', description: '', date: '', startTime: '10:00', endTime: '11:00', attendeeIds: [], meetType: 'jitsi', manualMeetLink: '', jitsiRoomName: '', isInstant: false })
    loadMeetings()
  }

  // ── Anlık toplantı başlat ──
  const [startingInstant, setStartingInstant] = useState(false)
  async function handleInstantMeeting() {
    if (!org || !userId) return
    setStartingInstant(true)
    const { data: { session } } = await supabase.auth.getSession()
    const now2 = new Date()
    const end2  = new Date(now2.getTime() + 60 * 60 * 1000)
    const jitsiRoom = generateJitsiRoom()
    const res = await fetch(`/api/org/${org.slug}/meetings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify({
        title: 'Anlık Toplantı',
        description: null,
        start_time: now2.toISOString(),
        end_time: end2.toISOString(),
        attendee_ids: [],
        useGcal: false,
        manual_meet_link: `https://meet.jit.si/${jitsiRoom}`,
      }),
    })
    const data = await res.json()
    setStartingInstant(false)
    if (!res.ok) { showToast(data.error || 'Hata oluştu', 'err'); return }
    showToast('Anlık toplantı başlatıldı!')
    await loadMeetings()
    handleJoin(data.meeting)
  }

  // ── Google bağla ──
  function handleConnectGcal() {
    if (!userId || !org) return
    document.cookie = `gcal_return_to=/org/${org.slug}/meetings; path=/; max-age=1800`
    window.location.href = `/api/gcal/auth?userId=${userId}&orgId=${org.id}&slug=${org.slug}`
  }

  // ── Linksiz toplantıya Jitsi link ekle ──
  async function handleAddJitsiLink(meetingId: string) {
    if (!org) return
    const { data: { session } } = await supabase.auth.getSession()
    const rand = Array.from({ length: 10 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('')
    const link = `https://meet.jit.si/tarlis-${rand}`
    const res = await fetch(`/api/org/${org.slug}/meetings/${meetingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ google_meet_link: link }),
    })
    if (res.ok) {
      const data = await res.json()
      setUpcomingMeetings(ms => ms.map(m => m.id === meetingId ? { ...m, ...data.meeting } : m))
      setPastMeetings(ms => ms.map(m => m.id === meetingId ? { ...m, ...data.meeting } : m))
      if (activeMeeting?.id === meetingId) setActiveMeeting(a => a ? { ...a, google_meet_link: link } : a)
      showToast('Jitsi linki eklendi!')
    } else {
      showToast('Eklenemedi', 'err')
    }
  }

  // ── Toplantı sil ──
  async function handleDelete(meetingId: string) {
    if (!org) return
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`/api/org/${org.slug}/meetings/${meetingId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })
    if (res.ok) {
      setUpcomingMeetings(ms => ms.filter(m => m.id !== meetingId))
      setPastMeetings(ms => ms.filter(m => m.id !== meetingId))
      setConfirmDelete(null)
      setDetailMeeting(null)
      showToast('Toplantı silindi')
    } else {
      showToast('Silinemedi', 'err')
    }
  }

  // ── Loading ──
  if (orgLoading || loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f0f4f8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #e5e7eb', borderTopColor: '#2288c9', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  // ── notesOnly modu ────────────────────────────────────────────────────────────
  if (notesOnlyId && activeMeeting && view === 'room' && meetActive) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', flexDirection: 'column' }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeMeeting.title}</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {noteSaved && <span style={{ fontSize: 11, color: '#4ade80', display: 'flex', alignItems: 'center', gap: 3 }}><Check size={11} /> Kaydedildi</span>}
            {noteSaving && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Kaydediliyor...</span>}
            <button onClick={saveNotes} style={{ fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 8, background: 'linear-gradient(135deg, #2288c9, #2abbd5)', color: '#fff', border: 'none', cursor: 'pointer' }}>
              Kaydet
            </button>
          </div>
        </div>

        {/* Textarea */}
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Notlarını buraya ekle..."
          style={{ flex: 1, padding: '20px 24px', border: 'none', outline: 'none', resize: 'none', fontSize: 14, lineHeight: 1.8, color: '#e2e8f0', fontFamily: 'inherit', background: '#0f172a', minHeight: 0 }}
        />

        {/* AI Özet */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
          <button onClick={handleAiSummary} disabled={!notes.trim() || aiLoading}
            style={{ width: '100%', padding: '10px', borderRadius: 10, border: 'none', cursor: notes.trim() ? 'pointer' : 'not-allowed', background: notes.trim() ? 'linear-gradient(135deg, #1d4ed8, #2563eb)' : 'rgba(255,255,255,0.06)', color: notes.trim() ? '#fff' : 'rgba(255,255,255,0.3)', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            {aiLoading ? <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Özet hazırlanıyor...</> : <><Sparkles size={14} /> AI ile Özetle</>}
          </button>
          {aiResult && (
            <div style={{ marginTop: 12, padding: '12px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              {aiResult.summary && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>{aiResult.summary}</div>}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Oda Görünümü ──────────────────────────────────────────────────────────────
  if (view === 'room' && activeMeeting) {
    const meetLink = activeMeeting.google_meet_link

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: isMobile ? '100%' : '100vh', background: '#0f172a', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: isMobile ? '10px 14px' : '12px 20px', background: '#0f172a', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
          <button onClick={() => { setView('list'); setMeetActive(false) }} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: isMobile ? '6px 10px' : '6px 12px', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, flexShrink: 0 }}>
            <ChevronLeft size={14} /> {!isMobile && 'Toplantılar'}
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: isMobile ? 13 : 15, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeMeeting.title}</div>
            {!isMobile && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>{fmtDate(activeMeeting.start_time)} · {fmtTime(activeMeeting.start_time)}–{fmtTime(activeMeeting.end_time)}</div>}
          </div>
          <div style={{ fontSize: isMobile ? 12 : 13, fontWeight: 700, color: '#7ae3f5', background: 'rgba(42,187,213,0.12)', padding: '4px 8px', borderRadius: 8, border: '1px solid rgba(42,187,213,0.2)', fontFamily: 'monospace', flexShrink: 0 }}>
            ⏱ {fmtElapsed(elapsed)}
          </div>
          {meetActive && !isMobile && (
            <button onClick={() => setMeetActive(false)} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '6px 12px', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 12, flexShrink: 0 }}>
              ← Panele Dön
            </button>
          )}
        </div>

        {/* Mobil Tab Bar */}
        {isMobile && (
          <div style={{ display: 'flex', background: '#1e293b', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
            {(['meet', 'notes'] as const).map(tab => (
              <button key={tab} onClick={() => setMobileRoomTab(tab)}
                style={{ flex: 1, padding: '11px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: 'none', color: mobileRoomTab === tab ? '#2abbd5' : 'rgba(255,255,255,0.4)', borderBottom: `2px solid ${mobileRoomTab === tab ? '#2abbd5' : 'transparent'}`, transition: 'all 0.15s' }}>
                {tab === 'meet' ? '🎥 Toplantı' : '📝 Notlar'}
              </button>
            ))}
          </div>
        )}

        {/* 70/30 Split */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'row', overflow: 'hidden' }}>

          {/* Sol: %70 — Eşlik paneli */}
          <div style={{ flex: meetActive ? 0 : 7, display: isMobile ? (mobileRoomTab === 'meet' ? 'flex' : 'none') : (meetActive ? 'none' : 'flex'), flexDirection: 'column', background: '#0f172a', overflow: 'hidden', width: isMobile ? '100%' : undefined }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '20px 16px' : '32px', gap: isMobile ? 16 : 24, overflow: 'auto' }}>
                {/* Meet kartı */}
                <div style={{ width: '100%', maxWidth: 500, background: 'linear-gradient(135deg, #1e3a5f, #0f2744)', borderRadius: isMobile ? 18 : 24, padding: isMobile ? '20px' : '36px', border: '1px solid rgba(42,187,213,0.2)', boxShadow: '0 8px 40px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: isMobile ? 14 : 20, textAlign: 'center' }}>
                  <div style={{ width: isMobile ? 48 : 64, height: isMobile ? 48 : 64, borderRadius: 16, background: 'linear-gradient(135deg, #2288c9, #2abbd5)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 20px rgba(34,136,201,0.4)' }}>
                    <Video size={isMobile ? 22 : 28} color="#fff" />
                  </div>
                  <div>
                    <div style={{ fontSize: isMobile ? 16 : 22, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>{activeMeeting.title}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>{fmtTime(activeMeeting.start_time)} – {fmtTime(activeMeeting.end_time)}</div>
                  </div>
                  {meetLink ? (
                    <>
                      <button onClick={() => { handleJoinMeet(meetLink); if (isMobile) setMobileRoomTab('notes') }}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: isMobile ? '12px 20px' : '14px 28px', borderRadius: 14, background: meetActive ? 'linear-gradient(135deg, #16a34a, #22c55e)' : 'linear-gradient(135deg, #2288c9, #2abbd5)', color: '#fff', fontWeight: 700, fontSize: isMobile ? 14 : 16, border: 'none', cursor: 'pointer', boxShadow: '0 4px 20px rgba(34,136,201,0.4)', width: '100%', justifyContent: 'center' }}>
                        <Video size={18} /> {meetActive ? '↗ Tekrar Aç' : 'Toplantıya Katıl ↗'}
                      </button>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                        <Link2 size={11} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: isMobile ? 180 : 260 }}>{meetLink}</span>
                        <button onClick={() => { navigator.clipboard.writeText(meetLink); showToast('Link kopyalandı!') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: 2, flexShrink: 0 }}>
                          <Copy size={11} />
                        </button>
                      </div>
                    </>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', alignItems: 'center' }}>
                      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', padding: '10px 20px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', width: '100%', textAlign: 'center' }}>
                        Yüz yüze toplantı
                      </div>
                      <button onClick={() => handleAddJitsiLink(activeMeeting.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 12, border: '1.5px dashed rgba(42,187,213,0.5)', background: 'rgba(42,187,213,0.08)', color: '#2abbd5', fontWeight: 700, fontSize: 13, cursor: 'pointer', width: '100%', justifyContent: 'center' }}>
                        🎥 Jitsi Linki Ekle
                      </button>
                    </div>
                  )}
                </div>

                {/* Katılımcılar */}
                {activeMeeting.attendees.length > 0 && (
                  <div style={{ width: '100%', maxWidth: 500, background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: '14px 18px', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                      Katılımcılar · {activeMeeting.attendees.length} kişi
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {activeMeeting.attendees.map(a => (
                        <div key={a.user_id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Avatar name={a.full_name || a.email || '?'} url={a.avatar_url} size={26} />
                          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{a.full_name || a.email?.split('@')[0] || '—'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Açıklama/Gündem */}
                {activeMeeting.description && (
                  <div style={{ width: '100%', maxWidth: 500, background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: '14px 18px', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Gündem</div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{activeMeeting.description}</div>
                  </div>
                )}
              </div>
          </div>

          {/* Sağ: Not Paneli */}
          <div style={{ flex: meetActive ? 1 : (isMobile ? 1 : 3), display: isMobile ? (mobileRoomTab === 'notes' ? 'flex' : 'none') : 'flex', flexDirection: 'column', background: '#fff', borderLeft: (!isMobile && !meetActive) ? '1px solid #e5e7eb' : 'none', overflow: 'hidden', width: isMobile ? '100%' : undefined }}>

            {/* Not başlığı */}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>📝 Toplantı Notları</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {noteSaved && <span style={{ fontSize: 11, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 3 }}><Check size={11} /> Kaydedildi</span>}
                {noteSaving && <span style={{ fontSize: 11, color: '#9ca3af' }}>Kaydediliyor...</span>}
                <button onClick={saveNotes} style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 8, background: '#f0f9ff', color: '#2288c9', border: '1px solid #bae6fd', cursor: 'pointer' }}>
                  Kaydet
                </button>
              </div>
            </div>

            {/* Textarea */}
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Notlarını buraya ekle..."
              style={{ flex: 1, padding: '14px 16px', border: 'none', outline: 'none', resize: 'none', fontSize: 13, lineHeight: 1.7, color: '#374151', fontFamily: 'inherit', background: '#fafbfc' }}
            />

            {/* AI Özet butonu */}
            <div style={{ padding: '12px 16px', borderTop: '1px solid #f3f4f6', flexShrink: 0 }}>
              <button onClick={handleAiSummary} disabled={!notes.trim() || aiLoading}
                style={{ width: '100%', padding: '10px', borderRadius: 10, border: 'none', cursor: notes.trim() ? 'pointer' : 'not-allowed', background: notes.trim() ? 'linear-gradient(135deg, #1d4ed8, #2563eb)' : '#f1f5f9', color: notes.trim() ? '#fff' : '#9ca3af', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                {aiLoading ? <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Özet hazırlanıyor...</> : <><Sparkles size={14} /> AI ile Özetle</>}
              </button>
              <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            </div>

            {/* AI Sonucu */}
            {aiResult && (
              <div style={{ maxHeight: 280, overflowY: 'auto', padding: '12px 16px', borderTop: '1px solid #e5e7eb', background: '#f8fafc' }}>
                {aiResult.summary && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Özet</div>
                    <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.6 }}>{aiResult.summary}</div>
                  </div>
                )}
                {aiResult.key_topics?.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Konular</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {aiResult.key_topics.map((t, i) => (
                        <span key={i} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: '#dbeafe', color: '#1e40af', fontWeight: 500 }}>{t}</span>
                      ))}
                    </div>
                  </div>
                )}
                {aiResult.decisions?.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Kararlar</div>
                    {aiResult.decisions.map((d, i) => (
                      <div key={i} style={{ fontSize: 12, color: '#374151', display: 'flex', gap: 6, marginBottom: 3 }}><span style={{ color: '#16a34a' }}>✓</span>{d}</div>
                    ))}
                  </div>
                )}
                {aiResult.action_items?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Aksiyonlar</div>
                    {aiResult.action_items.map((a, i) => (
                      <div key={i} style={{ fontSize: 12, color: '#374151', display: 'flex', gap: 6, marginBottom: 3 }}>
                        <span style={{ color: '#f59e0b' }}>→</span>
                        <span>{a.item}{a.owner ? ` · ${a.owner}` : ''}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 99, padding: '12px 18px', borderRadius: 12, background: toast.type === 'ok' ? '#166534' : '#991b1b', color: '#fff', fontSize: 13, fontWeight: 600, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
            {toast.msg}
          </div>
        )}
      </div>
    )
  }

  // ── Liste Görünümü ────────────────────────────────────────────────────────────
  const now = new Date()
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const thisWeekCount      = upcomingMeetings.filter(m => new Date(m.start_time) <= weekFromNow).length
  const thisWeekMeetCount  = upcomingMeetings.filter(m => new Date(m.start_time) <= weekFromNow && !!m.google_meet_link).length
  const thisWeekFaceCount  = upcomingMeetings.filter(m => new Date(m.start_time) <= weekFromNow && !m.google_meet_link).length

  const displayedMeetings = activeTab === 'upcoming' ? upcomingMeetings : pastMeetings

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
        @keyframes slideInRight { from { transform:translateX(100%) } to { transform:translateX(0) } }
        .meet-card { animation: fadeUp 0.2s cubic-bezier(0.16,1,0.3,1) both; transition: box-shadow 0.15s, transform 0.15s; }
        .meet-card:hover { box-shadow: 0 4px 20px rgba(15,23,42,0.12) !important; transform: translateY(-1px); }
        .icon-btn { transition: background 0.15s, transform 0.1s; }
        .icon-btn:hover { transform: scale(1.05); }
      `}</style>

      <div style={{ maxWidth: 840, margin: '0 auto', padding: isMobile ? '14px 14px 80px' : '28px 24px 48px' }}>

        {/* ── Başlık ── */}
        <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', marginBottom: isMobile ? 16 : 24, flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 12 : 0 }}>
          <div>
            <h1 style={{ fontSize: isMobile ? 20 : 24, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: isMobile ? 32 : 36, height: isMobile ? 32 : 36, borderRadius: 12, background: 'linear-gradient(135deg, #2288c9, #2abbd5)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Video size={isMobile ? 16 : 18} color="#fff" />
              </div>
              Toplantılar
            </h1>
            <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0', paddingLeft: isMobile ? 44 : 48 }}>{org?.name}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', width: isMobile ? '100%' : 'auto' }}>
            {!gcalConnected ? (
              <button onClick={handleConnectGcal}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 10, border: '1.5px solid #e5e7eb', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer', flex: isMobile ? 1 : 'none' }}>
                <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Google Bağla
              </button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#16a34a', background: '#f0fdf4', padding: '7px 12px', borderRadius: 10, border: '1px solid #bbf7d0' }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#16a34a' }} />
                Google Bağlı
              </div>
            )}
            <button onClick={() => setShowCreate(true)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '9px 18px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #2288c9, #2abbd5)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 12px rgba(34,136,201,0.35)', flex: isMobile ? 1 : 'none' }}>
              <Plus size={16} /> Toplantı Oluştur
            </button>
          </div>
        </div>

        {/* ── İstatistik Kartları ── */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? 10 : 12, marginBottom: 24 }}>
          {[
            { label: 'Bu Hafta',         value: thisWeekCount,     color: '#2288c9', bg: '#eff6ff',  icon: <Calendar size={18} color="#2288c9" /> },
            { label: 'Canlı Görüşme',    value: thisWeekMeetCount, color: '#0f766e', bg: '#f0fdfa',  icon: <Video size={18} color="#0f766e" /> },
            { label: 'Yüz Yüze',         value: thisWeekFaceCount, color: '#7c3aed', bg: '#f5f3ff',  icon: <Users size={18} color="#7c3aed" /> },
            { label: 'Geçmiş',           value: pastMeetings.length, color: '#64748b', bg: '#f8fafc', icon: <Clock size={18} color="#64748b" /> },
          ].map(stat => (
            <div key={stat.label} style={{ background: '#fff', borderRadius: 18, border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', padding: isMobile ? '14px' : '18px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: stat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {stat.icon}
              </div>
              <div style={{ fontSize: isMobile ? 22 : 28, fontWeight: 800, color: stat.color, lineHeight: 1 }}>{stat.value}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* ── Filtre Sekmeleri ── */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, background: '#e5e7eb', borderRadius: 12, padding: 4, width: 'fit-content' }}>
          {(['upcoming', 'past'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{ padding: '7px 20px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, transition: 'all 0.15s', background: activeTab === tab ? '#2288c9' : 'transparent', color: activeTab === tab ? '#fff' : '#64748b', boxShadow: activeTab === tab ? '0 2px 8px rgba(34,136,201,0.3)' : 'none' }}>
              {tab === 'upcoming' ? 'Yaklaşan' : 'Geçmiş'}
            </button>
          ))}
        </div>

        {/* ── Toplantı Listesi ── */}
        {displayedMeetings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '56px 24px', background: '#fff', borderRadius: 20, border: '1.5px dashed #e5e7eb' }}>
            <div style={{ fontSize: 52, marginBottom: 14 }}>{activeTab === 'upcoming' ? '🎥' : '📋'}</div>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#374151', margin: '0 0 6px' }}>
              {activeTab === 'upcoming' ? 'Yaklaşan toplantı yok' : 'Geçmiş toplantı yok'}
            </p>
            <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>
              {activeTab === 'upcoming'
                ? '"Toplantı Oluştur" ile yeni bir toplantı ekle'
                : 'Tamamlanan toplantılar burada görünecek'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {displayedMeetings.map(m => {
              const mStart = new Date(m.start_time)
              const mEnd   = new Date(m.end_time)
              const isActive = now >= mStart && now <= mEnd
              const isPast   = activeTab === 'past' || now > mEnd
              const hasMeetLink = !!m.google_meet_link

              const accentColor = isPast ? '#94a3b8' : isActive ? '#16a34a' : '#2288c9'
              const barColor    = isPast ? '#e5e7eb' : isActive ? '#22c55e' : '#2288c9'
              const borderColor = isPast ? '#e5e7eb' : isActive ? '#bbf7d0' : '#dbeafe'

              return (
                <div key={m.id} className="meet-card" style={{ background: '#fff', borderRadius: 16, border: `1px solid ${borderColor}`, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', display: 'flex', overflow: 'hidden', position: 'relative' }}>
                  {/* Left color bar */}
                  <div style={{ width: 4, background: barColor, flexShrink: 0 }} />

                  <div style={{ flex: 1, padding: isMobile ? '12px 12px 12px 14px' : '16px 18px 16px 20px', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      {/* Icon */}
                      <div style={{ width: isMobile ? 38 : 44, height: isMobile ? 38 : 44, borderRadius: 12, background: isPast ? '#f1f5f9' : isActive ? '#dcfce7' : '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Video size={isMobile ? 17 : 20} color={accentColor} />
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Title row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
                          <div style={{ fontSize: isMobile ? 14 : 15, fontWeight: 700, color: isPast ? '#94a3b8' : '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: isMobile ? 140 : 300 }}>
                            {m.title}
                          </div>
                          {isActive && !isPast && (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: '#dcfce7', color: '#16a34a', border: '1px solid #bbf7d0', whiteSpace: 'nowrap' }}>🟢 Aktif</span>
                          )}
                          {!isActive && !isPast && (
                            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, background: '#eff6ff', color: '#2288c9', border: '1px solid #bfdbfe', whiteSpace: 'nowrap' }}>📅 Planlandı</span>
                          )}
                          {isPast && (
                            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, background: '#f8fafc', color: '#94a3b8', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>✓ Bitti</span>
                          )}
                          {hasMeetLink && (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', whiteSpace: 'nowrap' }}>● Meet</span>
                          )}
                        </div>

                        {/* Date + time */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#64748b', marginBottom: isMobile ? 8 : 10 }}>
                          <Clock size={11} />
                          {isPast ? `${fmtShortDate(m.start_time)} · ` : ''}{fmtTime(m.start_time)} – {fmtTime(m.end_time)}
                        </div>

                        {/* Attendees + actions row */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          {/* Attendee avatars */}
                          {m.attendees.length > 0 ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <div style={{ display: 'flex' }}>
                                {m.attendees.slice(0, isMobile ? 3 : 5).map((a, i) => (
                                  <div key={a.user_id} style={{ marginLeft: i > 0 ? -8 : 0, zIndex: 5 - i }}>
                                    <Avatar name={a.full_name || a.email || '?'} url={a.avatar_url} size={24} />
                                  </div>
                                ))}
                                {m.attendees.length > (isMobile ? 3 : 5) && (
                                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#6b7280', marginLeft: -8, border: '2px solid #fff' }}>
                                    +{m.attendees.length - (isMobile ? 3 : 5)}
                                  </div>
                                )}
                              </div>
                              {!isMobile && <span style={{ fontSize: 11, color: '#9ca3af' }}>{m.attendees.length} kişi</span>}
                            </div>
                          ) : <div />}

                          {/* Action buttons */}
                          <div style={{ display: 'flex', gap: 5, flexShrink: 0, alignItems: 'center' }}>
                            <button className="icon-btn" onClick={() => setDetailMeeting(m)} title="Detaylar"
                              style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid #e5e7eb', background: '#f8fafc', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Eye size={14} />
                            </button>
                            {!m.google_meet_link && !isPast && (
                              <button className="icon-btn" onClick={() => handleAddJitsiLink(m.id)} title="Jitsi link ekle"
                                style={{ height: 32, padding: '0 10px', borderRadius: 9, border: '1.5px dashed #0f766e', background: '#f0fdfa', color: '#0f766e', cursor: 'pointer', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                                🎥 +Link
                              </button>
                            )}
                            <button className="icon-btn" onClick={() => handleJoin(m)} title={isPast ? 'Notlar' : isActive ? 'Katıl' : 'Başlat'}
                              style={{ height: 32, padding: isMobile ? '0 10px' : '0 14px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: isPast ? '#f1f5f9' : isActive ? '#16a34a' : 'linear-gradient(135deg, #2288c9, #2abbd5)', color: isPast ? '#64748b' : '#fff', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', boxShadow: isPast ? 'none' : '0 2px 8px rgba(34,136,201,0.2)' }}>
                              <Video size={13} />
                              {isPast ? 'Notlar' : isActive ? 'Katıl' : 'Başlat'}
                            </button>
                            <button className="icon-btn" onClick={() => setConfirmDelete(m)} title="Sil"
                              style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid #fecaca', background: '#fff5f5', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Detay Drawer ── */}
      {detailMeeting && (
        <>
          {/* Overlay */}
          <div onClick={() => setDetailMeeting(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.4)' }} />
          {/* Panel */}
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 61, width: isMobile ? '100%' : 420, background: '#fff', boxShadow: '-8px 0 40px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', animation: 'slideInRight 0.25s cubic-bezier(0.16,1,0.3,1)' }}>
            {/* Header */}
            <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', marginBottom: 6, lineHeight: 1.3 }}>{detailMeeting.title}</div>
                  <div style={{ fontSize: 13, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Clock size={13} />
                    {fmtDate(detailMeeting.start_time)} · {fmtTime(detailMeeting.start_time)} – {fmtTime(detailMeeting.end_time)}
                  </div>
                </div>
                <button onClick={() => setDetailMeeting(null)}
                  style={{ background: '#f3f4f6', border: 'none', borderRadius: 10, width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', flexShrink: 0 }}>
                  <X size={18} />
                </button>
              </div>
              {/* Status badge */}
              <div style={{ marginTop: 10 }}>
                {(() => {
                  const ds = new Date(detailMeeting.start_time)
                  const de = new Date(detailMeeting.end_time)
                  const isAct = now >= ds && now <= de
                  const isPst = now > de
                  if (isAct) return <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: '#dcfce7', color: '#16a34a', border: '1px solid #bbf7d0' }}>🟢 Aktif</span>
                  if (isPst) return <span style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 20, background: '#f8fafc', color: '#94a3b8', border: '1px solid #e5e7eb' }}>✓ Tamamlandı</span>
                  return <span style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 20, background: '#eff6ff', color: '#2288c9', border: '1px solid #bfdbfe' }}>📅 Planlandı</span>
                })()}
              </div>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

              {/* Katılımcılar */}
              {detailMeeting.attendees.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>Katılımcılar</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {detailMeeting.attendees.map(a => (
                      <div key={a.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar name={a.full_name || a.email || '?'} url={a.avatar_url} size={36} />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{a.full_name || a.email?.split('@')[0] || '—'}</div>
                          {a.email && <div style={{ fontSize: 11, color: '#9ca3af' }}>{a.email}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Gündem */}
              {detailMeeting.description && (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Gündem</div>
                  <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, whiteSpace: 'pre-wrap', padding: '12px 14px', background: '#f8fafc', borderRadius: 10, border: '1px solid #f3f4f6' }}>
                    {detailMeeting.description}
                  </div>
                </div>
              )}

              {/* Meet Linki */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Meet Linki</div>
                {detailMeeting.google_meet_link ? (
                  <a href={detailMeeting.google_meet_link} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 12, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
                    <Video size={18} color="#16a34a" />
                    Google Meet&apos;e Katıl ↗
                  </a>
                ) : (
                  <div style={{ padding: '12px 16px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e5e7eb', fontSize: 13, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Users size={14} />
                    Yüz yüze toplantı
                  </div>
                )}
              </div>

              {/* Notlar önizleme */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Notlar</div>
                {detailMeeting.notes ? (
                  <div style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: 10, border: '1px solid #f3f4f6', fontSize: 12, color: '#64748b', lineHeight: 1.7, whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'hidden', position: 'relative' }}>
                    {detailMeeting.notes.slice(-200)}
                    {detailMeeting.notes.length > 200 && (
                      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 32, background: 'linear-gradient(transparent, #f8fafc)' }} />
                    )}
                  </div>
                ) : (
                  <div style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: 10, border: '1px solid #f3f4f6', fontSize: 12, color: '#d1d5db', fontStyle: 'italic' }}>
                    Henüz not eklenmemiş
                  </div>
                )}
                <button onClick={() => { handleJoin(detailMeeting); setDetailMeeting(null) }}
                  style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: '#2288c9', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                  Notları Düzenle →
                </button>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 20px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 10, flexShrink: 0 }}>
              <button onClick={() => setConfirmDelete(detailMeeting)}
                style={{ flex: 1, padding: '11px', borderRadius: 10, border: '1.5px solid #fecaca', background: '#fff5f5', color: '#ef4444', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Trash2 size={15} /> Toplantıyı Sil
              </button>
              <button onClick={() => setDetailMeeting(null)}
                style={{ flex: 1, padding: '11px', borderRadius: 10, border: '1.5px solid #e5e7eb', background: '#f8fafc', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Kapat
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Silme Onay Modalı ── */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setConfirmDelete(null) }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: '28px 28px 24px', maxWidth: 380, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', animation: 'fadeUp 0.2s cubic-bezier(0.16,1,0.3,1)' }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: '#fff5f5', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Trash2 size={24} color="#ef4444" />
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>Toplantıyı Sil</div>
            <div style={{ fontSize: 14, color: '#64748b', marginBottom: 6 }}>Bu toplantıyı silmek istediğine emin misin?</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', padding: '10px 14px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e5e7eb', marginBottom: 20 }}>
              {confirmDelete.title}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmDelete(null)}
                style={{ flex: 1, padding: '11px', borderRadius: 10, border: '1.5px solid #e5e7eb', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                İptal
              </button>
              <button onClick={() => handleDelete(confirmDelete.id)}
                style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #dc2626, #ef4444)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Trash2 size={14} /> Evet, Sil
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toplantı Oluştur Modalı ── */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowCreate(false) }}>
          <div style={{ width: '100%', maxWidth: isMobile ? '100%' : 520, background: '#fff', borderRadius: isMobile ? '20px 20px 0 0' : 20, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.25)', maxHeight: isMobile ? '90vh' : '85vh', display: 'flex', flexDirection: 'column' }}>
            {isMobile && <div style={{ width: 36, height: 4, borderRadius: 2, background: '#e5e7eb', margin: '12px auto 0' }} />}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isMobile ? '14px 20px' : '20px 24px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Video size={18} color="#2288c9" /> Yeni Toplantı
              </div>
              <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}><X size={18} /></button>
            </div>

            <form onSubmit={handleCreateMeeting} style={{ overflowY: 'auto', padding: isMobile ? '16px 20px 32px' : '20px 24px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Başlık */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Başlık *</label>
                <input type="text" required placeholder="Toplantı başlığı" value={createForm.title}
                  onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                  onFocus={e => (e.target.style.borderColor = '#2288c9')}
                  onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
                />
              </div>

              {/* Tarih + Saat */}
              {!createForm.isInstant && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div style={{ gridColumn: '1' }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Tarih *</label>
                  <input type="date" value={createForm.date}
                    onChange={e => setCreateForm(f => ({ ...f, date: e.target.value }))}
                    style={{ width: '100%', padding: '9px 10px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                    onFocus={e => (e.target.style.borderColor = '#2288c9')}
                    onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Başlangıç</label>
                  <input type="time" value={createForm.startTime}
                    onChange={e => setCreateForm(f => ({ ...f, startTime: e.target.value }))}
                    style={{ width: '100%', padding: '9px 10px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Bitiş</label>
                  <input type="time" value={createForm.endTime}
                    onChange={e => setCreateForm(f => ({ ...f, endTime: e.target.value }))}
                    style={{ width: '100%', padding: '9px 10px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
              )}

              {/* Anlık Başlat Checkbox */}
              <button type="button" onClick={() => setCreateForm(f => ({ ...f, isInstant: !f.isInstant }))}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, border: `1.5px solid ${createForm.isInstant ? '#f59e0b' : '#e5e7eb'}`, background: createForm.isInstant ? '#fffbeb' : '#fafafa', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${createForm.isInstant ? '#f59e0b' : '#d1d5db'}`, background: createForm.isInstant ? '#f59e0b' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
                  {createForm.isInstant && <Check size={11} color="#fff" strokeWidth={3} />}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: createForm.isInstant ? '#92400e' : '#374151' }}>
                    <Zap size={13} style={{ display: 'inline', marginRight: 4 }} color={createForm.isInstant ? '#f59e0b' : '#9ca3af'} />
                    Anlık başlat
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>Tarih ve saat seçmeden şu an başlat</div>
                </div>
              </button>

              {/* Açıklama */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Açıklama</label>
                <textarea rows={3} placeholder="Gündem, notlar..." value={createForm.description}
                  onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, boxSizing: 'border-box' }}
                  onFocus={e => (e.target.style.borderColor = '#2288c9')}
                  onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
                />
              </div>

              {/* Katılımcılar */}
              {orgMembers.length > 0 && (
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 8 }}>
                    <Users size={11} style={{ display: 'inline', marginRight: 4 }} />
                    Katılımcılar
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {orgMembers.map(m => {
                      const selected = createForm.attendeeIds.includes(m.id)
                      return (
                        <button type="button" key={m.id}
                          onClick={() => setCreateForm(f => ({
                            ...f,
                            attendeeIds: selected ? f.attendeeIds.filter(id => id !== m.id) : [...f.attendeeIds, m.id],
                          }))}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 20, border: `1.5px solid ${selected ? '#2288c9' : '#e5e7eb'}`, background: selected ? '#eff6ff' : '#f9fafb', cursor: 'pointer', fontSize: 12, fontWeight: selected ? 600 : 400, color: selected ? '#2288c9' : '#374151' }}>
                          <Avatar name={m.name} url={m.avatar} size={20} />
                          {m.name}
                          {selected && <Check size={11} />}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Görüşme Türü */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 8 }}>Görüşme Türü</label>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(3, 1fr)', gap: isMobile ? 6 : 8 }}>
                  {([
                    { key: 'jitsi', icon: '🎥', label: 'Jitsi Meet', sub: 'Ücretsiz video görüşme', color: '#0f766e', bg: '#f0fdfa', border: '#99f6e4' },
                    { key: 'gcal',  icon: '📅', label: 'Google Meet', sub: gcalConnected ? 'Takvime eklenecek' : 'Google hesabı gerekli', color: '#1d4ed8', bg: '#eff6ff', border: '#93c5fd' },
                    { key: 'none',  icon: '👥', label: 'Yüz Yüze', sub: 'Fiziksel buluşma', color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd' },
                  ] as const).map(opt => {
                    const active = createForm.meetType === opt.key
                    const disabled = opt.key === 'gcal' && !gcalConnected
                    return (
                      <button key={opt.key} type="button"
                        onClick={() => !disabled && setCreateForm(f => ({ ...f, meetType: opt.key }))}
                        style={{ padding: '10px 8px', borderRadius: 12, border: `2px solid ${active ? opt.border : '#e5e7eb'}`, background: active ? opt.bg : '#fafafa', cursor: disabled ? 'not-allowed' : 'pointer', textAlign: 'center', opacity: disabled ? 0.5 : 1, transition: 'all 0.15s' }}>
                        <div style={{ fontSize: 20, marginBottom: 4 }}>{opt.icon}</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: active ? opt.color : '#374151' }}>{opt.label}</div>
                        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{opt.sub}</div>
                      </button>
                    )
                  })}
                </div>
                {createForm.meetType === 'gcal' && !gcalConnected && (
                  <p style={{ fontSize: 11, color: '#9ca3af', margin: '6px 0 0' }}>
                    Google hesabı bağlı değil →{' '}
                    <button type="button" onClick={handleConnectGcal} style={{ background: 'none', border: 'none', color: '#2288c9', fontSize: 11, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>Bağla</button>
                  </p>
                )}
                {createForm.meetType === 'jitsi' && (
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: '#f0fdfa', border: '1px solid #99f6e4' }}>
                    <span style={{ fontSize: 11, color: '#0f766e', fontFamily: 'monospace' }}>
                      meet.jit.si/tarlis-••••••••••
                    </span>
                    <span style={{ fontSize: 10, color: '#0f766e', opacity: 0.7 }}>· Toplantı oluşturulunca hazır</span>
                  </div>
                )}
              </div>

              {createError && (
                <div style={{ padding: '10px 14px', borderRadius: 10, background: '#fef2f2', color: '#dc2626', fontSize: 13, border: '1px solid #fecaca' }}>
                  {createError}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button type="button" onClick={() => setShowCreate(false)}
                  style={{ flex: 1, padding: '11px', borderRadius: 10, border: '1.5px solid #e5e7eb', background: '#fff', color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  İptal
                </button>
                <button type="submit" disabled={creating}
                  style={{ flex: 2, padding: '11px', borderRadius: 10, border: 'none', background: creating ? '#f1f5f9' : 'linear-gradient(135deg, #2288c9, #2abbd5)', color: creating ? '#9ca3af' : '#fff', fontSize: 14, fontWeight: 700, cursor: creating ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  {creating ? <><div style={{ width: 14, height: 14, border: '2px solid #d1d5db', borderTopColor: '#2288c9', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />Oluşturuluyor...</> : <><Video size={16} /> Toplantı Oluştur</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 99, padding: '12px 18px', borderRadius: 12, background: toast.type === 'ok' ? '#166534' : '#991b1b', color: '#fff', fontSize: 13, fontWeight: 600, boxShadow: '0 8px 32px rgba(0,0,0,0.25)', animation: 'fadeUp 0.3s ease' }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
