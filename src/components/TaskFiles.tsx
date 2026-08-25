'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import type { UserRole } from '@/types/database'

// ── Tipler ────────────────────────────────────────────────────
interface DriveFile {
  id: string
  drive_file_id: string
  file_name: string
  file_size: number | null
  mime_type: string | null
  drive_url: string
  created_at: string
}

interface OrgFile {
  id: string
  file_name: string
  file_size: number | null
  mime_type: string | null
  drive_url: string
  category: string
  description: string | null
  created_at: string
  task_file_links: Array<{ task_id: string }>
}

interface Props {
  taskId: string
  userId: string
  userRole: UserRole
  orgSlug?: string  // Yeni Dosya Merkezi için (opsiyonel, geriye uyumluluk)
  orgId?: string    // Yeni Dosya Merkezi için (opsiyonel, geriye uyumluluk)
}

// ── Kategori renkleri ────────────────────────────────────────
const CAT_COLORS: Record<string, string> = {
  mekanik: '#d97706', elektronik: '#7c3aed', yazilim: '#059669',
  test: '#db2777', genel: '#6b7280', diger: '#92400e',
}
const CAT_LABELS: Record<string, string> = {
  mekanik: 'Mekanik', elektronik: 'Elektronik', yazilim: 'Yazılım',
  test: 'Test', genel: 'Genel', diger: 'Diğer',
}
const CAT_ICONS: Record<string, string> = {
  mekanik: '⚙️', elektronik: '⚡', yazilim: '💻',
  test: '🧪', genel: '📂', diger: '📄',
}

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
  return '📄'
}

// ── Ana Bileşen ───────────────────────────────────────────────
export default function TaskFiles({ taskId, userId, userRole, orgSlug, orgId }: Props) {
  // Drive durumu
  const [driveReady, setDriveReady] = useState<boolean | null>(null)

  // Göreve bağlı proje dosyaları (yeni sistem)
  const [linkedFiles, setLinkedFiles] = useState<OrgFile[]>([])
  const [linkedLoading, setLinkedLoading] = useState(true)

  // Eski task_files (geriye uyumluluk)
  const [legacyFiles, setLegacyFiles] = useState<DriveFile[]>([])

  // Yeni dosya yükleme (proje arşivine + otomatik bağla)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [uploadCategory, setUploadCategory] = useState('genel')
  const [showUploadOptions, setShowUploadOptions] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // "Mevcut Dosyayı Bağla" modalı
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [allOrgFiles, setAllOrgFiles] = useState<OrgFile[]>([])
  const [orgFilesLoading, setOrgFilesLoading] = useState(false)
  const [linkingId, setLinkingId] = useState<string | null>(null)
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null)
  const [linkSearch, setLinkSearch] = useState('')

  const hasNewSystem = !!(orgSlug && orgId)

  useEffect(() => {
    checkStatus()
    if (hasNewSystem) loadLinkedFiles()
    loadLegacyFiles()
  // orgSlug ve orgId async yüklenebilir (/tasks/[id] rotasında); değişince yeniden çalıştır
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, orgSlug, orgId])

  async function checkStatus() {
    try {
      const url  = orgId ? `/api/drive/status?orgId=${orgId}` : '/api/drive/status'
      const res  = await fetch(url)
      const data = await res.json()
      setDriveReady(data.connected)
    } catch {
      setDriveReady(false)
    }
  }

  const loadLinkedFiles = useCallback(async () => {
    setLinkedLoading(true)
    setLoadError(null)
    try {
      // orgId doğrudan geçilirse slug→org lookup'u atla (daha hızlı + 404 önler)
      const params = new URLSearchParams({ taskId })
      if (orgId) params.set('orgId', orgId)
      const res = await fetch(`/api/org/${orgSlug}/files?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) {
        setLoadError(data.error || `Dosyalar yüklenemedi (HTTP ${res.status})`)
        setLinkedFiles([])
      } else {
        setLinkedFiles(data.files ?? [])
      }
    } catch (e) {
      setLoadError('Bağlantı hatası. Lütfen sayfayı yenileyin.')
      setLinkedFiles([])
    } finally {
      setLinkedLoading(false)
    }
  }, [orgSlug, taskId, orgId])

  async function loadLegacyFiles() {
    try {
      const res = await fetch(`/api/drive/files?taskId=${taskId}`)
      const data = await res.json()
      setLegacyFiles(data.files || [])
    } catch {
      setLegacyFiles([])
    }
  }

  // ── Yeni dosya yükle — 3 adımlı resumable upload (Vercel limitini aşar) ──
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

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
        body: JSON.stringify({ fileName: file.name, mimeType: getMimeType(file), orgId: orgId ?? '' }),
      })
      const sd = await sr.json().catch(() => ({}))
      if (!sr.ok || !sd.uploadUri) {
        if (sd.needsReconnect) {
          setDriveReady(false)  // UI'da "Bağla" butonunu göster
        }
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
          mimeType: df.mimeType || getMimeType(file), orgId: orgId ?? '',
          taskId, userId, category: uploadCategory,
        }),
      })
      const cd = await cr.json().catch(() => ({}))
      if (!cr.ok || cd.error) {
        setUploadError(cd.error || 'Veritabanı kaydı başarısız.')
        return
      }

      setUploadProgress(null)
      setShowUploadOptions(false)
      setUploadCategory('genel')
      await loadLinkedFiles()
    } catch {
      setUploadError('Bağlantı hatası. İnternet bağlantınızı kontrol edin.')
    } finally {
      setUploading(false)
      setUploadProgress(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // ── Eski dosya sil (legacy) ──
  async function handleDeleteLegacy(file: DriveFile) {
    if (!confirm(`"${file.file_name}" dosyasını silmek istiyor musunuz? Drive'dan da kaldırılacak.`)) return
    await fetch('/api/drive/files', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId: file.id }),
    })
    await loadLegacyFiles()
  }

  // ── Bağlantıyı kaldır (unlink) ──
  async function handleUnlink(orgFileId: string) {
    setUnlinkingId(orgFileId)
    try {
      await fetch(`/api/org/${orgSlug}/files/${orgFileId}/link`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      })
      await loadLinkedFiles()
    } finally {
      setUnlinkingId(null)
    }
  }

  // ── Org dosyalarını yükle (bağlama modalı için) ──
  async function openLinkModal() {
    setShowLinkModal(true)
    setOrgFilesLoading(true)
    try {
      const params = orgId ? `?orgId=${orgId}` : ''
      const res = await fetch(`/api/org/${orgSlug}/files${params}`)
      const data = await res.json()
      setAllOrgFiles(data.files ?? [])
    } catch {
      setAllOrgFiles([])
    } finally {
      setOrgFilesLoading(false)
    }
  }

  // ── Dosyayı göreve bağla ──
  async function handleLink(orgFileId: string) {
    setLinkingId(orgFileId)
    try {
      await fetch(`/api/org/${orgSlug}/files/${orgFileId}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, linkedBy: userId }),
      })
      await loadLinkedFiles()
      // Listeyi güncelle (zaten bağlıysa işaretle)
      const params = orgId ? `?orgId=${orgId}` : ''
      const res = await fetch(`/api/org/${orgSlug}/files${params}`)
      const data = await res.json()
      setAllOrgFiles(data.files ?? [])
    } finally {
      setLinkingId(null)
    }
  }

  const isLinkedToThis = (file: OrgFile) =>
    file.task_file_links?.some(l => l.task_id === taskId)

  const filteredOrgFiles = allOrgFiles.filter(f =>
    f.file_name.toLowerCase().includes(linkSearch.toLowerCase()) ||
    (f.description ?? '').toLowerCase().includes(linkSearch.toLowerCase())
  )

  return (
    <div className="card space-y-5">

      {/* ── BÖLÜM 1: Proje Dosyaları (yeni sistem — orgSlug/orgId gerektirir) ── */}
      {hasNewSystem && (<>
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-bold flex items-center gap-2" style={{ color: '#0d1a2a' }}>
              <span>📁</span> Proje Dosyaları
            </h2>
            <p className="text-xs mt-0.5" style={{ color: '#7acfe6' }}>
              Proje arşivinden bu göreve bağlı dosyalar
            </p>
          </div>

          {driveReady === true && (
            <div className="flex items-center gap-2">
              {/* Bağla butonu */}
              <button
                onClick={openLinkModal}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                style={{
                  background: 'rgba(34,136,201,0.1)',
                  color: '#2288c9',
                  border: '1px solid rgba(34,136,201,0.25)',
                }}
              >
                🔗 Bağla
              </button>

              {/* Yükle butonu */}
              <button
                onClick={() => setShowUploadOptions(v => !v)}
                disabled={uploading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                style={{
                  background: 'linear-gradient(135deg, #2288c9, #2abbd5)',
                  color: '#fff',
                  boxShadow: '0 2px 8px rgba(34,136,201,0.25)',
                }}
              >
                {uploading ? '...' : '⬆️ Yükle'}
              </button>
            </div>
          )}
        </div>

        {/* Upload seçenekleri (kategori seçimi) */}
        {showUploadOptions && driveReady && (
          <div
            className="mb-3 rounded-xl p-3 space-y-2"
            style={{ background: '#f0fbff', border: '1px solid #bee5f0' }}
          >
            <p className="text-xs font-semibold" style={{ color: '#0d1a2a' }}>Kategori seç:</p>
            <div className="flex flex-wrap gap-1.5">
              {(['mekanik', 'elektronik', 'yazilim', 'test', 'genel', 'diger'] as const).map(cat => (
                <button
                  key={cat}
                  onClick={() => setUploadCategory(cat)}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
                  style={uploadCategory === cat
                    ? { background: `${CAT_COLORS[cat]}25`, color: CAT_COLORS[cat], border: `1px solid ${CAT_COLORS[cat]}50` }
                    : { background: '#fff', color: '#6b7280', border: '1px solid #e5e7eb' }
                  }
                >
                  {CAT_ICONS[cat]} {CAT_LABELS[cat]}
                </button>
              ))}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileChange}
              className="hidden"
              disabled={uploading}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all"
              style={{
                background: uploading ? '#f0fbff' : '#f8fcff',
                border: '2px dashed #bee5f0',
                color: '#2288c9',
                cursor: uploading ? 'not-allowed' : 'pointer',
              }}
            >
              {uploading ? (
                <>
                  <div className="w-3.5 h-3.5 rounded-full border-2 animate-spin" style={{ borderColor: '#bee5f0', borderTopColor: '#2288c9' }} />
                  {uploadProgress || 'Yükleniyor...'}
                </>
              ) : (
                <>Dosya Seç ve Proje Arşivine Yükle</>
              )}
            </button>
            {uploadError && (
              <div className="text-xs rounded-lg px-3 py-1.5" style={{ background: '#fee2e2', color: '#dc2626' }}>
                {uploadError}
              </div>
            )}
          </div>
        )}

        {/* Drive bağlı değil */}
        {driveReady === false && (
          <div className="text-center py-4">
            <p className="text-sm font-medium" style={{ color: '#182c3f' }}>
              {userRole === 'admin'
                ? <><a href={`/org/${orgSlug}/files`} className="underline" style={{ color: '#2288c9' }}>Dosyalar</a> sayfasından Drive bağlantısını kur</>
                : 'Dosya yükleme hazır değil'}
            </p>
          </div>
        )}

        {/* Hata */}
        {loadError && !linkedLoading && (
          <div className="text-xs rounded-xl px-4 py-3 flex items-start gap-2" style={{ background: '#fee2e2', color: '#dc2626' }}>
            <span>⚠️</span>
            <span>{loadError}</span>
          </div>
        )}

        {/* Yükleniyor */}
        {linkedLoading && (
          <div className="flex justify-center py-4">
            <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: '#bee5f0', borderTopColor: '#2288c9' }} />
          </div>
        )}

        {/* Bağlı dosya yok */}
        {!linkedLoading && linkedFiles.length === 0 && driveReady && (
          <div className="text-center py-5 rounded-xl" style={{ background: '#f8fcff', border: '1px dashed #bee5f0' }}>
            <p className="text-xs" style={{ color: '#7acfe6' }}>
              Bu göreve bağlı proje dosyası yok.
            </p>
            <p className="text-xs mt-1" style={{ color: '#bee5f0' }}>
              "Bağla" ile mevcut dosyaları ekle veya "Yükle" ile yeni dosya ekle.
            </p>
          </div>
        )}

        {/* Bağlı dosyalar listesi */}
        {!linkedLoading && linkedFiles.length > 0 && (
          <div className="space-y-2">
            {linkedFiles.map(file => {
              const cat = file.category
              const color = CAT_COLORS[cat] ?? '#6b7280'
              const label = CAT_LABELS[cat] ?? cat
              const icon = CAT_ICONS[cat] ?? '📄'
              const isUnlinking = unlinkingId === file.id

              return (
                <div
                  key={file.id}
                  className="flex items-center justify-between rounded-xl px-3 py-2.5"
                  style={{ background: '#f8fcff', border: '1px solid #e0f4fb' }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-xl shrink-0">{fileIcon(file.mime_type, file.file_name)}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <a
                          href={file.drive_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-semibold hover:underline truncate"
                          style={{ color: '#2288c9', maxWidth: 180 }}
                        >
                          {file.file_name}
                        </a>
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-md font-bold shrink-0"
                          style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}
                        >
                          {icon} {label}
                        </span>
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: '#7acfe6' }}>
                        {formatBytes(file.file_size)}
                        {file.file_size ? ' · ' : ''}
                        {new Date(file.created_at).toLocaleDateString('tr-TR')}
                        {file.description ? ` · ${file.description}` : ''}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <a
                      href={file.drive_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs px-2 py-1 rounded-lg font-medium"
                      style={{ background: '#f0fbff', color: '#2288c9', border: '1px solid #bee5f0' }}
                    >
                      Aç
                    </a>
                    {/* Bağlantıyı kaldır (admin veya üye) */}
                    <button
                      onClick={() => handleUnlink(file.id)}
                      disabled={isUnlinking}
                      className="text-xs px-2 py-1 rounded-lg font-medium disabled:opacity-50"
                      style={{ background: '#fff7ed', color: '#d97706', border: '1px solid #fed7aa' }}
                      title="Bu görevden bağlantıyı kaldır (dosya arşivden silinmez)"
                    >
                      {isUnlinking ? '...' : '✕ Kaldır'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      </>)}

      {/* ── BÖLÜM 2: Eski Görev Dosyaları (task_files, geriye uyumluluk) ── */}
      {legacyFiles.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="h-px flex-1" style={{ background: '#e0f4fb' }} />
            <span className="text-xs font-semibold" style={{ color: '#bee5f0' }}>Önceki Yüklemeler</span>
            <div className="h-px flex-1" style={{ background: '#e0f4fb' }} />
          </div>

          <div className="space-y-2">
            {legacyFiles.map(file => (
              <div
                key={file.id}
                className="flex items-center justify-between rounded-xl px-3 py-2.5 opacity-80"
                style={{ background: '#fafafa', border: '1px solid #e5e7eb' }}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-xl shrink-0">{fileIcon(file.mime_type, file.file_name)}</span>
                  <div className="min-w-0">
                    <a
                      href={file.drive_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold hover:underline truncate block"
                      style={{ color: '#2288c9' }}
                    >
                      {file.file_name}
                    </a>
                    <div className="text-xs" style={{ color: '#9ca3af' }}>
                      {formatBytes(file.file_size)}
                      {file.file_size ? ' · ' : ''}
                      {new Date(file.created_at).toLocaleDateString('tr-TR')}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <a
                    href={file.drive_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs px-2 py-1 rounded-lg font-medium"
                    style={{ background: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb' }}
                  >
                    Aç
                  </a>
                  {userRole === 'admin' && (
                    <button
                      onClick={() => handleDeleteLegacy(file)}
                      className="text-xs px-2 py-1 rounded-lg font-medium"
                      style={{ background: '#fee2e2', color: '#dc2626' }}
                    >
                      Sil
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MODAL: Proje Dosyası Bağla ── */}
      {hasNewSystem && showLinkModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowLinkModal(false) }}
        >
          <div
            className="w-full max-w-lg rounded-2xl overflow-hidden flex flex-col"
            style={{
              background: '#fff',
              border: '1px solid #e0f4fb',
              boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
              maxHeight: '80vh',
            }}
          >
            {/* Modal Başlık */}
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #e0f4fb' }}>
              <div>
                <h3 className="font-bold text-sm" style={{ color: '#0d1a2a' }}>🔗 Proje Dosyası Bağla</h3>
                <p className="text-xs mt-0.5" style={{ color: '#7acfe6' }}>Proje arşivinden bir dosya seç ve bu göreve bağla</p>
              </div>
              <button
                onClick={() => setShowLinkModal(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
                style={{ background: '#f3f4f6', color: '#6b7280' }}
              >
                ✕
              </button>
            </div>

            {/* Arama */}
            <div className="px-5 pt-4 pb-2">
              <input
                type="text"
                placeholder="Dosya adı veya açıklama ara..."
                value={linkSearch}
                onChange={e => setLinkSearch(e.target.value)}
                className="w-full rounded-xl px-4 py-2 text-sm outline-none"
                style={{ background: '#f8fcff', border: '1px solid #bee5f0', color: '#0d1a2a' }}
              />
            </div>

            {/* Dosya listesi */}
            <div className="overflow-y-auto flex-1 px-5 pb-4">
              {orgFilesLoading ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: '#bee5f0', borderTopColor: '#2288c9' }} />
                </div>
              ) : filteredOrgFiles.length === 0 ? (
                <div className="text-center py-8 text-sm" style={{ color: '#9ca3af' }}>
                  {linkSearch ? 'Aramayla eşleşen dosya yok.' : 'Proje arşivinde dosya yok.'}
                </div>
              ) : (
                <div className="space-y-2 mt-2">
                  {filteredOrgFiles.map(file => {
                    const alreadyLinked = isLinkedToThis(file)
                    const isLinking = linkingId === file.id
                    const cat = file.category
                    const color = CAT_COLORS[cat] ?? '#6b7280'
                    const icon = CAT_ICONS[cat] ?? '📄'
                    const label = CAT_LABELS[cat] ?? cat

                    return (
                      <div
                        key={file.id}
                        className="flex items-center justify-between rounded-xl px-3 py-2.5"
                        style={{
                          background: alreadyLinked ? '#f0fdf4' : '#f8fcff',
                          border: `1px solid ${alreadyLinked ? '#bbf7d0' : '#e0f4fb'}`,
                        }}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-lg shrink-0">{fileIcon(file.mime_type, file.file_name)}</span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-semibold truncate" style={{ color: '#0d1a2a', maxWidth: 180 }}>
                                {file.file_name}
                              </span>
                              <span
                                className="text-[10px] px-1.5 py-0.5 rounded-md font-bold shrink-0"
                                style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}
                              >
                                {icon} {label}
                              </span>
                            </div>
                            <div className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>
                              {formatBytes(file.file_size)}
                              {file.description ? ` · ${file.description}` : ''}
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => !alreadyLinked && handleLink(file.id)}
                          disabled={alreadyLinked || isLinking}
                          className="shrink-0 ml-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all disabled:cursor-default"
                          style={alreadyLinked
                            ? { background: '#dcfce7', color: '#16a34a', border: '1px solid #bbf7d0' }
                            : isLinking
                              ? { background: '#f0fbff', color: '#7acfe6', border: '1px solid #bee5f0' }
                              : {
                                  background: 'linear-gradient(135deg, #2288c9, #2abbd5)',
                                  color: '#fff',
                                  boxShadow: '0 2px 6px rgba(34,136,201,0.25)',
                                }
                          }
                        >
                          {alreadyLinked ? '✓ Bağlı' : isLinking ? '...' : '+ Bağla'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Modal alt */}
            <div
              className="px-5 py-3 flex items-center justify-between"
              style={{ borderTop: '1px solid #e0f4fb' }}
            >
              <p className="text-xs" style={{ color: '#9ca3af' }}>
                Dosya arşive eklemek için{' '}
                <a href={`/org/${orgSlug}/files`} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: '#2288c9' }}>
                  Dosya Merkezi
                </a>
                'ni kullan
              </p>
              <button
                onClick={() => setShowLinkModal(false)}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold"
                style={{ background: '#f3f4f6', color: '#374151' }}
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
