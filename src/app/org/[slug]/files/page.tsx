'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useOrg } from '@/lib/supabase/orgContext'
import { getCachedData, setCachedData } from '@/lib/pageDataCache'
import { useIsMobile } from '@/lib/useIsMobile'

// ── Tipler ────────────────────────────────────────────────────
interface LinkedTask { id: string; title: string }

interface OrgFile {
  id: string
  drive_file_id: string
  file_name: string
  file_size: number | null
  mime_type: string | null
  drive_url: string
  category: string
  description: string | null
  created_at: string
  uploader: { id: string; full_name: string | null; avatar_url: string | null } | null
  task_file_links: Array<{ task_id: string; tasks: { id: string; title: string } | null }>
}

// ── Kategori tanımları ────────────────────────────────────────
const CATEGORIES: { value: string; label: string; icon: string; color: string }[] = [
  { value: 'tumu',       label: 'Tümü',       icon: '◈',  color: '#2288c9' },
  { value: 'mekanik',    label: 'Mekanik',    icon: '⚙️', color: '#d97706' },
  { value: 'elektronik', label: 'Elektronik', icon: '⚡', color: '#7c3aed' },
  { value: 'yazilim',    label: 'Yazılım',    icon: '💻', color: '#059669' },
  { value: 'test',       label: 'Test',       icon: '🧪', color: '#db2777' },
  { value: 'genel',      label: 'Genel',      icon: '📂', color: '#6b7280' },
  { value: 'diger',      label: 'Diğer',      icon: '📄', color: '#92400e' },
]

const CATEGORY_MAP: Record<string, { label: string; icon: string; color: string }> = {}
CATEGORIES.forEach(c => { CATEGORY_MAP[c.value] = { label: c.label, icon: c.icon, color: c.color } })

// ── Yardımcı fonksiyonlar ─────────────────────────────────────
function formatBytes(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const EXT_MIME: Record<string, string> = {
  rar: 'application/x-rar-compressed', zip: 'application/zip',
  '7z': 'application/x-7z-compressed', tar: 'application/x-tar',
  gz: 'application/gzip', pdf: 'application/pdf',
  dwg: 'image/vnd.dwg', step: 'application/step', stp: 'application/step', stl: 'model/stl',
  mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo',
  mp3: 'audio/mpeg', wav: 'audio/wav',
}

function getMimeType(file: File): string {
  if (file.type) return file.type
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return EXT_MIME[ext] ?? 'application/octet-stream'
}

function fileIcon(mime: string | null, fileName?: string | null): string {
  const ext = fileName?.split('.').pop()?.toLowerCase() ?? ''
  if (mime?.startsWith('image/')) return '🖼️'
  if (mime === 'application/pdf' || ext === 'pdf') return '📕'
  if (mime?.includes('spreadsheet') || mime?.includes('excel') || ['xls','xlsx','csv'].includes(ext)) return '📊'
  if (mime?.includes('presentation') || mime?.includes('powerpoint') || ['ppt','pptx'].includes(ext)) return '📊'
  if (mime?.includes('document') || mime?.includes('word') || ['doc','docx'].includes(ext)) return '📝'
  if (mime?.includes('zip') || mime?.includes('rar') || mime?.includes('7z') || mime?.includes('tar') || mime?.includes('gzip') || ['zip','rar','7z','tar','gz','bz2'].includes(ext)) return '🗜️'
  if (mime?.includes('video') || ['mp4','mov','avi','mkv'].includes(ext)) return '🎬'
  if (mime?.includes('audio') || ['mp3','wav','flac','aac'].includes(ext)) return '🎵'
  if (mime?.includes('dwg') || mime?.includes('step') || mime?.includes('stl') || ['dwg','step','stp','stl','iges','igs'].includes(ext)) return '📐'
  return '📄'
}

// ── Ana Bileşen ───────────────────────────────────────────────
export default function FilesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { org, orgRole, userId, userEmail, avatarUrl, isAdmin, isPro, loading: orgLoading } = useOrg()

  const [files, setFiles] = useState<OrgFile[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState('tumu')
  const [search, setSearch] = useState('')
  const [driveReady, setDriveReady] = useState<boolean | null>(null)
  const [driveBanner, setDriveBanner] = useState<'success' | 'error' | null>(null)
  const [driveErrorMsg, setDriveErrorMsg] = useState<string | null>(null)

  // Upload modal
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadCategory, setUploadCategory] = useState('genel')
  const [uploadDescription, setUploadDescription] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Silme
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const isMobile = useIsMobile()

  // Yük kontrolü
  useEffect(() => {
    if (!orgLoading && !org) router.push('/workspaces')
  }, [orgLoading, org, router])

  const loadFiles = useCallback(async (background = false) => {
    if (!org) return
    const cacheKey = `files:${org.id}:${activeCategory}:${search}`
    const cached = getCachedData<OrgFile[]>(cacheKey)
    if (cached && !background) {
      setFiles(cached)
      setLoading(false)
    } else if (!cached) {
      setLoading(true)
    }
    try {
      const params = new URLSearchParams()
      if (activeCategory !== 'tumu') params.set('category', activeCategory)
      if (search) params.set('search', search)

      const res = await fetch(`/api/org/${org.slug}/files?${params.toString()}`)
      const data = await res.json()
      const newFiles: OrgFile[] = data.files ?? []
      setFiles(newFiles)
      setCachedData(cacheKey, newFiles)
    } catch {
      if (!cached) setFiles([])
    } finally {
      if (!cached || background) setLoading(false)
    }
  }, [org, activeCategory, search])

  useEffect(() => {
    if (org) {
      const cacheKey = `files:${org.id}:${activeCategory}:${search}`
      const cached = getCachedData<OrgFile[]>(cacheKey)
      loadFiles(!!cached)
      checkDriveStatus()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org?.id, activeCategory, search])

  async function checkDriveStatus() {
    try {
      const orgParam = org?.id ? `?orgId=${org.id}` : ''
      const res  = await fetch(`/api/drive/status${orgParam}`)
      const data = await res.json()
      // Bir kez true olduysa (URL'den veya önceki kontrolden) false'a çekme
      setDriveReady(prev => (prev === true ? true : data.connected))
    } catch {
      setDriveReady(prev => (prev === true ? true : false))
    }
  }

  // OAuth callback sonucunu yakala
  useEffect(() => {
    const connected = searchParams.get('drive_connected')
    const driveErr = searchParams.get('drive_error')
    if (connected === 'true') {
      setDriveReady(true)
      setDriveBanner('success')
      const url = new URL(window.location.href)
      url.searchParams.delete('drive_connected')
      window.history.replaceState({}, '', url.toString())
      setTimeout(() => setDriveBanner(null), 5000)
    } else if (driveErr) {
      setDriveBanner('error')
      setDriveErrorMsg(decodeURIComponent(driveErr))
      const url = new URL(window.location.href)
      url.searchParams.delete('drive_error')
      window.history.replaceState({}, '', url.toString())
    }
  }, [searchParams])

  // 3 adımlı resumable upload — dosya Vercel üzerinden geçmez, direkt Google Drive'a gider
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !org || !userId) return

    if (file.size > 50 * 1024 * 1024) {
      setUploadError("Dosya boyutu 50MB'ı aşamaz.")
      return
    }

    setUploading(true)
    setUploadError(null)
    setUploadProgress(`"${file.name}" hazırlanıyor...`)

    try {
      // 1. Upload oturumu başlat
      const sr = await fetch('/api/drive/upload-session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, mimeType: getMimeType(file), orgId: org?.id ?? '' }),
      })
      const sd = await sr.json().catch(() => ({}))
      if (!sr.ok || !sd.uploadUri) {
        if (sd.needsReconnect) setDriveReady(false)
        setUploadError(sd.error || 'Yükleme oturumu başlatılamadı.')
        return
      }

      // 2. Dosyayı chunk'lar halinde proxy → Google Drive'a yükle
      //    Her chunk ≤ 3MB → Vercel 4MB edge limitini aşmaz
      const CHUNK = 3 * 1024 * 1024
      const mime  = getMimeType(file)
      const proxyBase = `/api/drive/upload-proxy?uploadUri=${encodeURIComponent(sd.uploadUri)}`
      let offset = 0
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let df: Record<string, any> = {}

      while (offset < file.size) {
        const end   = Math.min(offset + CHUNK, file.size)
        const chunk = file.slice(offset, end)
        const range = `bytes ${offset}-${end - 1}/${file.size}`
        const pct   = Math.round((end / file.size) * 100)
        setUploadProgress(`"${file.name}" yükleniyor... ${pct}%`)

        const pr = await fetch(proxyBase, {
          method: 'POST',
          headers: { 'Content-Type': mime, 'X-Content-Range': range },
          body: chunk,
        })
        if (!pr.ok) { setUploadError(`Drive yükleme hatası (${pr.status}).`); return }

        const result = await pr.json().catch(() => ({}))
        if (result.partial) {
          offset = result.nextByte ?? end
        } else {
          df = result
          break
        }
      }

      if (!df.id) { setUploadError('Drive dosya kimliği alınamadı.'); return }

      // 3. İzin ve veritabanı kaydı
      setUploadProgress('Kaydediliyor...')
      const cr = await fetch('/api/drive/upload-complete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driveFileId: df.id, driveWebViewLink: df.webViewLink ?? null,
          fileName: df.name || file.name, fileSize: df.size ? Number(df.size) : file.size,
          mimeType: df.mimeType || getMimeType(file), orgId: org.id,
          userId, category: uploadCategory, description: uploadDescription || null,
        }),
      })
      const cd = await cr.json().catch(() => ({}))
      if (!cr.ok || cd.error) { setUploadError(cd.error || 'Veritabanı kaydı başarısız.'); return }

      setUploadProgress(null)
      setShowUploadModal(false)
      setUploadCategory('genel')
      setUploadDescription('')
      await loadFiles()
    } catch {
      setUploadError('Ağ hatası. Tekrar deneyin.')
    } finally {
      setUploading(false)
      setUploadProgress(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDelete(file: OrgFile) {
    if (!confirm(`"${file.file_name}" dosyasını kalıcı olarak silmek istiyor musunuz?\nDrive'dan ve tüm görev bağlantılarından kaldırılacak.`)) return
    setDeletingId(file.id)
    try {
      await fetch(`/api/org/${org!.slug}/files`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: file.id }),
      })
      await loadFiles()
    } finally {
      setDeletingId(null)
    }
  }

  // Loading / redirect
  if (orgLoading || !org) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f7fa' }}>
        <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: '#e5e7eb', borderTopColor: '#2288c9' }} />
      </div>
    )
  }

  const linkedTaskCount = (file: OrgFile) =>
    file.task_file_links?.filter(l => l.tasks).length ?? 0

  // ── Upload Modal (shared) ────────────────────────────────────────────────
  const UploadModal = showUploadModal && (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 16, background: 'rgba(0,0,0,0.45)' }}
      onClick={(e) => { if (e.target === e.currentTarget) setShowUploadModal(false) }}
    >
      <div style={{ width: '100%', maxWidth: isMobile ? '100%' : 460, background: '#fff', borderRadius: isMobile ? '20px 20px 0 0' : 18, border: '1px solid #e5e7eb', boxShadow: '0 20px 60px rgba(0,0,0,0.15)', overflow: 'hidden' }}>
        {isMobile && <div style={{ width: 36, height: 4, borderRadius: 2, background: '#e5e7eb', margin: '12px auto 0' }} />}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isMobile ? '12px 20px' : '16px 22px', borderBottom: '1px solid #f3f4f6', marginTop: isMobile ? 8 : 0 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0d1a2a', margin: 0 }}>📁 Dosya Yükle</h2>
          <button onClick={() => setShowUploadModal(false)} style={{ background: 'none', border: 'none', fontSize: 18, color: '#9ca3af', cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ padding: isMobile ? '16px 20px 32px' : '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>KATEGORİ</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {CATEGORIES.filter(c => c.value !== 'tumu').map(cat => (
                <button key={cat.value} onClick={() => setUploadCategory(cat.value)}
                  style={uploadCategory === cat.value
                    ? { fontSize: 12, fontWeight: 600, padding: '7px 4px', borderRadius: 8, border: `1px solid ${cat.color}50`, background: `${cat.color}15`, color: cat.color, cursor: 'pointer' }
                    : { fontSize: 12, fontWeight: 500, padding: '7px 4px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#f9fafb', color: '#6b7280', cursor: 'pointer' }
                  }
                >{cat.icon} {cat.label}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>AÇIKLAMA (isteğe bağlı)</label>
            <input type="text" placeholder="Bu dosya ne hakkında?" value={uploadDescription} onChange={e => setUploadDescription(e.target.value)}
              style={{ width: '100%', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', border: '1px solid #e5e7eb', background: '#f9fafb', color: '#374151', boxSizing: 'border-box' }} />
          </div>
          <input ref={fileInputRef} type="file" onChange={handleFileChange} className="hidden" disabled={uploading} />
          {uploadError && <div style={{ borderRadius: 8, padding: '9px 12px', fontSize: 12, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>{uploadError}</div>}
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            style={{ width: '100%', padding: '12px', borderRadius: 10, fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: 'none', cursor: uploading ? 'not-allowed' : 'pointer', background: uploading ? '#f1f5f9' : '#2288c9', color: uploading ? '#9ca3af' : '#fff' }}
          >
            {uploading ? (<><div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: '#e5e7eb', borderTopColor: '#2288c9' }} />{uploadProgress || 'Yükleniyor...'}</>) : '⬆️ Dosya Seç ve Yükle'}
          </button>
          <p style={{ fontSize: 11, textAlign: 'center', color: '#9ca3af', margin: 0 }}>Maks. 50MB · Tüm dosya türleri desteklenir</p>
        </div>
      </div>
    </div>
  )

  // ── Mobil Görünüm ──────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{ minHeight: '100vh', background: '#f0f4f8' }}>
        <div style={{ padding: '14px 14px 90px' }}>

          {/* Başlık */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0d1a2a', margin: 0 }}>📁 Dosya Merkezi</h1>
            {driveReady === true && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, padding: '4px 9px', borderRadius: 8, background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a' }} />Drive Bağlı
              </div>
            )}
            {driveReady === false && isAdmin && (
              <a href={`/api/drive/auth?userId=${userId}&orgId=${org.id}`} onClick={() => { document.cookie = `drive_return_to=/org/${org.slug}/files; path=/; max-age=1800` }}
                style={{ fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 9, background: 'linear-gradient(135deg, #4285f4, #34a853)', color: '#fff', textDecoration: 'none' }}
              >Drive Bağla</a>
            )}
          </div>

          {/* Bannerlar */}
          {driveBanner === 'success' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, marginBottom: 12, fontSize: 13, background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>
              ✅ Drive bağlandı!
              <button onClick={() => setDriveBanner(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}>✕</button>
            </div>
          )}
          {driveBanner === 'error' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, marginBottom: 12, fontSize: 12, background: '#fef2f2', color: '#991b1b', border: '1px solid #fca5a5' }}>
              ❌ {driveErrorMsg || 'Bağlantı başarısız'}
              <button onClick={() => setDriveBanner(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}>✕</button>
            </div>
          )}

          {/* 2×2 istatistik */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
            {[
              { label: 'Toplam Dosya', value: files.length, icon: '📁', color: '#2288c9', bg: '#eff6ff' },
              { label: 'Görev Bağlantısı', value: files.reduce((acc, f) => acc + linkedTaskCount(f), 0), icon: '🔗', color: '#059669', bg: '#f0fdf4' },
              { label: 'Toplam Boyut', value: formatBytes(files.reduce((acc, f) => acc + (f.file_size ?? 0), 0)) || '—', icon: '💾', color: '#d97706', bg: '#fffbeb' },
              { label: 'Kategoriler', value: new Set(files.map(f => f.category)).size, icon: '🏷️', color: '#7c3aed', bg: '#faf5ff' },
            ].map(stat => (
              <div key={stat.label} style={{ background: '#fff', borderRadius: 12, padding: '12px 14px', border: '1px solid #e5e7eb' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: stat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>{stat.icon}</div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: stat.color, lineHeight: 1 }}>{stat.value}</div>
                    <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{stat.label}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Arama */}
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#9ca3af' }}>🔍</span>
            <input type="text" placeholder="Dosya adı ara..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', borderRadius: 10, paddingLeft: 34, paddingRight: 12, paddingTop: 9, paddingBottom: 9, fontSize: 13, outline: 'none', border: '1px solid #e5e7eb', background: '#fff', color: '#374151', boxSizing: 'border-box' }} />
          </div>

          {/* Kategori filtre (yatay scroll) */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 12, msOverflowStyle: 'none', scrollbarWidth: 'none' } as React.CSSProperties}>
            {CATEGORIES.map(cat => (
              <button key={cat.value} onClick={() => setActiveCategory(cat.value)}
                style={{ flexShrink: 0, fontSize: 12, fontWeight: activeCategory === cat.value ? 700 : 500, padding: '6px 12px', borderRadius: 20, border: activeCategory === cat.value ? `1px solid ${cat.color}50` : '1px solid #e5e7eb', background: activeCategory === cat.value ? `${cat.color}15` : '#fff', color: activeCategory === cat.value ? cat.color : '#6b7280', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >{cat.icon} {cat.label}</button>
            ))}
          </div>

          {/* Dosya listesi */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: '#e5e7eb', borderTopColor: '#2288c9', margin: '0 auto 10px' }} />
              <p style={{ fontSize: 13, color: '#9ca3af' }}>Yükleniyor...</p>
            </div>
          ) : files.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', background: '#fff', borderRadius: 14, border: '1px dashed #e5e7eb' }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>📭</div>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#374151', margin: '0 0 4px' }}>{search ? 'Sonuç bulunamadı' : 'Henüz dosya yok'}</p>
              <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>
                {driveReady ? '"+" butonu ile dosya yükle' : isAdmin ? 'Önce Drive bağla' : 'Yönetici Drive bağlantısını kurunca görünür'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {files.map(file => {
                const cat = CATEGORY_MAP[file.category] ?? CATEGORY_MAP['diger']
                const taskCount = linkedTaskCount(file)
                const isDeleting = deletingId === file.id
                return (
                  <div key={file.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '13px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ width: 38, height: 38, borderRadius: 10, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                        {fileIcon(file.mime_type, file.file_name)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <a href={file.drive_url} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 14, fontWeight: 600, color: '#0d1a2a', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}
                        >{file.file_name}</a>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: `${cat.color}15`, color: cat.color, border: `1px solid ${cat.color}30` }}>{cat.icon} {cat.label}</span>
                          <span style={{ fontSize: 11, color: '#9ca3af' }}>{formatBytes(file.file_size)}</span>
                          {taskCount > 0 && <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 6, background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>🔗 {taskCount}</span>}
                        </div>
                        {file.uploader?.full_name && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>{file.uploader.full_name} · {new Date(file.created_at).toLocaleDateString('tr-TR')}</div>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                      <a href={file.drive_url} target="_blank" rel="noopener noreferrer"
                        style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 600, padding: '8px 0', borderRadius: 9, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#2288c9', textDecoration: 'none' }}
                      >Aç</a>
                      {(isAdmin || file.uploader?.id === userId) && (
                        <button onClick={() => handleDelete(file)} disabled={isDeleting}
                          style={{ flex: 1, fontSize: 13, fontWeight: 600, padding: '8px 0', borderRadius: 9, border: '1px solid #fee2e2', background: '#fff5f5', color: '#ef4444', cursor: 'pointer', opacity: isDeleting ? 0.5 : 1 }}
                        >{isDeleting ? '...' : 'Sil'}</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* FAB */}
        {driveReady === true && (
          <button onClick={() => setShowUploadModal(true)}
            style={{ position: 'fixed', right: 20, bottom: 28, width: 52, height: 52, borderRadius: 16, background: '#2288c9', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(34,136,201,0.4)', zIndex: 30 }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        )}

        {UploadModal}
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f7fa' }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 28px' }}>

        {/* ── Başlık ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0d1a2a', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22 }}>📁</span> Dosya Merkezi
            </h1>
            <p style={{ fontSize: 13, color: '#9ca3af', margin: '3px 0 0' }}>
              {org.name} projesine ait tüm dosyalar — kategorize edilmiş, görevlere bağlanabilir
            </p>
          </div>

          {/* Drive durumu + butonlar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {driveReady === true && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 8, background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#16a34a' }} />
                  Drive Bağlı
                </div>
                {isAdmin && (
                  <a
                    href={`/api/drive/auth?userId=${userId}&orgId=${org.id}`}
                    onClick={() => { document.cookie = `drive_return_to=/org/${org.slug}/files; path=/; max-age=1800` }}
                    style={{ fontSize: 12, padding: '5px 10px', borderRadius: 8, color: '#6b7280', border: '1px solid #e5e7eb', background: '#fff', textDecoration: 'none' }}
                    title="Drive bağlantısını yenile"
                  >
                    ↻ Yenile
                  </a>
                )}
                <button
                  onClick={() => setShowUploadModal(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 10, border: 'none', background: '#2288c9', color: '#fff', cursor: 'pointer', boxShadow: '0 2px 8px rgba(34,136,201,0.25)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#1d78b8' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#2288c9' }}
                >
                  ⬆️ Dosya Yükle
                </button>
              </>
            )}
            {driveReady === false && isAdmin && (
              <a
                href={`/api/drive/auth?userId=${userId}&orgId=${org.id}`}
                onClick={() => { document.cookie = `drive_return_to=/org/${org.slug}/files; path=/; max-age=1800` }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 10, background: 'linear-gradient(135deg, #4285f4, #34a853)', color: '#fff', textDecoration: 'none' }}
              >
                Google Drive Bağla
              </a>
            )}
          </div>
        </div>

        {/* ── Drive Banner ── */}
        {driveBanner === 'success' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 500, background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>
            ✅ Google Drive başarıyla bağlandı! Artık dosya yükleyebilirsiniz.
            <button onClick={() => setDriveBanner(null)} style={{ marginLeft: 'auto', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}>✕</button>
          </div>
        )}
        {driveBanner === 'error' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 500, background: '#fef2f2', color: '#991b1b', border: '1px solid #fca5a5' }}>
            ❌ Drive bağlantısı başarısız: {driveErrorMsg || 'Bilinmeyen hata'}
            <button onClick={() => setDriveBanner(null)} style={{ marginLeft: 'auto', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}>✕</button>
          </div>
        )}

        {/* ── İstatistik ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Toplam Dosya', value: files.length, icon: '📁', color: '#2288c9', bg: '#eff6ff' },
            { label: 'Görev Bağlantısı', value: files.reduce((acc, f) => acc + linkedTaskCount(f), 0), icon: '🔗', color: '#059669', bg: '#f0fdf4' },
            { label: 'Toplam Boyut', value: formatBytes(files.reduce((acc, f) => acc + (f.file_size ?? 0), 0)) || '—', icon: '💾', color: '#d97706', bg: '#fffbeb' },
            { label: 'Kategoriler', value: new Set(files.map(f => f.category)).size, icon: '🏷️', color: '#7c3aed', bg: '#faf5ff' },
          ].map(stat => (
            <div key={stat.label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: stat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, marginBottom: 8 }}>{stat.icon}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* ── Arama + Kategori Sekmeleri ── */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '12px 16px', marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          {/* Arama */}
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#9ca3af' }}>🔍</span>
            <input
              type="text"
              placeholder="Dosya adı ara..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', borderRadius: 8, paddingLeft: 32, paddingRight: 12, paddingTop: 8, paddingBottom: 8, fontSize: 13, outline: 'none', border: '1px solid #e5e7eb', background: '#f9fafb', color: '#374151', boxSizing: 'border-box' }}
            />
          </div>
          {/* Kategoriler */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {CATEGORIES.map(cat => (
              <button
                key={cat.value}
                onClick={() => setActiveCategory(cat.value)}
                style={activeCategory === cat.value
                  ? { fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 8, border: `1px solid ${cat.color}50`, background: `${cat.color}15`, color: cat.color, cursor: 'pointer' }
                  : { fontSize: 12, fontWeight: 500, padding: '5px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#f9fafb', color: '#6b7280', cursor: 'pointer' }
                }
              >
                {cat.icon} {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Dosya Listesi ── */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: '#e5e7eb', borderTopColor: '#2288c9', margin: '0 auto 12px' }} />
            <p style={{ fontSize: 13, color: '#9ca3af' }}>Yükleniyor...</p>
          </div>
        ) : files.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 24px', background: '#fff', border: '1px dashed #e5e7eb', borderRadius: 14 }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>📭</div>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#374151', margin: '0 0 6px' }}>
              {search ? 'Aramayla eşleşen dosya yok' : 'Henüz dosya yok'}
            </p>
            <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>
              {driveReady
                ? '"Dosya Yükle" butonu ile ilk dosyanı ekle'
                : isAdmin
                  ? 'Google Drive bağlayarak dosya yükleyebilirsin'
                  : 'Yönetici Drive bağlantısını kurduğunda dosyalar burada görünecek'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {files.map(file => {
              const cat = CATEGORY_MAP[file.category] ?? CATEGORY_MAP['diger']
              const taskCount = linkedTaskCount(file)
              const isDeleting = deletingId === file.id
              return (
                <div
                  key={file.id}
                  className="group"
                  style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '12px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', transition: 'box-shadow 0.15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)' }}
                >
                  {/* İkon */}
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                    {fileIcon(file.mime_type, file.file_name)}
                  </div>

                  {/* Bilgi */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                      <a
                        href={file.drive_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 14, fontWeight: 600, color: '#0d1a2a', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#2288c9' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#0d1a2a' }}
                      >
                        {file.file_name}
                      </a>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: `${cat.color}15`, color: cat.color, border: `1px solid ${cat.color}30`, flexShrink: 0 }}>
                        {cat.icon} {cat.label}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11.5, color: '#9ca3af' }}>
                        {formatBytes(file.file_size)}{file.file_size ? ' · ' : ''}{new Date(file.created_at).toLocaleDateString('tr-TR')}
                      </span>
                      {file.uploader?.full_name && (
                        <span style={{ fontSize: 11.5, color: '#9ca3af' }}>· {file.uploader.full_name}</span>
                      )}
                      {taskCount > 0 && (
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 6, background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>
                          🔗 {taskCount} görev
                        </span>
                      )}
                      {file.description && (
                        <span style={{ fontSize: 11.5, fontStyle: 'italic', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                          {file.description}
                        </span>
                      )}
                    </div>

                    {file.task_file_links?.length > 0 && (
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
                        {file.task_file_links.slice(0, 5).map(link => link.tasks && (
                          <span key={link.task_id} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: '#eff6ff', color: '#2288c9', border: '1px solid #bfdbfe' }}>
                            ✓ {link.tasks.title}
                          </span>
                        ))}
                        {file.task_file_links.length > 5 && (
                          <span style={{ fontSize: 11, color: '#9ca3af' }}>+{file.task_file_links.length - 5} daha</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Aksiyonlar */}
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <a
                      href={file.drive_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 12, fontWeight: 500, padding: '5px 12px', borderRadius: 8, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#2288c9', textDecoration: 'none' }}
                    >
                      Aç
                    </a>
                    {(isAdmin || file.uploader?.id === userId) && (
                      <button
                        onClick={() => handleDelete(file)}
                        disabled={isDeleting}
                        style={{ fontSize: 12, fontWeight: 500, padding: '5px 10px', borderRadius: 8, border: '1px solid #fee2e2', background: '#fff5f5', color: '#ef4444', cursor: 'pointer', opacity: isDeleting ? 0.5 : 1 }}
                      >
                        {isDeleting ? '...' : 'Sil'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {UploadModal}
    </div>
  )
}
