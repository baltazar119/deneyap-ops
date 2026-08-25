'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useOrg } from '@/lib/supabase/orgContext'
import { useIsMobile } from '@/lib/useIsMobile'
import FeatureGate from '@/components/FeatureGate'
import { createNotification } from '@/lib/notifications'
import type {
  UIQuestion, UIQuestionMessage, UIUpdate, UIUpdateComment,
  UIFile, UIFileComment, UIUpdateAttachment,
  UIQuestionCategory, UIQuestionPriority, UIUpdateTag, UIFileType,
  UIAnnotationImage, UIAnnotationPin, UIAnnotationPinReply,
} from '@/types/database'

// ── Yardımcı sabitler ────────────────────────────────────────────────────────

const CATEGORY_OPTIONS: UIQuestionCategory[] = ['UI', 'UX', 'Bug', 'İstek', 'Tasarım', 'Diğer']
const PRIORITY_OPTIONS: { value: UIQuestionPriority; label: string; color: string; bg: string; icon: string }[] = [
  { value: 'critical', label: 'Kritik',  color: '#991b1b', bg: '#fee2e2', icon: '' },
  { value: 'high',     label: 'Yüksek',  color: '#92400e', bg: '#fef3c7', icon: '' },
  { value: 'normal',   label: 'Normal',  color: '#1e40af', bg: '#dbeafe', icon: '' },
  { value: 'low',      label: 'Düşük',   color: '#374151', bg: '#f1f5f9', icon: '' },
]
const TAG_OPTIONS: UIUpdateTag[] = ['UI', 'UX', 'Bugfix', 'Release']
const FILE_TYPE_LABELS: Record<UIFileType, string> = {
  image: 'Görsel', pdf: 'PDF', video: 'Video', link: 'Bağlantı', doc: 'Belge', other: 'Diğer',
}
const TAG_COLORS: Record<UIUpdateTag, { color: string; bg: string }> = {
  UI:      { color: '#1e40af', bg: '#dbeafe' },
  UX:      { color: '#5b21b6', bg: '#ede9fe' },
  Bugfix:  { color: '#991b1b', bg: '#fee2e2' },
  Release: { color: '#166534', bg: '#dcfce7' },
}
const CAT_COLORS: Record<UIQuestionCategory, { color: string; bg: string }> = {
  UI:      { color: '#1e40af', bg: '#dbeafe' },
  UX:      { color: '#5b21b6', bg: '#ede9fe' },
  Bug:     { color: '#991b1b', bg: '#fee2e2' },
  İstek:   { color: '#166534', bg: '#dcfce7' },
  Tasarım: { color: '#92400e', bg: '#fef3c7' },
  Diğer:   { color: '#374151', bg: '#f1f5f9' },
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Az önce'
  if (mins < 60) return `${mins} dk önce`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} sa önce`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days} gün önce`
  return new Date(dateStr).toLocaleDateString('tr-TR')
}

function formatBytes(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Toast ────────────────────────────────────────────────────────────────────

function Toast({ msg, type, onClose }: { msg: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t) }, [onClose])
  return (
    <div
      className="fixed bottom-5 right-5 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium animate-fade-in"
      style={{
        background: type === 'success' ? '#d1fae5' : '#fee2e2',
        color: type === 'success' ? '#065f46' : '#991b1b',
        border: `1px solid ${type === 'success' ? '#6ee7b7' : '#fca5a5'}`,
      }}
    >
      {msg}
    </div>
  )
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`skeleton ${className ?? ''}`} />
}

// ── Ana bileşen ──────────────────────────────────────────────────────────────

type Tab = 'questions' | 'updates' | 'files' | 'annotations'

function ConsultantContent() {
  const router = useRouter()
  const { org, orgRole, userId: ctxUserId, userEmail: ctxEmail, avatarUrl: ctxAvatar, isPro, loading: orgLoading } = useOrg()
  const [userId, setUserId] = useState<string | null>(ctxUserId ?? null)
  const [userEmail, setUserEmail] = useState(ctxEmail ?? '')
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(ctxAvatar ?? null)
  const [userRole, setUserRole] = useState<'admin' | 'consultant'>(orgRole === 'consultant' ? 'consultant' : 'admin')
  const [activeTab, setActiveTab] = useState<Tab>('questions')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const isMobile = useIsMobile()

  // ── Q&A state
  const [questions, setQuestions] = useState<UIQuestion[]>([])
  const [selectedQuestion, setSelectedQuestion] = useState<UIQuestion | null>(null)
  const [messages, setMessages] = useState<UIQuestionMessage[]>([])
  const [msgAuthors, setMsgAuthors] = useState<Record<string, string>>({})
  const [qFilter, setQFilter] = useState<{ cat: string; pri: string; status: string; search: string }>({
    cat: '', pri: '', status: 'open', search: '',
  })
  const [showNewQuestion, setShowNewQuestion] = useState(false)
  const [newQuestion, setNewQuestion] = useState({ title: '', description: '', category: 'UI' as UIQuestionCategory, priority: 'normal' as UIQuestionPriority })
  const [replyText, setReplyText] = useState('')
  const [replyLoading, setReplyLoading] = useState(false)
  const [openQuestionCount, setOpenQuestionCount] = useState(0)

  // ── Updates state
  const [updates, setUpdates] = useState<UIUpdate[]>([])
  const [updateAttachments, setUpdateAttachments] = useState<Record<string, UIUpdateAttachment[]>>({})
  const [selectedUpdate, setSelectedUpdate] = useState<UIUpdate | null>(null)
  const [updateComments, setUpdateComments] = useState<UIUpdateComment[]>([])
  const [updateCommentAuthors, setUpdateCommentAuthors] = useState<Record<string, string>>({})
  const [showNewUpdate, setShowNewUpdate] = useState(false)
  const [newUpdate, setNewUpdate] = useState({ title: '', summary: '', detail: '', tag: 'UI' as UIUpdateTag })
  const [updateCommentText, setUpdateCommentText] = useState('')
  const [updateCommentLoading, setUpdateCommentLoading] = useState(false)

  // ── Files state
  const [files, setFiles] = useState<UIFile[]>([])
  const [fileComments, setFileComments] = useState<Record<string, UIFileComment[]>>({})
  const [fileCommentAuthors, setFileCommentAuthors] = useState<Record<string, string>>({})
  const [selectedFile, setSelectedFile] = useState<UIFile | null>(null)
  const [fileCommentText, setFileCommentText] = useState('')
  const [fileCommentLoading, setFileCommentLoading] = useState(false)
  const [showNewFile, setShowNewFile] = useState(false)
  const [newFile, setNewFile] = useState({ name: '', file_url: '', file_type: 'image' as UIFileType, tag: '', figma_url: '' })
  const [fileSearch, setFileSearch] = useState('')
  const [fileTagFilter, setFileTagFilter] = useState('')

  // ── Annotation state
  const [annImages, setAnnImages] = useState<UIAnnotationImage[]>([])
  const [annPins, setAnnPins] = useState<UIAnnotationPin[]>([])
  const [annPinReplies, setAnnPinReplies] = useState<Record<string, UIAnnotationPinReply[]>>({})
  const [annPinAuthors, setAnnPinAuthors] = useState<Record<string, string>>({})
  const [selectedAnnImage, setSelectedAnnImage] = useState<UIAnnotationImage | null>(null)
  const [selectedPin, setSelectedPin] = useState<UIAnnotationPin | null>(null)
  const [pendingPin, setPendingPin] = useState<{ x_pct: number; y_pct: number } | null>(null)
  const [newPinLabel, setNewPinLabel] = useState('')
  const [pinReplyText, setPinReplyText] = useState('')
  const [pinReplyLoading, setPinReplyLoading] = useState(false)
  const [showNewAnnImage, setShowNewAnnImage] = useState(false)
  const [newAnnImage, setNewAnnImage] = useState({ title: '', image_url: '', description: '' })
  const [annUploading, setAnnUploading] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [canvasMode, setCanvasMode] = useState<'pin' | 'pan'>('pin')
  const [hoveredPinId, setHoveredPinId] = useState<string | null>(null)
  const [annPinAuthorRoles, setAnnPinAuthorRoles] = useState<Record<string, string>>({})

  // ── Dosya yükleme state (genel)
  const [fileUploading, setFileUploading] = useState(false)
  const [msgAttachFile, setMsgAttachFile] = useState<File | null>(null)

  const msgEndRef = useRef<HTMLDivElement>(null)
  const annFileRef = useRef<HTMLInputElement>(null)
  const filesUploadRef = useRef<HTMLInputElement>(null)
  const msgAttachRef = useRef<HTMLInputElement>(null)
  const updateAttachRef = useRef<HTMLInputElement>(null)
  const newQuestionFileRef = useRef<HTMLInputElement>(null)
  const canvasClipRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const panRef = useRef(pan)
  useEffect(() => { panRef.current = pan }, [pan])

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
  }, [])

  // ── Auth & init ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (orgLoading) return
    if (!org || !ctxUserId) { router.replace('/login'); return }

    const role = orgRole === 'consultant' ? 'consultant' : (orgRole === 'admin' || orgRole === 'owner' ? 'admin' : null)
    if (!role) { router.replace(`/org/${org.slug}/me`); return }

    setUserId(ctxUserId)
    setUserEmail(ctxEmail ?? '')
    setUserAvatarUrl(ctxAvatar ?? null)
    setUserRole(role)

    // Son erişim zamanını güncelle
    supabase
      .from('organization_members')
      .update({ last_accessed_at: new Date().toISOString() })
      .eq('user_id', ctxUserId)
      .eq('organization_id', org.id)
      .then(() => {})

    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgLoading, org, ctxUserId, orgRole])

  // ── Sorular yükle ───────────────────────────────────────────────────────────

  const loadQuestions = useCallback(async () => {
    const { data } = await supabase
      .from('ui_questions')
      .select('*')
      .order('created_at', { ascending: false })
    setQuestions(data || [])
    setOpenQuestionCount((data || []).filter((q) => q.status === 'open').length)
  }, [])

  // ── Güncellemeler yükle ─────────────────────────────────────────────────────

  const loadUpdates = useCallback(async () => {
    const { data } = await supabase
      .from('ui_updates')
      .select('*')
      .order('created_at', { ascending: false })
    setUpdates(data || [])

    // Ekleri yükle
    if (data && data.length > 0) {
      const { data: atts } = await supabase
        .from('ui_update_attachments')
        .select('*')
        .in('update_id', data.map((u) => u.id))
      const map: Record<string, UIUpdateAttachment[]> = {}
      ;(atts || []).forEach((a) => {
        if (!map[a.update_id]) map[a.update_id] = []
        map[a.update_id].push(a)
      })
      setUpdateAttachments(map)
    }
  }, [])

  // ── Dosyalar yükle ──────────────────────────────────────────────────────────

  const loadFiles = useCallback(async () => {
    const { data } = await supabase
      .from('ui_files')
      .select('*')
      .order('created_at', { ascending: false })
    setFiles(data || [])
  }, [])

  // ── Annotation görselleri yükle ─────────────────────────────────────────────

  const loadAnnImages = useCallback(async () => {
    const { data } = await supabase
      .from('ui_annotation_images')
      .select('*')
      .order('created_at', { ascending: false })
    setAnnImages((data || []) as UIAnnotationImage[])
  }, [])

  useEffect(() => {
    if (!loading) {
      loadQuestions()
      loadUpdates()
      loadFiles()
      loadAnnImages()
    }
  }, [loading, loadQuestions, loadUpdates, loadFiles, loadAnnImages])

  // ── Canvas zoom — non-passive wheel listener ──────────────────────────────
  useEffect(() => {
    const el = canvasClipRef.current
    if (!el || !selectedAnnImage) return
    function onWheel(e: WheelEvent) {
      e.preventDefault()
      const clipRect = el!.getBoundingClientRect()
      const cursorX = e.clientX - clipRect.left
      const cursorY = e.clientY - clipRect.top
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
      setZoom((z) => {
        const newZoom = Math.max(0.5, Math.min(5, z * factor))
        const scale = newZoom / z
        setPan((p) => ({
          x: cursorX - (cursorX - p.x) * scale,
          y: cursorY - (cursorY - p.y) * scale,
        }))
        return newZoom
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [selectedAnnImage])

  // ── Canvas dokunmatik kaydırma + iki parmak yakınlaştırma (mobil) ──────────
  useEffect(() => {
    const el = canvasClipRef.current
    if (!el || !selectedAnnImage) return

    let panStartX = 0, panStartY = 0, panning = false
    let lastPinchDist = 0

    function pinchDist(t: TouchList) {
      const dx = t[0].clientX - t[1].clientX
      const dy = t[0].clientY - t[1].clientY
      return Math.sqrt(dx * dx + dy * dy)
    }

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length === 2) {
        panning = false
        lastPinchDist = pinchDist(e.touches)
      } else if (e.touches.length === 1 && canvasMode === 'pan') {
        panning = true
        panStartX = e.touches[0].clientX - panRef.current.x
        panStartY = e.touches[0].clientY - panRef.current.y
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (e.touches.length === 2) {
        e.preventDefault()
        const dist = pinchDist(e.touches)
        if (lastPinchDist > 0 && el) {
          const factor = dist / lastPinchDist
          const rect = el.getBoundingClientRect()
          const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left
          const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top
          setZoom(z => {
            const newZoom = Math.max(0.5, Math.min(5, z * factor))
            const scale = newZoom / z
            setPan(p => ({ x: midX - (midX - p.x) * scale, y: midY - (midY - p.y) * scale }))
            return newZoom
          })
        }
        lastPinchDist = dist
      } else if (e.touches.length === 1 && panning) {
        e.preventDefault()
        setPan({ x: e.touches[0].clientX - panStartX, y: e.touches[0].clientY - panStartY })
      }
    }

    function onTouchEnd(e: TouchEvent) {
      if (e.touches.length < 2) lastPinchDist = 0
      if (e.touches.length === 0) panning = false
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [selectedAnnImage, canvasMode])

  // ── Annotation işlemleri ─────────────────────────────────────────────────────

  async function openAnnImage(img: UIAnnotationImage) {
    setSelectedAnnImage(img)
    setSelectedPin(null)
    setPendingPin(null)
    setAnnPins([])
    setAnnPinReplies({})
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setCanvasMode('pin')
    const { data: pinsData } = await supabase
      .from('ui_annotation_pins')
      .select('*')
      .eq('image_id', img.id)
      .order('created_at', { ascending: true })
    const pins = (pinsData || []) as UIAnnotationPin[]
    setAnnPins(pins)
    if (pins.length > 0) {
      const { data: repliesData } = await supabase
        .from('ui_annotation_pin_replies')
        .select('*')
        .in('pin_id', pins.map((p) => p.id))
        .order('created_at', { ascending: true })
      const replyMap: Record<string, UIAnnotationPinReply[]> = {}
      ;(repliesData || []).forEach((r: UIAnnotationPinReply) => {
        if (!replyMap[r.pin_id]) replyMap[r.pin_id] = []
        replyMap[r.pin_id].push(r)
      })
      setAnnPinReplies(replyMap)
      const authorIds = Array.from(new Set([
        ...pins.map((p) => p.created_by),
        ...(repliesData || []).map((r: UIAnnotationPinReply) => r.created_by),
      ]))
      if (authorIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name, role')
          .in('id', authorIds)
        const nameMap: Record<string, string> = {}
        const roleMap: Record<string, string> = {}
        ;(profilesData || []).forEach((p: { id: string; full_name: string | null; role: string }) => {
          nameMap[p.id] = p.full_name || 'Bilinmiyor'
          roleMap[p.id] = p.role
        })
        setAnnPinAuthors(nameMap)
        setAnnPinAuthorRoles(roleMap)
      }
    }
  }

  function handleCanvasClick(e: React.MouseEvent<HTMLDivElement>) {
    if (canvasMode !== 'pin') return
    if (pendingPin) { setPendingPin(null); return }
    const imgEl = imgRef.current
    if (!imgEl) return
    const imgRect = imgEl.getBoundingClientRect()
    const x_pct = ((e.clientX - imgRect.left) / imgRect.width) * 100
    const y_pct = ((e.clientY - imgRect.top) / imgRect.height) * 100
    if (x_pct < 0 || x_pct > 100 || y_pct < 0 || y_pct > 100) return
    setPendingPin({
      x_pct: Math.round(Math.max(0, Math.min(100, x_pct)) * 100) / 100,
      y_pct: Math.round(Math.max(0, Math.min(100, y_pct)) * 100) / 100,
    })
    setNewPinLabel('')
    setSelectedPin(null)
  }

  function handleMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (canvasMode !== 'pan') return
    e.preventDefault()
    setIsDragging(true)
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
  }

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!isDragging || !dragStart || canvasMode !== 'pan') return
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
  }

  function handleMouseUp() {
    setIsDragging(false)
    setDragStart(null)
  }

  async function createPin() {
    if (!pendingPin || !selectedAnnImage || !userId) return
    const { data, error } = await supabase
      .from('ui_annotation_pins')
      .insert({
        image_id: selectedAnnImage.id,
        x_pct: pendingPin.x_pct,
        y_pct: pendingPin.y_pct,
        label: newPinLabel.trim() || null,
        created_by: userId,
      })
      .select()
      .single()
    if (error) { showToast('Pin eklenemedi', 'error'); return }
    const newPin = data as UIAnnotationPin
    setAnnPins((prev) => [...prev, newPin])
    setPendingPin(null)
    setNewPinLabel('')
    setSelectedPin(newPin)
    if (!annPinAuthors[userId]) {
      const { data: up } = await supabase.from('profiles').select('id, full_name, role').eq('id', userId).single()
      if (up) {
        setAnnPinAuthors((prev) => ({ ...prev, [up.id]: up.full_name || 'Bilinmiyor' }))
        setAnnPinAuthorRoles((prev) => ({ ...prev, [up.id]: up.role }))
      }
    }
    showToast('Pin eklendi', 'success')
  }

  async function togglePinStatus(pin: UIAnnotationPin) {
    const newStatus = pin.status === 'open' ? 'resolved' : 'open'
    const { error } = await supabase
      .from('ui_annotation_pins')
      .update({ status: newStatus })
      .eq('id', pin.id)
    if (error) { showToast('Durum güncellenemedi', 'error'); return }
    const updated = { ...pin, status: newStatus as UIAnnotationPin['status'] }
    setAnnPins((prev) => prev.map((p) => p.id === pin.id ? updated : p))
    setSelectedPin(updated)

    // Bildirim: pin sahibi farklıysa annotation_resolved bildirimi gönder
    if (newStatus === 'resolved' && userId && pin.created_by !== userId) {
      const pinIdx = annPins.findIndex((p) => p.id === pin.id)
      await createNotification({
        user_id: pin.created_by,
        type: 'review',
        event_type: 'annotation_resolved',
        title: 'Annotasyonunuz çözüldü',
        description: pin.label || `Pin #${pinIdx + 1}`,
        actor_id: userId,
        actor_name: annPinAuthors[userId] || undefined,
        link: '/consultant',
      })
    }
  }

  async function deletePin(pin: UIAnnotationPin) {
    const { error } = await supabase.from('ui_annotation_pins').delete().eq('id', pin.id)
    if (error) { showToast('Pin silinemedi', 'error'); return }
    setAnnPins((prev) => prev.filter((p) => p.id !== pin.id))
    setAnnPinReplies((prev) => { const n = { ...prev }; delete n[pin.id]; return n })
    setSelectedPin(null)
    showToast('Pin silindi', 'success')
  }

  async function sendPinReply() {
    if (!pinReplyText.trim() || !selectedPin || !userId) return
    setPinReplyLoading(true)
    const { data, error } = await supabase
      .from('ui_annotation_pin_replies')
      .insert({ pin_id: selectedPin.id, content: pinReplyText.trim(), created_by: userId })
      .select()
      .single()
    if (error) { showToast('Yorum gönderilemedi', 'error') }
    else {
      const reply = data as UIAnnotationPinReply
      setAnnPinReplies((prev) => ({
        ...prev,
        [selectedPin.id]: [...(prev[selectedPin.id] || []), reply],
      }))
      if (!annPinAuthors[userId]) {
        const { data: up } = await supabase.from('profiles').select('id, full_name, role').eq('id', userId).single()
        if (up) {
          setAnnPinAuthors((prev) => ({ ...prev, [up.id]: up.full_name || 'Bilinmiyor' }))
          setAnnPinAuthorRoles((prev) => ({ ...prev, [up.id]: up.role }))
        }
      }
      setPinReplyText('')
    }
    setPinReplyLoading(false)
  }

  async function createAnnImage() {
    if (!newAnnImage.title.trim() || !userId) return
    setAnnUploading(true)
    let imageUrl = newAnnImage.image_url.trim()

    // Dosya yükleme (Supabase Storage)
    const file = annFileRef.current?.files?.[0]
    if (file && !imageUrl) {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${userId}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('ui-annotations').upload(path, file)
      if (uploadError) {
        showToast('Yükleme hatası. Supabase Storage "ui-annotations" bucket oluşturulmuş olmalı.', 'error')
        setAnnUploading(false)
        return
      }
      const { data: { publicUrl } } = supabase.storage.from('ui-annotations').getPublicUrl(path)
      imageUrl = publicUrl
    }

    if (!imageUrl) {
      showToast('Görsel URL veya dosya seçiniz', 'error')
      setAnnUploading(false)
      return
    }

    const { data, error } = await supabase
      .from('ui_annotation_images')
      .insert({
        title: newAnnImage.title.trim(),
        image_url: imageUrl,
        description: newAnnImage.description.trim() || null,
        created_by: userId,
      })
      .select()
      .single()
    if (error) { showToast('Hata: ' + (error.message || JSON.stringify(error)), 'error') }
    else {
      setAnnImages((prev) => [data as UIAnnotationImage, ...prev])
      setNewAnnImage({ title: '', image_url: '', description: '' })
      if (annFileRef.current) annFileRef.current.value = ''
      setShowNewAnnImage(false)
      showToast('Görsel eklendi', 'success')
    }
    setAnnUploading(false)
  }

  async function deleteAnnImage(img: UIAnnotationImage) {
    const { error } = await supabase.from('ui_annotation_images').delete().eq('id', img.id)
    if (error) { showToast('Görsel silinemedi', 'error'); return }
    setAnnImages((prev) => prev.filter((i) => i.id !== img.id))
    if (selectedAnnImage?.id === img.id) {
      setSelectedAnnImage(null)
      setAnnPins([])
      setSelectedPin(null)
      setPendingPin(null)
    }
    showToast('Görsel silindi', 'success')
  }

  // ── Depolama yardımcıları ────────────────────────────────────────────────────

  async function uploadFile(file: File, bucket: string): Promise<string | null> {
    const ext = file.name.split('.').pop() || 'bin'
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage.from(bucket).upload(path, file)
    if (error) {
      showToast('Yükleme hatası. Supabase Storage bucket kontrol edin.', 'error')
      return null
    }
    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path)
    return publicUrl
  }

  function detectFileType(file: File): UIFileType {
    const m = file.type
    if (m.startsWith('image/')) return 'image'
    if (m === 'application/pdf') return 'pdf'
    if (m.startsWith('video/')) return 'video'
    if (m.includes('word') || m.includes('document') || m.includes('sheet') || m.includes('presentation') || m.startsWith('text/')) return 'doc'
    return 'other'
  }

  // ── Yazar adlarını getir ────────────────────────────────────────────────────

  async function fetchAuthors(ids: string[], setter: (m: Record<string, string>) => void) {
    if (ids.length === 0) return
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', ids)
    const map: Record<string, string> = {}
    ;(data || []).forEach((p) => { map[p.id] = p.full_name || 'Bilinmiyor' })
    setter(map)
  }

  // ── Soru detay ──────────────────────────────────────────────────────────────

  async function openQuestion(q: UIQuestion) {
    setSelectedQuestion(q)
    const { data } = await supabase
      .from('ui_question_messages')
      .select('*')
      .eq('question_id', q.id)
      .order('created_at', { ascending: true })
    setMessages(data || [])
    const ids = Array.from(new Set((data || []).map((m) => m.created_by)))
    await fetchAuthors(ids, setMsgAuthors)
    setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }

  async function sendReply() {
    if (!replyText.trim() && !msgAttachFile || !selectedQuestion || !userId) return
    setReplyLoading(true)

    let attachUrl: string | null = null
    let attachName: string | null = null
    if (msgAttachFile) {
      attachUrl = await uploadFile(msgAttachFile, 'ui-files')
      if (!attachUrl) { setReplyLoading(false); return }
      attachName = msgAttachFile.name
    }

    const { error } = await supabase.from('ui_question_messages').insert({
      question_id: selectedQuestion.id,
      content: replyText.trim() || '',
      attachment_url: attachUrl,
      attachment_name: attachName,
      created_by: userId,
    })
    if (error) { showToast('Mesaj gönderilemedi', 'error') }
    else {
      if (selectedQuestion.created_by !== userId) {
        await createNotification({
          user_id: selectedQuestion.created_by, type: 'review', event_type: 'review_reply',
          title: 'Sorunuza Yanıt Geldi',
          description: `"${selectedQuestion.title}" sorunuza yeni bir yanıt eklendi.`,
          actor_id: userId!, actor_name: userEmail.split('@')[0], link: '/consultant',
        })
      }
      setReplyText('')
      setMsgAttachFile(null)
      if (msgAttachRef.current) msgAttachRef.current.value = ''
      await openQuestion(selectedQuestion)
      showToast('Mesaj gönderildi')
    }
    setReplyLoading(false)
  }

  async function closeQuestion(qId: string) {
    const { error } = await supabase.from('ui_questions').update({ status: 'closed' }).eq('id', qId)
    if (error) { showToast('Güncellenemedi', 'error'); return }
    await loadQuestions()
    if (selectedQuestion?.id === qId) setSelectedQuestion((p) => p ? { ...p, status: 'closed' } : p)
    showToast('Soru kapatıldı')
  }

  async function reopenQuestion(qId: string) {
    const { error } = await supabase.from('ui_questions').update({ status: 'open' }).eq('id', qId)
    if (error) { showToast('Güncellenemedi', 'error'); return }
    await loadQuestions()
    if (selectedQuestion?.id === qId) setSelectedQuestion((p) => p ? { ...p, status: 'open' } : p)
    showToast('Soru yeniden açıldı')
  }

  async function deleteQuestion(q: UIQuestion) {
    if (!confirm(`"${q.title}" sorusunu silmek istediğinize emin misiniz?\nTüm mesajlar da silinecek.`)) return
    const { error } = await supabase.from('ui_questions').delete().eq('id', q.id)
    if (error) { showToast('Soru silinemedi', 'error'); return }
    setQuestions((prev) => prev.filter((x) => x.id !== q.id))
    if (selectedQuestion?.id === q.id) { setSelectedQuestion(null); setMessages([]) }
    showToast('Soru silindi')
  }

  async function deleteMessage(msgId: string) {
    const { error } = await supabase.from('ui_question_messages').delete().eq('id', msgId)
    if (error) { showToast('Mesaj silinemedi', 'error'); return }
    setMessages((prev) => prev.filter((m) => m.id !== msgId))
    showToast('Mesaj silindi')
  }

  async function deleteUpdate(u: UIUpdate) {
    if (!confirm(`"${u.title}" güncellemesini silmek istediğinize emin misiniz?`)) return
    const { error } = await supabase.from('ui_updates').delete().eq('id', u.id)
    if (error) { showToast('Güncelleme silinemedi', 'error'); return }
    setUpdates((prev) => prev.filter((x) => x.id !== u.id))
    if (selectedUpdate?.id === u.id) { setSelectedUpdate(null); setUpdateComments([]) }
    showToast('Güncelleme silindi')
  }

  async function deleteUpdateComment(commentId: string) {
    const { error } = await supabase.from('ui_update_comments').delete().eq('id', commentId)
    if (error) { showToast('Yorum silinemedi', 'error'); return }
    setUpdateComments((prev) => prev.filter((c) => c.id !== commentId))
    showToast('Yorum silindi')
  }

  async function createQuestion() {
    if (!newQuestion.title.trim() || !userId) return
    const { data: qData, error } = await supabase.from('ui_questions').insert({
      ...newQuestion,
      created_by: userId,
    }).select().single()
    if (error) { showToast('Soru eklenemedi', 'error'); return }

    // Dosya/görsel eki varsa ilk mesaj olarak ekle
    const qFile = newQuestionFileRef.current?.files?.[0]
    if (qFile && qData) {
      const url = await uploadFile(qFile, 'ui-files')
      if (url) {
        await supabase.from('ui_question_messages').insert({
          question_id: qData.id,
          content: '',
          attachment_url: url,
          attachment_name: qFile.name,
          created_by: userId,
        })
      }
      if (newQuestionFileRef.current) newQuestionFileRef.current.value = ''
    }

    setNewQuestion({ title: '', description: '', category: 'UI', priority: 'normal' })
    setShowNewQuestion(false)
    await loadQuestions()
    showToast('Soru oluşturuldu')
  }

  // ── Herhangi bir URL'yi annotasyon ekranında aç ──────────────────────────────

  async function openAnnotationForUrl(imageUrl: string, title: string) {
    // Daha önce bu URL için annotasyon açıldıysa onu seç
    let img = annImages.find((i) => i.image_url === imageUrl)
    if (!img) {
      // Yoksa yeni kayıt oluştur
      const { data, error } = await supabase
        .from('ui_annotation_images')
        .insert({ title, image_url: imageUrl, description: null, created_by: userId })
        .select()
        .single()
      if (error) { showToast('Annotasyon açılamadı: ' + error.message, 'error'); return }
      img = data as UIAnnotationImage
      setAnnImages((prev) => [img!, ...prev])
    }
    // Görseller sekmesine geç ve görüntüyü seç
    setSelectedPin(null)
    setPendingPin(null)
    setActiveTab('annotations')
    await openAnnImage(img)
  }

  // ── Güncelleme detay ────────────────────────────────────────────────────────

  async function openUpdate(u: UIUpdate) {
    setSelectedUpdate(u)
    const { data } = await supabase
      .from('ui_update_comments')
      .select('*')
      .eq('update_id', u.id)
      .order('created_at', { ascending: true })
    setUpdateComments(data || [])
    const ids = Array.from(new Set((data || []).map((c) => c.created_by)))
    await fetchAuthors(ids, setUpdateCommentAuthors)
  }

  async function sendUpdateComment() {
    if (!updateCommentText.trim() || !selectedUpdate || !userId) return
    setUpdateCommentLoading(true)
    const { error } = await supabase.from('ui_update_comments').insert({
      update_id: selectedUpdate.id,
      content: updateCommentText.trim(),
      created_by: userId,
    })
    if (error) { showToast('Yorum gönderilemedi', 'error') }
    else {
      setUpdateCommentText('')
      await openUpdate(selectedUpdate)
      showToast('Yorum eklendi')
    }
    setUpdateCommentLoading(false)
  }

  async function createUpdate() {
    if (!newUpdate.title.trim() || !userId) return
    const { data: updateData, error } = await supabase.from('ui_updates').insert({
      ...newUpdate,
      created_by: userId,
    }).select().single()
    if (error) { showToast('Güncelleme eklenemedi', 'error'); return }

    // Dosya eki varsa yükle
    const attachFile = updateAttachRef.current?.files?.[0]
    if (attachFile && updateData) {
      const url = await uploadFile(attachFile, 'ui-files')
      if (url) {
        await supabase.from('ui_update_attachments').insert({
          update_id: updateData.id,
          file_url: url,
          file_name: attachFile.name,
          file_type: attachFile.type || null,
        })
      }
      if (updateAttachRef.current) updateAttachRef.current.value = ''
    }

    setNewUpdate({ title: '', summary: '', detail: '', tag: 'UI' })
    setShowNewUpdate(false)
    await loadUpdates()
    showToast('Güncelleme paylaşıldı')
  }

  // ── Dosya işlemleri ─────────────────────────────────────────────────────────

  async function openFileDetail(f: UIFile) {
    setSelectedFile(f)
    if (!fileComments[f.id]) {
      const { data } = await supabase
        .from('ui_file_comments')
        .select('*')
        .eq('file_id', f.id)
        .order('created_at', { ascending: true })
      setFileComments((p) => ({ ...p, [f.id]: data || [] }))
      const ids = Array.from(new Set((data || []).map((c) => c.created_by)))
      await fetchAuthors(ids, (m) => setFileCommentAuthors((p) => ({ ...p, ...m })))
    }
  }

  async function sendFileComment() {
    if (!fileCommentText.trim() || !selectedFile || !userId) return
    setFileCommentLoading(true)
    const { error } = await supabase.from('ui_file_comments').insert({
      file_id: selectedFile.id,
      content: fileCommentText.trim(),
      created_by: userId,
    })
    if (error) { showToast('Yorum gönderilemedi', 'error') }
    else {
      setFileCommentText('')
      await openFileDetail(selectedFile)
      showToast('Yorum eklendi')
    }
    setFileCommentLoading(false)
  }

  async function createFile() {
    if (!userId) return
    const pickedFile = filesUploadRef.current?.files?.[0]
    if (!pickedFile && !newFile.file_url.trim()) { showToast('Dosya veya URL gerekli', 'error'); return }
    setFileUploading(true)

    let fileUrl = newFile.file_url.trim()
    let fileName = newFile.name.trim()
    let fileType = newFile.file_type
    let fileSize: number | null = null

    if (pickedFile) {
      const url = await uploadFile(pickedFile, 'ui-files')
      if (!url) { setFileUploading(false); return }
      fileUrl = url
      if (!fileName) fileName = pickedFile.name.replace(/\.[^/.]+$/, '')
      fileType = detectFileType(pickedFile)
      fileSize = pickedFile.size
    }

    if (!fileName) fileName = fileUrl.split('/').pop()?.split('?')[0] || 'Dosya'

    const { error } = await supabase.from('ui_files').insert({
      name: fileName,
      file_url: fileUrl,
      file_type: fileType,
      tag: newFile.tag.trim() || null,
      figma_url: newFile.figma_url.trim() || null,
      size_bytes: fileSize,
      created_by: userId,
    })
    if (error) { showToast('Dosya eklenemedi', 'error') }
    else {
      setNewFile({ name: '', file_url: '', file_type: 'image', tag: '', figma_url: '' })
      if (filesUploadRef.current) filesUploadRef.current.value = ''
      setShowNewFile(false)
      await loadFiles()
      showToast('Dosya eklendi')
    }
    setFileUploading(false)
  }

  // ── Filtrelenmiş sorular ────────────────────────────────────────────────────

  const filteredQuestions = questions.filter((q) => {
    if (qFilter.cat && q.category !== qFilter.cat) return false
    if (qFilter.pri && q.priority !== qFilter.pri) return false
    if (qFilter.status && q.status !== qFilter.status) return false
    if (qFilter.search && !q.title.toLowerCase().includes(qFilter.search.toLowerCase())) return false
    return true
  })

  const filteredFiles = files.filter((f) => {
    if (fileSearch && !f.name.toLowerCase().includes(fileSearch.toLowerCase())) return false
    if (fileTagFilter && f.tag !== fileTagFilter) return false
    return true
  })

  const allFileTags = Array.from(new Set(files.map((f) => f.tag).filter(Boolean))) as string[]

  // ── Loading ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: '#f4f6f9' }}>
        <main className="w-full px-6 py-6 space-y-4">
          <Skeleton className="h-10 w-64 rounded-xl" />
          <Skeleton className="h-14 w-full rounded-2xl" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {[0,1,2].map((i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
          </div>
        </main>
      </div>
    )
  }

  const isAdmin = userRole === 'admin'

  // ── RENDER ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen" style={{ background: '#f4f6f9' }}>

      <style>{`
        @keyframes cFadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes cFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes cSlideInRight {
          from { opacity: 0; transform: translateX(10px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .c-tab-content { animation: cFadeInUp 0.2s cubic-bezier(0.16,1,0.3,1); }
        .c-list-item   { animation: cFadeInUp 0.18s cubic-bezier(0.16,1,0.3,1) both; }
        .c-detail-panel { animation: cSlideInRight 0.22s cubic-bezier(0.16,1,0.3,1); }
        .c-card { transition: box-shadow 0.2s ease, transform 0.2s ease; }
        .c-card:hover { box-shadow: 0 4px 16px rgba(15,23,42,0.10) !important; transform: translateY(-1px); }
        .c-msg-bubble { animation: cFadeIn 0.15s ease both; }
      `}</style>

      {toast && (
        <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />
      )}

      <main className="w-full" style={{ padding: isMobile ? '12px' : '24px' }}>

        {/* ── Başlık ── */}
        <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ color: '#0f172a' }}>
              Danışmanlık
            </h1>
            <p className="text-sm mt-0.5" style={{ color: '#64748b' }}>
              Arayüz geliştirme süreci için soru-cevap, güncellemeler ve dosyalar
            </p>
          </div>
          {openQuestionCount > 0 && (
            <span
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold"
              style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }}
            >
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              {openQuestionCount} açık soru
            </span>
          )}
        </div>

        {/* ── Tab bar ── */}
        <div
          className="flex gap-1 p-1 rounded-2xl mb-5"
          style={{ background: '#fff', border: '1px solid #d0dce8', boxShadow: '0 1px 3px rgba(15,23,42,0.06)' }}
        >
          {([
            { key: 'questions',   label: 'Sorular',        short: 'Sorular' },
            { key: 'updates',     label: 'Güncellemeler',  short: 'Haberler' },
            { key: 'files',       label: 'Dosyalar',       short: 'Dosyalar' },
            { key: 'annotations', label: 'Görseller',      short: 'Görseller' },
          ] as { key: Tab; label: string; short: string }[]).map(({ key, label, short }) => (
            <button
              key={key}
              onClick={() => {
                setActiveTab(key)
                setSelectedQuestion(null)
                setSelectedUpdate(null)
                setSelectedFile(null)
                setSelectedPin(null)
                setPendingPin(null)
              }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-semibold transition-all duration-150"
              style={{
                fontSize: isMobile ? 13 : 14, padding: isMobile ? '10px 6px' : undefined,
                ...(activeTab === key
                  ? { background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)', color: '#fff', boxShadow: '0 2px 8px rgba(37,99,235,0.3)' }
                  : { color: '#64748b' })
              }}
            >
              <span>{isMobile ? short : label}</span>
              {key === 'questions' && openQuestionCount > 0 && (
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black"
                  style={{ background: activeTab === 'questions' ? 'rgba(255,255,255,0.3)' : '#dc2626', color: '#fff' }}
                >
                  {openQuestionCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ══════════════════════ SORULAR TABI ══════════════════════ */}
        {activeTab === 'questions' && (
          <div className="c-tab-content grid grid-cols-1 lg:grid-cols-5 gap-5">

            {/* Sol: Liste */}
            <div className="lg:col-span-2 space-y-3" style={isMobile && selectedQuestion ? { display: 'none' } : {}}>

              {/* Filtreler */}
              <div className="card p-3 space-y-2">
                <input
                  className="input text-sm w-full"
                  placeholder="Soru ara..."
                  value={qFilter.search}
                  onChange={(e) => setQFilter((p) => ({ ...p, search: e.target.value }))}
                />
                <div className="grid grid-cols-3 gap-2">
                  <select className="input text-xs py-1.5" value={qFilter.status} onChange={(e) => setQFilter((p) => ({ ...p, status: e.target.value }))}>
                    <option value="">Tümü</option>
                    <option value="open">Açık</option>
                    <option value="closed">Kapalı</option>
                  </select>
                  <select className="input text-xs py-1.5" value={qFilter.cat} onChange={(e) => setQFilter((p) => ({ ...p, cat: e.target.value }))}>
                    <option value="">Kategori</option>
                    {CATEGORY_OPTIONS.map((c) => <option key={c}>{c}</option>)}
                  </select>
                  <select className="input text-xs py-1.5" value={qFilter.pri} onChange={(e) => setQFilter((p) => ({ ...p, pri: e.target.value }))}>
                    <option value="">Öncelik</option>
                    {PRIORITY_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Admin + Danışman: Yeni soru butonu */}
              <button
                className="w-full btn-primary text-sm py-2.5 rounded-xl font-semibold"
                onClick={() => setShowNewQuestion((p) => !p)}
              >
                + Yeni Soru Aç
              </button>

              {/* Yeni soru formu */}
              {showNewQuestion && (
                <div className="card p-4 space-y-3">
                  <p className="text-sm font-bold" style={{ color: '#0d1a2a' }}>Yeni Soru</p>
                  <input
                    className="input text-sm w-full"
                    placeholder="Başlık *"
                    value={newQuestion.title}
                    onChange={(e) => setNewQuestion((p) => ({ ...p, title: e.target.value }))}
                  />
                  <textarea
                    className="input text-sm w-full resize-none"
                    rows={3}
                    placeholder="Açıklama (isteğe bağlı)"
                    value={newQuestion.description}
                    onChange={(e) => setNewQuestion((p) => ({ ...p, description: e.target.value }))}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select className="input text-sm" value={newQuestion.category} onChange={(e) => setNewQuestion((p) => ({ ...p, category: e.target.value as UIQuestionCategory }))}>
                      {CATEGORY_OPTIONS.map((c) => <option key={c}>{c}</option>)}
                    </select>
                    <select className="input text-sm" value={newQuestion.priority} onChange={(e) => setNewQuestion((p) => ({ ...p, priority: e.target.value as UIQuestionPriority }))}>
                      {PRIORITY_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </div>
                  {/* Görsel / dosya eki */}
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: '#64748b' }}>📎 Görsel / Dosya Ekle (opsiyonel)</label>
                    <input
                      ref={newQuestionFileRef}
                      type="file"
                      accept="image/*,application/pdf,video/*,.doc,.docx"
                      className="block w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button className="btn-primary text-sm py-2 px-4 rounded-lg flex-1" onClick={createQuestion}>Oluştur</button>
                    <button className="btn-secondary text-sm py-2 px-3 rounded-lg" onClick={() => { setShowNewQuestion(false); if (newQuestionFileRef.current) newQuestionFileRef.current.value = '' }}>İptal</button>
                  </div>
                </div>
              )}

              {/* Soru listesi */}
              {filteredQuestions.length === 0 ? (
                <div className="card p-8 text-center">
                  <div className="text-3xl mb-2">💬</div>
                  <p className="text-sm font-medium" style={{ color: '#64748b' }}>Henüz soru yok</p>
                </div>
              ) : (
                filteredQuestions.map((q) => {
                  const pri = PRIORITY_OPTIONS.find((p) => p.value === q.priority)!
                  const cat = CAT_COLORS[q.category]
                  const isSelected = selectedQuestion?.id === q.id
                  return (
                    <div key={q.id} className="relative group">
                      <button
                        onClick={() => openQuestion(q)}
                        className="w-full text-left card p-3.5 space-y-2 transition-all duration-150"
                        style={isSelected ? { border: '2px solid #2288c9', background: '#f0f9ff' } : {}}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-semibold leading-tight pr-5" style={{ color: '#0d1a2a' }}>{q.title}</span>
                          <span
                            className="shrink-0 px-2 py-0.5 rounded-full text-xs font-bold"
                            style={q.status === 'open'
                              ? { background: '#d1fae5', color: '#065f46' }
                              : { background: '#f1f5f9', color: '#64748b' }
                            }
                          >
                            {q.status === 'open' ? 'Açık' : 'Kapalı'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ background: cat.bg, color: cat.color }}>{q.category}</span>
                          <span className="text-[11px]">{pri.icon}</span>
                          <span className="text-[11px]" style={{ color: '#94a3b8' }}>{timeAgo(q.updated_at)}</span>
                        </div>
                      </button>
                      {(isAdmin || q.created_by === userId) && (
                        <button
                          onClick={() => deleteQuestion(q)}
                          title="Soruyu sil"
                          className="absolute top-2 right-2 w-6 h-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ background: '#fee2e2', color: '#dc2626' }}
                        >
                          <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M1 3h12M5 3V2h4v1M2 3l1 9h8l1-9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                      )}
                    </div>
                  )
                })
              )}
            </div>

            {/* Sağ: Thread */}
            <div className="lg:col-span-3" style={isMobile && !selectedQuestion ? { display: 'none' } : {}}>
              {!selectedQuestion ? (
                <div className="card p-12 text-center h-full flex flex-col items-center justify-center">
                  <div className="text-5xl mb-4">💬</div>
                  <p className="text-base font-semibold" style={{ color: '#0d1a2a' }}>Bir soru seçin</p>
                  <p className="text-sm mt-1" style={{ color: '#94a3b8' }}>Konuşma thread'ini görmek için sol listeden bir soru seçin</p>
                </div>
              ) : (
                <div className="card flex flex-col h-[70vh]">
                  {/* Header */}
                  <div className="p-4 border-b" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
                    {isMobile && (
                      <button
                        onClick={() => setSelectedQuestion(null)}
                        className="flex items-center gap-1.5 text-xs font-semibold mb-3"
                        style={{ color: '#2288c9' }}
                      >
                        ← Geri
                      </button>
                    )}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h2 className="font-bold text-base leading-tight" style={{ color: '#0d1a2a' }}>{selectedQuestion.title}</h2>
                        {selectedQuestion.description && (
                          <p className="text-sm mt-1" style={{ color: '#64748b' }}>{selectedQuestion.description}</p>
                        )}
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold"
                            style={{ background: CAT_COLORS[selectedQuestion.category].bg, color: CAT_COLORS[selectedQuestion.category].color }}>
                            {selectedQuestion.category}
                          </span>
                          <span className="text-[11px]">{PRIORITY_OPTIONS.find((p) => p.value === selectedQuestion.priority)?.icon}</span>
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold"
                            style={selectedQuestion.status === 'open'
                              ? { background: '#d1fae5', color: '#065f46' }
                              : { background: '#f1f5f9', color: '#64748b' }}>
                            {selectedQuestion.status === 'open' ? 'Açık' : 'Kapalı'}
                          </span>
                        </div>
                      </div>
                      {isAdmin && (
                        <div className="shrink-0">
                          {selectedQuestion.status === 'open' ? (
                            <button
                              className="btn-danger text-xs px-3 py-1.5 rounded-lg"
                              onClick={() => closeQuestion(selectedQuestion.id)}
                            >
                              Kapat
                            </button>
                          ) : (
                            <button
                              className="btn-secondary text-xs px-3 py-1.5 rounded-lg"
                              onClick={() => reopenQuestion(selectedQuestion.id)}
                            >
                              Yeniden Aç
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Thread */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {messages.length === 0 && (
                      <p className="text-center text-sm py-6" style={{ color: '#94a3b8' }}>Henüz mesaj yok. İlk yanıtı siz yazın!</p>
                    )}
                    {messages.map((m) => {
                      const isMe = m.created_by === userId
                      return (
                        <div key={m.id} className={`flex gap-2.5 group/msg ${isMe ? 'flex-row-reverse' : ''}`}>
                          <div
                            className="w-8 h-8 shrink-0 rounded-xl flex items-center justify-center text-xs font-bold"
                            style={isMe
                              ? { background: 'linear-gradient(135deg, #2abbd5, #2288c9)', color: '#fff' }
                              : { background: '#e2e8f0', color: '#475569' }
                            }
                          >
                            {(msgAuthors[m.created_by] || '?')[0].toUpperCase()}
                          </div>
                          <div className={`max-w-[75%] ${isMe ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] font-semibold" style={{ color: '#475569' }}>
                                {isMe ? 'Sen' : (msgAuthors[m.created_by] || 'Bilinmiyor')}
                              </span>
                              <span className="text-[10px]" style={{ color: '#94a3b8' }}>{timeAgo(m.created_at)}</span>
                              {(isAdmin || isMe) && (
                                <button
                                  onClick={() => deleteMessage(m.id)}
                                  title="Mesajı sil"
                                  className="opacity-0 group-hover/msg:opacity-100 transition-opacity w-4 h-4 flex items-center justify-center rounded"
                                  style={{ color: '#ef4444' }}
                                >
                                  <svg width="10" height="10" viewBox="0 0 14 14" fill="none"><path d="M1 3h12M5 3V2h4v1M2 3l1 9h8l1-9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                </button>
                              )}
                            </div>
                            <div
                              className="px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed"
                              style={isMe
                                ? { background: 'linear-gradient(135deg, #2288c9 0%, #0d7ab8 100%)', color: '#fff', borderBottomRightRadius: '4px' }
                                : { background: '#fff', color: '#1e293b', border: '1px solid rgba(0,0,0,0.07)', borderBottomLeftRadius: '4px' }
                              }
                            >
                              {m.content}
                              {/* Dosya eki */}
                              {m.attachment_url && (
                                <div className="mt-2">
                                  {/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(m.attachment_url) ? (
                                    <div>
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={m.attachment_url}
                                        alt={m.attachment_name || 'Görsel'}
                                        className="max-w-full rounded-xl"
                                        style={{ maxHeight: 220, objectFit: 'contain', cursor: 'pointer' }}
                                        onClick={() => window.open(m.attachment_url!, '_blank')}
                                      />
                                      <button
                                        className="mt-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg"
                                        style={{ background: '#ede9fe', color: '#7c3aed' }}
                                        onClick={() => openAnnotationForUrl(m.attachment_url!, m.attachment_name || 'Görsel')}
                                      >
                                        📌 Annotasyon Aç
                                      </button>
                                    </div>
                                  ) : (
                                    <a
                                      href={m.attachment_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium"
                                      style={isMe
                                        ? { background: 'rgba(255,255,255,0.2)', color: '#fff' }
                                        : { background: '#e0f2fe', color: '#2288c9' }
                                      }
                                    >
                                      📎 {m.attachment_name || 'Dosyayı İndir'}
                                    </a>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    <div ref={msgEndRef} />
                  </div>

                  {/* Reply box */}
                  <div className="p-3 border-t space-y-2" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
                    {selectedQuestion.status === 'closed' ? (
                      <p className="text-center text-xs py-2" style={{ color: '#94a3b8' }}>Bu soru kapatılmış. Yeni mesaj eklenemez.</p>
                    ) : (
                      <>
                        {/* Hidden file input */}
                        <input
                          ref={msgAttachRef}
                          type="file"
                          className="hidden"
                          onChange={(e) => setMsgAttachFile(e.target.files?.[0] || null)}
                        />
                        {/* Attached file preview */}
                        {msgAttachFile && (
                          <div
                            className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium"
                            style={{ background: '#e0f2fe', color: '#2288c9', border: '1px solid #bae6fd' }}
                          >
                            <span>📎 {msgAttachFile.name}</span>
                            <span className="ml-auto" style={{ color: '#64748b' }}>
                              {(msgAttachFile.size / 1024).toFixed(0)} KB
                            </span>
                            <button
                              onClick={() => { setMsgAttachFile(null); if (msgAttachRef.current) msgAttachRef.current.value = '' }}
                              className="shrink-0 hover:text-red-500"
                            >
                              ✕
                            </button>
                          </div>
                        )}
                        <div className="flex gap-2">
                          {/* Attach button */}
                          <button
                            title="Dosya ekle"
                            onClick={() => msgAttachRef.current?.click()}
                            className="shrink-0 px-2.5 py-2 rounded-xl text-sm transition-colors"
                            style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' }}
                          >
                            📎
                          </button>
                          <input
                            className="input text-sm flex-1"
                            placeholder="Mesajınızı yazın..."
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() } }}
                          />
                          <button
                            className="btn-primary text-sm px-4 py-2 rounded-xl font-semibold disabled:opacity-50"
                            onClick={sendReply}
                            disabled={replyLoading || (!replyText.trim() && !msgAttachFile)}
                          >
                            {replyLoading ? '...' : 'Gönder'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════ GÜNCELLEMELERİ TABI ══════════════════════ */}
        {activeTab === 'updates' && (
          <div className="c-tab-content grid grid-cols-1 lg:grid-cols-5 gap-5">

            {/* Sol: Feed */}
            <div className="lg:col-span-2 space-y-3" style={isMobile && selectedUpdate ? { display: 'none' } : {}}>
              {isAdmin && (
                <button
                  className="w-full btn-primary text-sm py-2.5 rounded-xl font-semibold"
                  onClick={() => setShowNewUpdate((p) => !p)}
                >
                  + Yeni Güncelleme Paylaş
                </button>
              )}

              {isAdmin && showNewUpdate && (
                <div className="card p-4 space-y-3">
                  <p className="text-sm font-bold" style={{ color: '#0d1a2a' }}>Yeni Güncelleme</p>
                  <input className="input text-sm w-full" placeholder="Başlık *" value={newUpdate.title} onChange={(e) => setNewUpdate((p) => ({ ...p, title: e.target.value }))} />
                  <input className="input text-sm w-full" placeholder="Kısa özet" value={newUpdate.summary} onChange={(e) => setNewUpdate((p) => ({ ...p, summary: e.target.value }))} />
                  <textarea className="input text-sm w-full resize-none" rows={4} placeholder="Detay (madde madde)" value={newUpdate.detail} onChange={(e) => setNewUpdate((p) => ({ ...p, detail: e.target.value }))} />
                  <select className="input text-sm" value={newUpdate.tag} onChange={(e) => setNewUpdate((p) => ({ ...p, tag: e.target.value as UIUpdateTag }))}>
                    {TAG_OPTIONS.map((t) => <option key={t}>{t}</option>)}
                  </select>
                  {/* Dosya eki */}
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: '#64748b' }}>Dosya Ekle (opsiyonel)</label>
                    <input
                      ref={updateAttachRef}
                      type="file"
                      className="block w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button className="btn-primary text-sm py-2 px-4 rounded-lg flex-1" onClick={createUpdate}>Paylaş</button>
                    <button className="btn-secondary text-sm py-2 px-3 rounded-lg" onClick={() => { setShowNewUpdate(false); if (updateAttachRef.current) updateAttachRef.current.value = '' }}>İptal</button>
                  </div>
                </div>
              )}

              {updates.length === 0 ? (
                <div className="card p-8 text-center">
                  <div className="text-3xl mb-2">📢</div>
                  <p className="text-sm font-medium" style={{ color: '#64748b' }}>Henüz güncelleme yok</p>
                </div>
              ) : (
                updates.map((u) => {
                  const tagStyle = TAG_COLORS[u.tag]
                  const isSelected = selectedUpdate?.id === u.id
                  const atts = updateAttachments[u.id] || []
                  return (
                    <div key={u.id} className="relative group">
                      <button
                        onClick={() => openUpdate(u)}
                        className="w-full text-left card p-4 space-y-2 transition-all duration-150"
                        style={isSelected ? { border: '2px solid #2288c9', background: '#f0f9ff' } : {}}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-bold leading-tight pr-5" style={{ color: '#0d1a2a' }}>{u.title}</span>
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold shrink-0" style={{ background: tagStyle.bg, color: tagStyle.color }}>{u.tag}</span>
                        </div>
                        {u.summary && <p className="text-xs" style={{ color: '#64748b' }}>{u.summary}</p>}
                        <div className="flex items-center justify-between">
                          <span className="text-[11px]" style={{ color: '#94a3b8' }}>{timeAgo(u.created_at)}</span>
                          {atts.length > 0 && (
                            <span className="text-[11px] px-1.5 py-0.5 rounded-full" style={{ background: '#f1f5f9', color: '#475569' }}>
                              📎 {atts.length}
                            </span>
                          )}
                        </div>
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => deleteUpdate(u)}
                          title="Güncellemeyi sil"
                          className="absolute top-2 right-2 w-6 h-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ background: '#fee2e2', color: '#dc2626' }}
                        >
                          <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M1 3h12M5 3V2h4v1M2 3l1 9h8l1-9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                      )}
                    </div>
                  )
                })
              )}
            </div>

            {/* Sağ: Detay */}
            <div className="lg:col-span-3" style={isMobile && !selectedUpdate ? { display: 'none' } : {}}>
              {!selectedUpdate ? (
                <div className="card p-12 text-center h-full flex flex-col items-center justify-center">
                  <div className="text-5xl mb-4">📢</div>
                  <p className="text-base font-semibold" style={{ color: '#0d1a2a' }}>Bir güncelleme seçin</p>
                  <p className="text-sm mt-1" style={{ color: '#94a3b8' }}>Detayları görmek için sol listeden bir güncelleme seçin</p>
                </div>
              ) : (
                <div className="card flex flex-col h-[70vh]">
                  <div className="p-4 border-b" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
                    {isMobile && (
                      <button
                        onClick={() => setSelectedUpdate(null)}
                        className="flex items-center gap-1.5 text-xs font-semibold mb-3"
                        style={{ color: '#2288c9' }}
                      >
                        ← Geri
                      </button>
                    )}
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ background: TAG_COLORS[selectedUpdate.tag].bg, color: TAG_COLORS[selectedUpdate.tag].color }}>{selectedUpdate.tag}</span>
                          <span className="text-[11px]" style={{ color: '#94a3b8' }}>{timeAgo(selectedUpdate.created_at)}</span>
                        </div>
                        <h2 className="font-bold text-base" style={{ color: '#0d1a2a' }}>{selectedUpdate.title}</h2>
                        {selectedUpdate.summary && <p className="text-sm mt-1" style={{ color: '#475569' }}>{selectedUpdate.summary}</p>}
                      </div>
                    </div>
                    {selectedUpdate.detail && (
                      <div className="mt-3 p-3 rounded-xl text-sm whitespace-pre-wrap" style={{ background: '#f8fafc', color: '#334155', border: '1px solid rgba(0,0,0,0.05)' }}>
                        {selectedUpdate.detail}
                      </div>
                    )}
                    {/* Ekler */}
                    {(updateAttachments[selectedUpdate.id] || []).length > 0 && (
                      <div className="mt-3 space-y-1">
                        <p className="text-xs font-semibold" style={{ color: '#475569' }}>Ekler</p>
                        {(updateAttachments[selectedUpdate.id] || []).map((a) => (
                          <a key={a.id} href={a.file_url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 p-2 rounded-lg text-xs font-medium transition-colors"
                            style={{ background: '#f1f5f9', color: '#2288c9' }}
                          >
                            📎 {a.file_name}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Yorumlar */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    <p className="text-xs font-bold mb-2" style={{ color: '#64748b' }}>YORUMLAR ({updateComments.length})</p>
                    {updateComments.length === 0 && (
                      <p className="text-center text-sm py-4" style={{ color: '#94a3b8' }}>İlk yorumu siz yazın</p>
                    )}
                    {updateComments.map((c) => (
                      <div key={c.id} className="flex gap-2.5 group/cmt">
                        <div className="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-xs font-bold" style={{ background: '#e2e8f0', color: '#475569' }}>
                          {(updateCommentAuthors[c.created_by] || '?')[0].toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-[11px] font-semibold" style={{ color: '#475569' }}>{updateCommentAuthors[c.created_by] || 'Bilinmiyor'}</span>
                            <span className="text-[10px]" style={{ color: '#94a3b8' }}>{timeAgo(c.created_at)}</span>
                            {(isAdmin || c.created_by === userId) && (
                              <button
                                onClick={() => deleteUpdateComment(c.id)}
                                title="Yorumu sil"
                                className="opacity-0 group-hover/cmt:opacity-100 transition-opacity w-4 h-4 flex items-center justify-center rounded"
                                style={{ color: '#ef4444' }}
                              >
                                <svg width="10" height="10" viewBox="0 0 14 14" fill="none"><path d="M1 3h12M5 3V2h4v1M2 3l1 9h8l1-9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                              </button>
                            )}
                          </div>
                          <p className="text-sm" style={{ color: '#334155' }}>{c.content}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="p-3 border-t" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
                    <div className="flex gap-2">
                      <input
                        className="input text-sm flex-1"
                        placeholder="Yorum yaz..."
                        value={updateCommentText}
                        onChange={(e) => setUpdateCommentText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendUpdateComment() } }}
                      />
                      <button
                        className="btn-primary text-sm px-4 py-2 rounded-xl disabled:opacity-50"
                        onClick={sendUpdateComment}
                        disabled={updateCommentLoading || !updateCommentText.trim()}
                      >
                        {updateCommentLoading ? '...' : 'Gönder'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════ DOSYALAR TABI ══════════════════════ */}
        {activeTab === 'files' && (
          <div className="c-tab-content space-y-4">

            {/* Araç çubuğu */}
            <div className={isMobile ? 'space-y-2' : 'flex items-center gap-3 flex-wrap'}>
              <input
                className="input text-sm w-full"
                placeholder="Dosya ara..."
                value={fileSearch}
                onChange={(e) => setFileSearch(e.target.value)}
              />
              <div className={isMobile ? 'flex gap-2' : 'flex items-center gap-3'}>
                {allFileTags.length > 0 && (
                  <select className="input text-sm flex-1" value={fileTagFilter} onChange={(e) => setFileTagFilter(e.target.value)}>
                    <option value="">Tüm etiketler</option>
                    {allFileTags.map((t) => <option key={t}>{t}</option>)}
                  </select>
                )}
                <button className="btn-primary text-sm px-4 py-2 rounded-xl font-semibold shrink-0" onClick={() => setShowNewFile((p) => !p)}>
                  + Dosya Ekle
                </button>
              </div>
            </div>

            {/* Yeni dosya formu */}
            {showNewFile && (
              <div className="card p-4 space-y-3">
                <p className="text-sm font-bold" style={{ color: '#0d1a2a' }}>Yeni Dosya Paylaş</p>

                {/* Cihazdan yükleme */}
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: '#64748b' }}>Cihazdan Yükle</label>
                  <input
                    ref={filesUploadRef}
                    type="file"
                    accept="image/*,application/pdf,video/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar"
                    className="block w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) {
                        setNewFile((p) => ({
                          ...p,
                          name: p.name || f.name.replace(/\.[^/.]+$/, ''),
                          file_type: detectFileType(f),
                        }))
                      }
                    }}
                  />
                </div>

                {/* Veya URL */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px" style={{ background: '#e2e8f0' }} />
                  <span className="text-xs shrink-0" style={{ color: '#94a3b8' }}>veya URL ile</span>
                  <div className="flex-1 h-px" style={{ background: '#e2e8f0' }} />
                </div>
                <input
                  className="input text-sm w-full"
                  placeholder="URL (görsel/pdf/video linki)"
                  value={newFile.file_url}
                  onChange={(e) => setNewFile((p) => ({ ...p, file_url: e.target.value }))}
                />

                <div className="grid grid-cols-2 gap-3">
                  <input className="input text-sm" placeholder="Dosya adı (opsiyonel)" value={newFile.name} onChange={(e) => setNewFile((p) => ({ ...p, name: e.target.value }))} />
                  <select className="input text-sm" value={newFile.file_type} onChange={(e) => setNewFile((p) => ({ ...p, file_type: e.target.value as UIFileType }))}>
                    {(Object.keys(FILE_TYPE_LABELS) as UIFileType[]).map((k) => <option key={k} value={k}>{FILE_TYPE_LABELS[k]}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input className="input text-sm" placeholder="Etiket (örn. v1.2)" value={newFile.tag} onChange={(e) => setNewFile((p) => ({ ...p, tag: e.target.value }))} />
                  <input className="input text-sm" placeholder="Figma URL (opsiyonel)" value={newFile.figma_url} onChange={(e) => setNewFile((p) => ({ ...p, figma_url: e.target.value }))} />
                </div>
                <div className="flex gap-2">
                  <button
                    className="btn-primary text-sm py-2 px-4 rounded-lg flex-1 disabled:opacity-50"
                    onClick={createFile}
                    disabled={fileUploading}
                  >
                    {fileUploading ? 'Yükleniyor...' : 'Ekle'}
                  </button>
                  <button
                    className="btn-secondary text-sm py-2 px-3 rounded-lg"
                    onClick={() => { setShowNewFile(false); setNewFile({ name: '', file_url: '', file_type: 'image', tag: '', figma_url: '' }); if (filesUploadRef.current) filesUploadRef.current.value = '' }}
                  >
                    İptal
                  </button>
                </div>
              </div>
            )}

            {/* Dosya + yorum grid */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

              {/* Dosya listesi */}
              <div className="lg:col-span-3 space-y-2">
                {filteredFiles.length === 0 ? (
                  <div className="card p-10 text-center">
                    <div className="text-3xl mb-2">📁</div>
                    <p className="text-sm font-medium" style={{ color: '#64748b' }}>Henüz dosya yok</p>
                  </div>
                ) : (
                  filteredFiles.map((f) => {
                    const isSelected = selectedFile?.id === f.id
                    return (
                      <button
                        key={f.id}
                        onClick={() => openFileDetail(f)}
                        className="w-full text-left card p-4 transition-all duration-150"
                        style={isSelected ? { border: '2px solid #2288c9', background: '#f0f9ff' } : {}}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                            style={{ background: '#f1f5f9' }}
                          >
                            {f.file_type === 'image' ? '🖼️' : f.file_type === 'pdf' ? '📄' : f.file_type === 'video' ? '🎬' : f.file_type === 'link' ? '🔗' : f.file_type === 'doc' ? '📝' : '📎'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate" style={{ color: '#0d1a2a' }}>{f.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[11px]" style={{ color: '#94a3b8' }}>{FILE_TYPE_LABELS[f.file_type]}</span>
                              {f.tag && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: '#e2e8f0', color: '#475569' }}>{f.tag}</span>}
                              {f.size_bytes && <span className="text-[11px]" style={{ color: '#94a3b8' }}>{formatBytes(f.size_bytes)}</span>}
                              <span className="text-[11px]" style={{ color: '#94a3b8' }}>{timeAgo(f.created_at)}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <a
                              href={f.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors"
                              style={{ background: '#e0f2fe', color: '#2288c9' }}
                            >
                              {f.file_type === 'link' ? 'Aç' : 'İndir'}
                            </a>
                            {f.figma_url && (
                              <a
                                href={f.figma_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-xs px-2.5 py-1.5 rounded-lg font-medium"
                                style={{ background: '#ede9fe', color: '#7c3aed' }}
                              >
                                Figma
                              </a>
                            )}
                          </div>
                        </div>

                        {/* Görsel önizleme */}
                        {f.file_type === 'image' && isSelected && (
                          <div className="mt-3 rounded-xl overflow-hidden border" style={{ borderColor: 'rgba(0,0,0,0.07)' }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={f.file_url}
                              alt={f.name}
                              className="w-full object-contain max-h-64 cursor-zoom-in"
                              style={{ background: '#f8fafc' }}
                              onClick={(e) => { e.stopPropagation(); window.open(f.file_url, '_blank') }}
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                            />
                            <div className="px-3 py-1.5 flex items-center justify-between gap-3" style={{ background: '#f8fafc' }}>
                              <a
                                href={f.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-xs font-medium"
                                style={{ color: '#2288c9' }}
                              >
                                Tam boyut aç ↗
                              </a>
                              <button
                                className="text-xs font-semibold px-2.5 py-1 rounded-lg"
                                style={{ background: '#ede9fe', color: '#7c3aed' }}
                                onClick={(e) => { e.stopPropagation(); openAnnotationForUrl(f.file_url, f.name) }}
                              >
                                📌 Annotasyon
                              </button>
                            </div>
                          </div>
                        )}
                      </button>
                    )
                  })
                )}
              </div>

              {/* Dosya yorumları */}
              <div className="lg:col-span-2">
                {!selectedFile ? (
                  <div className="card p-8 text-center">
                    <div className="text-3xl mb-2">💭</div>
                    <p className="text-sm" style={{ color: '#94a3b8' }}>Yorum görmek için bir dosya seçin</p>
                  </div>
                ) : (
                  <div className="card flex flex-col" style={{ height: '400px' }}>
                    <div className="p-3 border-b" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
                      <p className="text-xs font-bold truncate" style={{ color: '#475569' }}>{selectedFile.name}</p>
                      <p className="text-[11px]" style={{ color: '#94a3b8' }}>Yorumlar ({(fileComments[selectedFile.id] || []).length})</p>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                      {(fileComments[selectedFile.id] || []).length === 0 && (
                        <p className="text-center text-xs py-4" style={{ color: '#94a3b8' }}>Henüz yorum yok</p>
                      )}
                      {(fileComments[selectedFile.id] || []).map((c) => (
                        <div key={c.id} className="flex gap-2">
                          <div className="w-6 h-6 shrink-0 rounded-lg flex items-center justify-center text-[10px] font-bold" style={{ background: '#e2e8f0', color: '#475569' }}>
                            {(fileCommentAuthors[c.created_by] || '?')[0].toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] font-semibold" style={{ color: '#475569' }}>{fileCommentAuthors[c.created_by] || 'Bilinmiyor'}</span>
                              <span className="text-[9px]" style={{ color: '#94a3b8' }}>{timeAgo(c.created_at)}</span>
                            </div>
                            <p className="text-xs" style={{ color: '#334155' }}>{c.content}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="p-2.5 border-t" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
                      <div className="flex gap-1.5">
                        <input
                          className="input text-xs flex-1 py-1.5"
                          placeholder="Yorum..."
                          value={fileCommentText}
                          onChange={(e) => setFileCommentText(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendFileComment() } }}
                        />
                        <button
                          className="btn-primary text-xs px-3 py-1.5 rounded-lg disabled:opacity-50"
                          onClick={sendFileComment}
                          disabled={fileCommentLoading || !fileCommentText.trim()}
                        >
                          {fileCommentLoading ? '...' : 'Gönder'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════ GÖRSELLER (ANNOTASYON) TABI ══════════════════ */}
        {activeTab === 'annotations' && (
          !selectedAnnImage ? (

            /* ── Gallery View ── */
            <div className="c-tab-content">
              <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
                <div>
                  <h2 className="text-base font-bold" style={{ color: '#0d1a2a' }}>Görsel Annotasyon</h2>
                  <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>Görseller üzerine pin bırakarak yorum ve geri bildirim verin</p>
                </div>
                <button
                  className="btn-primary text-sm py-2 px-4 rounded-xl font-semibold"
                  onClick={() => setShowNewAnnImage((p) => !p)}
                >
                  + Görsel Ekle
                </button>
              </div>

              {/* Yeni görsel formu */}
              {showNewAnnImage && (
                <div
                  className="p-5 mb-5 rounded-2xl space-y-3"
                  style={{ background: 'rgba(240,249,255,0.8)', border: '1.5px solid rgba(34,136,201,0.2)', boxShadow: '0 2px 12px rgba(34,136,201,0.07)' }}
                >
                  <p className="text-sm font-bold" style={{ color: '#0d1a2a' }}>Yeni Görsel Ekle</p>
                  <input
                    className="input text-sm w-full"
                    placeholder="Başlık *"
                    value={newAnnImage.title}
                    onChange={(e) => setNewAnnImage((p) => ({ ...p, title: e.target.value }))}
                  />
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: '#64748b' }}>Dosyadan yükle (PNG/JPG/GIF/WebP)</label>
                    <input
                      ref={annFileRef}
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp"
                      className="block w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px" style={{ background: '#e2e8f0' }} />
                    <span className="text-xs" style={{ color: '#94a3b8' }}>veya URL</span>
                    <div className="flex-1 h-px" style={{ background: '#e2e8f0' }} />
                  </div>
                  <input
                    className="input text-sm w-full"
                    placeholder="Görsel URL (https://...)"
                    value={newAnnImage.image_url}
                    onChange={(e) => setNewAnnImage((p) => ({ ...p, image_url: e.target.value }))}
                  />
                  <textarea
                    className="input text-sm w-full resize-none"
                    rows={2}
                    placeholder="Açıklama (opsiyonel)"
                    value={newAnnImage.description}
                    onChange={(e) => setNewAnnImage((p) => ({ ...p, description: e.target.value }))}
                  />
                  <div className="flex gap-2">
                    <button
                      className="btn-primary text-sm py-2 px-4 rounded-lg flex-1 disabled:opacity-50"
                      onClick={createAnnImage}
                      disabled={annUploading || !newAnnImage.title.trim()}
                    >
                      {annUploading ? 'Yükleniyor...' : 'Ekle'}
                    </button>
                    <button
                      className="btn-secondary text-sm py-2 px-3 rounded-lg"
                      onClick={() => { setShowNewAnnImage(false); setNewAnnImage({ title: '', image_url: '', description: '' }) }}
                    >
                      İptal
                    </button>
                  </div>
                </div>
              )}

              {/* Image grid */}
              {annImages.length === 0 ? (
                <div className="card p-16 text-center">
                  <div className="text-5xl mb-4">🖼️</div>
                  <p className="text-base font-semibold" style={{ color: '#0d1a2a' }}>Henüz görsel eklenmedi</p>
                  <p className="text-sm mt-1" style={{ color: '#94a3b8' }}>Görsel ekleyip üzerine pin bırakın</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {annImages.map((img) => (
                    <div
                      key={img.id}
                      className="card overflow-hidden"
                      style={{ cursor: 'pointer', transition: 'transform 0.15s ease, box-shadow 0.15s ease' }}
                      onMouseEnter={(e) => {
                        const el = e.currentTarget as HTMLElement
                        el.style.transform = 'translateY(-2px)'
                        el.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)'
                      }}
                      onMouseLeave={(e) => {
                        const el = e.currentTarget as HTMLElement
                        el.style.transform = 'none'
                        el.style.boxShadow = ''
                      }}
                      onClick={() => openAnnImage(img)}
                    >
                      <div className="relative w-full" style={{ paddingBottom: '56.25%', background: '#0d1a2a', overflow: 'hidden' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.image_url}
                          alt={img.title}
                          className="absolute inset-0 w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0' }}
                        />
                        <div
                          className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[11px] font-bold"
                          style={{ background: 'rgba(0,0,0,0.6)', color: '#fff', backdropFilter: 'blur(4px)' }}
                        >
                          🖼️ {img.title.length > 18 ? img.title.slice(0, 18) + '…' : img.title}
                        </div>
                      </div>
                      <div className="p-3 flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate" style={{ color: '#0d1a2a' }}>{img.title}</p>
                          {img.description && (
                            <p className="text-xs mt-0.5 truncate" style={{ color: '#64748b' }}>{img.description}</p>
                          )}
                          <p className="text-[11px] mt-1" style={{ color: '#94a3b8' }}>{timeAgo(img.created_at)}</p>
                        </div>
                        {(isAdmin || img.created_by === userId) && (
                          <button
                            className="text-xs px-2 py-1 rounded-lg shrink-0"
                            style={{ color: '#dc2626', background: '#fee2e2' }}
                            onClick={(e) => { e.stopPropagation(); deleteAnnImage(img) }}
                          >
                            Sil
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          ) : (

            /* ── Annotation View ── */
            <div>

              {/* Back + Title + Controls */}
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    className="flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-xl shrink-0"
                    style={{ color: '#2288c9', background: 'rgba(34,136,201,0.08)' }}
                    onClick={() => { setSelectedAnnImage(null); setSelectedPin(null); setPendingPin(null); setZoom(1); setPan({ x: 0, y: 0 }) }}
                  >
                    ← Görseller
                  </button>
                  <div className="min-w-0">
                    <p className="text-base font-bold truncate" style={{ color: '#0d1a2a' }}>{selectedAnnImage.title}</p>
                    {selectedAnnImage.description && (
                      <p className="text-xs truncate" style={{ color: '#64748b' }}>{selectedAnnImage.description}</p>
                    )}
                  </div>
                </div>

                {/* Canvas controls */}
                <div className="flex items-center gap-2 flex-wrap shrink-0" style={isMobile ? { width: '100%', justifyContent: 'flex-start' } : {}}>
                  {/* Mode toggle */}
                  <div
                    className="flex rounded-xl overflow-hidden"
                    style={{ border: '1px solid rgba(0,0,0,0.1)', background: '#fff' }}
                  >
                    <button
                      className="px-3 py-1.5 text-xs font-semibold transition-all"
                      style={canvasMode === 'pin'
                        ? { background: 'linear-gradient(135deg, #2288c9, #0d7ab8)', color: '#fff' }
                        : { color: '#64748b' }}
                      onClick={() => setCanvasMode('pin')}
                      title="Pin bırakma modu"
                    >
                      ✏️ Pin
                    </button>
                    <button
                      className="px-3 py-1.5 text-xs font-semibold transition-all"
                      style={canvasMode === 'pan'
                        ? { background: 'linear-gradient(135deg, #2288c9, #0d7ab8)', color: '#fff' }
                        : { color: '#64748b' }}
                      onClick={() => setCanvasMode('pan')}
                      title="Kaydırma modu"
                    >
                      ✋ Kaydır
                    </button>
                  </div>

                  {/* Zoom controls */}
                  <div
                    className="flex items-center gap-1 rounded-xl px-2 py-1"
                    style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.1)' }}
                  >
                    <button
                      className="w-6 h-6 flex items-center justify-center rounded-lg text-base font-bold"
                      style={{ color: '#2288c9' }}
                      onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))}
                    >−</button>
                    <span className="text-xs font-mono font-semibold w-10 text-center" style={{ color: '#475569' }}>
                      {Math.round(zoom * 100)}%
                    </span>
                    <button
                      className="w-6 h-6 flex items-center justify-center rounded-lg text-base font-bold"
                      style={{ color: '#2288c9' }}
                      onClick={() => setZoom((z) => Math.min(5, z * 1.25))}
                    >+</button>
                    <button
                      className="ml-1 text-xs font-semibold px-2 py-0.5 rounded-lg"
                      style={{ color: '#64748b', background: '#f1f5f9' }}
                      onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}
                      title="Sıfırla"
                    >⊙</button>
                  </div>

                  {/* Pin stats */}
                  {annPins.length > 0 && (
                    <div
                      className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-xl"
                      style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.1)' }}
                    >
                      <span className="w-2 h-2 rounded-full inline-block" style={{ background: '#dc2626' }} />
                      <span style={{ color: '#dc2626' }}>{annPins.filter((p) => p.status === 'open').length} açık</span>
                      <span style={{ color: '#e2e8f0' }}>·</span>
                      <span className="w-2 h-2 rounded-full inline-block" style={{ background: '#16a34a' }} />
                      <span style={{ color: '#16a34a' }}>{annPins.filter((p) => p.status === 'resolved').length} çözüldü</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Canvas + Thread */}
              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 16, alignItems: isMobile ? 'stretch' : 'flex-start' }}>

                {/* Canvas area */}
                <div className="flex-1 min-w-0">

                  {/* Canvas clip container */}
                  <div
                    ref={canvasClipRef}
                    style={{
                      position: 'relative',
                      overflow: 'hidden',
                      background: '#0d1a2a',
                      borderRadius: 16,
                      minHeight: 360,
                      cursor: canvasMode === 'pan'
                        ? (isDragging ? 'grabbing' : 'grab')
                        : (pendingPin ? 'default' : 'crosshair'),
                      userSelect: 'none',
                      touchAction: 'none',
                      boxShadow: '0 4px 32px rgba(13,26,42,0.3)',
                    }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onClick={handleCanvasClick}
                  >
                    {/* Transform container */}
                    <div
                      style={{
                        position: 'relative',
                        transformOrigin: '0 0',
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                        display: 'block',
                        width: '100%',
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        ref={imgRef}
                        src={selectedAnnImage.image_url}
                        alt={selectedAnnImage.title}
                        style={{ width: '100%', display: 'block', pointerEvents: 'none' }}
                        draggable={false}
                        onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.2' }}
                      />

                      {/* Existing pins */}
                      {annPins.map((pin, idx) => {
                        const isPinSelected = selectedPin?.id === pin.id
                        const isHovered = hoveredPinId === pin.id
                        const pinColor = pin.status === 'resolved' ? '#16a34a' : '#dc2626'
                        const size = isPinSelected ? 36 : isHovered ? 32 : 28
                        const replyCount = (annPinReplies[pin.id] || []).length
                        return (
                          <div
                            key={pin.id}
                            style={{
                              position: 'absolute',
                              left: `${pin.x_pct}%`,
                              top: `${pin.y_pct}%`,
                              transform: 'translate(-50%, -50%)',
                              zIndex: isPinSelected ? 20 : (isHovered ? 15 : 10),
                              cursor: 'pointer',
                            }}
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedPin(isPinSelected ? null : pin)
                              if (!isPinSelected) setPendingPin(null)
                            }}
                            onMouseEnter={() => setHoveredPinId(pin.id)}
                            onMouseLeave={() => setHoveredPinId(null)}
                          >
                            {/* Circle marker */}
                            <div
                              style={{
                                width: size,
                                height: size,
                                borderRadius: '50%',
                                background: pinColor,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: isPinSelected
                                  ? `0 0 0 3px #fff, 0 0 0 6px ${pinColor}80, 0 4px 16px rgba(0,0,0,0.4)`
                                  : isHovered
                                  ? `0 0 0 2.5px #fff, 0 4px 12px rgba(0,0,0,0.4)`
                                  : `0 2px 8px rgba(0,0,0,0.35), 0 0 0 2px #fff`,
                                color: '#fff',
                                fontSize: 11,
                                fontWeight: 900,
                                transition: 'all 0.15s ease',
                              }}
                            >
                              {idx + 1}
                            </div>

                            {/* Hover tooltip */}
                            {isHovered && !isPinSelected && (
                              <div style={{ position: 'absolute', bottom: '115%', left: '50%', transform: 'translateX(-50%)', zIndex: 100, pointerEvents: 'auto' }}>
                                {pin.status === 'open' && isAdmin ? (
                                  <button
                                    style={{
                                      background: '#16a34a',
                                      color: '#fff',
                                      fontSize: 10,
                                      fontWeight: 700,
                                      padding: '4px 9px',
                                      borderRadius: 8,
                                      whiteSpace: 'nowrap',
                                      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                                      border: 'none',
                                      cursor: 'pointer',
                                    }}
                                    onClick={(e) => { e.stopPropagation(); togglePinStatus(pin) }}
                                  >
                                    ✓ Çözüldü İşaretle
                                  </button>
                                ) : (
                                  <div style={{
                                    background: pin.status === 'resolved' ? '#15803d' : '#1e293b',
                                    color: '#fff',
                                    fontSize: 10,
                                    fontWeight: 600,
                                    padding: '4px 9px',
                                    borderRadius: 8,
                                    whiteSpace: 'nowrap',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                                    pointerEvents: 'none',
                                  }}>
                                    {pin.status === 'resolved' ? '✓ Çözüldü' : (pin.label || `Pin ${idx + 1}`)}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Reply count badge */}
                            {replyCount > 0 && !isPinSelected && (
                              <div style={{
                                position: 'absolute',
                                top: -5,
                                right: -5,
                                width: 15,
                                height: 15,
                                borderRadius: '50%',
                                background: '#2288c9',
                                color: '#fff',
                                fontSize: 8,
                                fontWeight: 900,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: '1.5px solid #fff',
                              }}>
                                {replyCount}
                              </div>
                            )}
                          </div>
                        )
                      })}

                      {/* Pending pin marker */}
                      {pendingPin && (
                        <div
                          style={{
                            position: 'absolute',
                            left: `${pendingPin.x_pct}%`,
                            top: `${pendingPin.y_pct}%`,
                            transform: 'translate(-50%, -50%)',
                            zIndex: 30,
                            pointerEvents: 'none',
                          }}
                        >
                          <div style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            background: '#f59e0b',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 0 0 3px #fff, 0 0 0 6px rgba(245,158,11,0.4), 0 4px 12px rgba(0,0,0,0.3)',
                            color: '#fff',
                            fontSize: 18,
                            fontWeight: 900,
                          }}>
                            +
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Canvas hint */}
                    {annPins.length === 0 && !pendingPin && canvasMode === 'pin' && (
                      <div style={{
                        position: 'absolute',
                        bottom: 14,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'rgba(255,255,255,0.12)',
                        backdropFilter: 'blur(8px)',
                        color: '#fff',
                        fontSize: 12,
                        fontWeight: 600,
                        padding: '6px 16px',
                        borderRadius: 20,
                        whiteSpace: 'nowrap',
                        pointerEvents: 'none',
                        border: '1px solid rgba(255,255,255,0.18)',
                      }}>
                        ✏️ Görsel üzerine tıklayarak pin bırakın
                      </div>
                    )}
                  </div>

                  {/* Pending pin form */}
                  {pendingPin && (
                    <div
                      className="mt-3 p-4 rounded-2xl"
                      style={{ background: 'rgba(245,158,11,0.06)', border: '1.5px solid rgba(245,158,11,0.25)' }}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 900 }}>+</div>
                          <p className="text-sm font-bold" style={{ color: '#92400e' }}>Yeni Pin</p>
                          <span className="text-[11px] px-2 py-0.5 rounded-full font-mono" style={{ background: 'rgba(245,158,11,0.15)', color: '#92400e' }}>
                            {pendingPin.x_pct.toFixed(1)}% × {pendingPin.y_pct.toFixed(1)}%
                          </span>
                        </div>
                        <button onClick={() => setPendingPin(null)} style={{ color: '#94a3b8', fontSize: 18, lineHeight: 1 }}>✕</button>
                      </div>
                      <div className="flex gap-2">
                        <input
                          className="input text-sm flex-1"
                          placeholder="Pin başlığı (opsiyonel)"
                          value={newPinLabel}
                          onChange={(e) => setNewPinLabel(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') createPin() }}
                          autoFocus
                        />
                        <button className="btn-primary text-sm px-4 py-2 rounded-xl font-semibold" onClick={createPin}>Ekle</button>
                        <button className="btn-secondary text-sm px-3 py-2 rounded-xl" onClick={() => setPendingPin(null)}>İptal</button>
                      </div>
                    </div>
                  )}

                  {/* Pin list */}
                  {annPins.length > 0 && (
                    <div className="mt-4 space-y-1.5">
                      <p className="text-xs font-bold mb-2" style={{ color: '#94a3b8' }}>
                        PIN LİSTESİ ({annPins.length})
                      </p>
                      {annPins.map((pin, idx) => {
                        const isPinSelected = selectedPin?.id === pin.id
                        return (
                          <button
                            key={pin.id}
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all"
                            style={isPinSelected
                              ? { background: '#e0f2fe', border: '1px solid rgba(34,136,201,0.3)' }
                              : { background: '#fff', border: '1px solid rgba(0,0,0,0.07)' }}
                            onClick={() => { setSelectedPin(isPinSelected ? null : pin); setPendingPin(null) }}
                          >
                            <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, background: pin.status === 'resolved' ? '#16a34a' : '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 900 }}>
                              {idx + 1}
                            </div>
                            <span className="text-xs font-semibold flex-1 truncate" style={{ color: '#0d1a2a' }}>
                              {pin.label || `Pin ${idx + 1}`}
                            </span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={pin.status === 'open'
                              ? { background: '#fee2e2', color: '#dc2626' }
                              : { background: '#d1fae5', color: '#16a34a' }}>
                              {pin.status === 'open' ? 'Açık' : 'Çözüldü'}
                            </span>
                            {(annPinReplies[pin.id] || []).length > 0 && (
                              <span className="text-[10px]" style={{ color: '#94a3b8' }}>
                                {(annPinReplies[pin.id] || []).length} yorum
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Slide-in thread panel */}
                <div
                  style={isMobile
                    ? { display: selectedPin ? 'block' : 'none' }
                    : {
                        width: selectedPin ? 340 : 0,
                        overflow: 'hidden',
                        transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                        flexShrink: 0,
                      }
                  }
                >
                  {selectedPin && (
                    <div
                      style={{
                        width: isMobile ? '100%' : 340,
                        background: 'rgba(255,255,255,0.88)',
                        backdropFilter: 'blur(16px)',
                        borderRadius: 16,
                        border: '1px solid rgba(0,0,0,0.08)',
                        boxShadow: '0 4px 32px rgba(13,26,42,0.12)',
                        display: 'flex',
                        flexDirection: 'column',
                        maxHeight: isMobile ? '60vh' : '80vh',
                        overflow: 'hidden',
                      }}
                    >
                      {/* Thread header */}
                      <div className="p-4" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                        <div className="flex items-start justify-between gap-2 mb-2.5">
                          <div className="flex items-center gap-2">
                            <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, background: selectedPin.status === 'resolved' ? '#16a34a' : '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 900 }}>
                              {annPins.findIndex((p) => p.id === selectedPin.id) + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold truncate" style={{ color: '#0d1a2a' }}>
                                {selectedPin.label || `Pin ${annPins.findIndex((p) => p.id === selectedPin.id) + 1}`}
                              </p>
                            </div>
                          </div>
                          <button onClick={() => setSelectedPin(null)} style={{ color: '#94a3b8', fontSize: 18, lineHeight: 1, flexShrink: 0 }}>✕</button>
                        </div>

                        {/* Status + actions row */}
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className="px-2 py-0.5 rounded-full text-[11px] font-bold"
                              style={selectedPin.status === 'open'
                                ? { background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca' }
                                : { background: '#d1fae5', color: '#16a34a', border: '1px solid #a7f3d0' }}
                            >
                              {selectedPin.status === 'open' ? '● Açık' : '✓ Çözüldü'}
                            </span>
                            <span className="text-[11px]" style={{ color: '#94a3b8' }}>
                              {annPinAuthors[selectedPin.created_by] || 'Bilinmiyor'} · {timeAgo(selectedPin.created_at)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {isAdmin && (
                              <button
                                className="text-[11px] px-2.5 py-1 rounded-lg font-semibold"
                                style={selectedPin.status === 'open'
                                  ? { background: '#d1fae5', color: '#059669' }
                                  : { background: '#e0f2fe', color: '#2288c9' }}
                                onClick={() => togglePinStatus(selectedPin)}
                              >
                                {selectedPin.status === 'open' ? '✓ Çözüldü' : '↩ Aç'}
                              </button>
                            )}
                            {(isAdmin || selectedPin.created_by === userId) && (
                              <button
                                className="text-[11px] px-2.5 py-1 rounded-lg font-semibold"
                                style={{ background: '#fee2e2', color: '#dc2626' }}
                                onClick={() => deletePin(selectedPin)}
                              >
                                Sil
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Replies */}
                      <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ minHeight: 160 }}>
                        {(annPinReplies[selectedPin.id] || []).length === 0 ? (
                          <div className="text-center py-6">
                            <p className="text-sm" style={{ color: '#94a3b8' }}>Henüz yorum yok.</p>
                            <p className="text-xs mt-1" style={{ color: '#cbd5e1' }}>İlk yorumu siz yazın!</p>
                          </div>
                        ) : (
                          (annPinReplies[selectedPin.id] || []).map((reply) => {
                            const isMe = reply.created_by === userId
                            const authorName = annPinAuthors[reply.created_by] || 'Bilinmiyor'
                            const authorRole = annPinAuthorRoles[reply.created_by]
                            const initial = authorName[0].toUpperCase()
                            return (
                              <div key={reply.id} className={`flex gap-2.5 ${isMe ? 'flex-row-reverse' : ''}`}>
                                {/* Avatar */}
                                <div style={{
                                  width: 30,
                                  height: 30,
                                  borderRadius: '50%',
                                  flexShrink: 0,
                                  background: isMe
                                    ? 'linear-gradient(135deg, #2abbd5, #2288c9)'
                                    : authorRole === 'admin'
                                    ? 'linear-gradient(135deg, #7c3aed, #5b21b6)'
                                    : 'linear-gradient(135deg, #059669, #047857)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: '#fff',
                                  fontSize: 12,
                                  fontWeight: 700,
                                }}>
                                  {initial}
                                </div>

                                {/* Bubble */}
                                <div className={`max-w-[78%] flex flex-col gap-0.5 ${isMe ? 'items-end' : 'items-start'}`}>
                                  <div className={`flex items-center gap-1.5 flex-wrap ${isMe ? 'flex-row-reverse' : ''}`}>
                                    <span className="text-[11px] font-semibold" style={{ color: '#475569' }}>
                                      {isMe ? 'Sen' : authorName}
                                    </span>
                                    {authorRole && (
                                      <span
                                        className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                                        style={authorRole === 'admin'
                                          ? { background: '#ede9fe', color: '#7c3aed' }
                                          : { background: '#e0f2fe', color: '#2288c9' }}
                                      >
                                        {authorRole === 'admin' ? 'Admin' : 'Danışman'}
                                      </span>
                                    )}
                                    <span className="text-[10px]" style={{ color: '#cbd5e1' }}>{timeAgo(reply.created_at)}</span>
                                  </div>
                                  <div style={{
                                    padding: '8px 12px',
                                    borderRadius: isMe ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                                    fontSize: 13,
                                    lineHeight: 1.5,
                                    ...(isMe
                                      ? { background: 'linear-gradient(135deg, #2288c9 0%, #0d7ab8 100%)', color: '#fff' }
                                      : { background: '#f8fafc', color: '#1e293b', border: '1px solid rgba(0,0,0,0.06)' }),
                                  }}>
                                    {reply.content}
                                  </div>
                                </div>
                              </div>
                            )
                          })
                        )}
                      </div>

                      {/* Reply input */}
                      <div className="p-3" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                        <div className="flex gap-2">
                          <input
                            className="input text-sm flex-1"
                            placeholder="Yorum yazın..."
                            value={pinReplyText}
                            onChange={(e) => setPinReplyText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendPinReply() } }}
                          />
                          <button
                            className="btn-primary text-sm px-4 py-2 rounded-xl font-semibold disabled:opacity-50"
                            onClick={sendPinReply}
                            disabled={pinReplyLoading || !pinReplyText.trim()}
                          >
                            {pinReplyLoading ? '...' : '→'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

          )
        )}

      </main>
    </div>
  )
}

export default function ConsultantPage() {
  return (
    <FeatureGate feature="consultant_module">
      <ConsultantContent />
    </FeatureGate>
  )
}
