'use client'

import { useEffect, useRef, useState } from 'react'
import ResponsiveModal from '@/components/responsive/ResponsiveModal'
import DeneyapSecici from '@/components/DeneyapSecici'
import { TASK_TYPES } from '@/lib/taskTypes'
import { IL_SECENEKLERI } from '@/lib/iller'
import { STATUS_OPTIONS, PRIORITY_OPTIONS } from './gorevMeta'
import type { Task, Profile, Sprint, Deneyap, TaskStatus, TaskPriority, TaskType } from '@/types/database'

export interface GorevFormPayload {
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  task_type: TaskType
  assignee_id: string | null
  start_date: string | null
  due_date: string | null
  estimated_hours: number | null
  actual_hours: number | null
  sprint_id: string | null
  il: string | null
  deneyap_id: string | null
}

interface Props {
  open: boolean
  /** null = yeni görev. */
  editingTask: Task | null
  members: Profile[]
  sprints: Sprint[]
  deneyaplar: Deneyap[]
  /** Kullanıcının ili — DENEYAP seçicide o il en üste alınır. */
  kullaniciIl?: string | null
  /** Satır içi "+ Yeni DENEYAP" yalnızca yetkiliye gösterilir. */
  onYeniDeneyap?: () => void
  onClose: () => void
  /** Hata mesajı döndürürse modal açık kalır ve mesajı gösterir. */
  onSubmit: (payload: GorevFormPayload, files: File[]) => Promise<string | null>
}

const MAX_DOSYA = 50 * 1024 * 1024

/**
 * Görev oluşturma/düzenleme formu — TEK alan sırasıyla.
 *
 * Önceden mobil ve masaüstünün ayrı formları vardı ve mobil olan eksikti:
 * tahmini/gerçekleşen süre ve dosya ekleme alanları yoktu. Tek forma
 * inildiği için bu alanlar mobilde de kullanılabilir hale geldi.
 *
 * Modal kabuğu `ResponsiveModal` (masaüstünde ortalı, mobilde alttan sheet) —
 * `useIsMobile` gerekmiyor, fark saf CSS.
 */
export default function GorevFormModal({
  open, editingTask, members, sprints, deneyaplar, kullaniciIl, onYeniDeneyap, onClose, onSubmit,
}: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<TaskStatus>('backlog')
  const [priority, setPriority] = useState<TaskPriority>('normal')
  const [type, setType] = useState<TaskType>('other')
  const [assignee, setAssignee] = useState('')
  const [startDate, setStartDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [estimatedHours, setEstimatedHours] = useState('')
  const [actualHours, setActualHours] = useState('')
  const [sprintId, setSprintId] = useState('')
  const [il, setIl] = useState('')
  const [deneyapId, setDeneyapId] = useState<string | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Açılışta alanları doldur/sıfırla. Modal kapalıyken state'i tutmuyoruz ki
  // "Yeni Görev" bir önceki düzenlemenin kalıntısıyla açılmasın.
  useEffect(() => {
    if (!open) return
    const t = editingTask
    setTitle(t?.title ?? '')
    setDescription(t?.description ?? '')
    setStatus(t?.status ?? 'backlog')
    setPriority(t?.priority ?? 'normal')
    setType(t?.task_type ?? 'other')
    setAssignee(t?.assignee_id ?? '')
    setStartDate(t?.start_date ?? '')
    setDueDate(t?.due_date ?? '')
    setEstimatedHours(t?.estimated_hours != null ? String(t.estimated_hours) : '')
    setActualHours(t?.actual_hours != null ? String(t.actual_hours) : '')
    setSprintId(t?.sprint_id ?? '')
    setIl(t?.il ?? '')
    setDeneyapId(t?.deneyap_id ?? null)
    setFiles([])
    setError(null)
  }, [open, editingTask])

  function dosyaEkle(secilen: File[]) {
    const gecerli = secilen.filter(f => {
      if (f.size > MAX_DOSYA) { setError(`"${f.name}" 50MB sınırını aşıyor.`); return false }
      return true
    })
    setFiles(prev => [...prev, ...gecerli])
  }

  const secilenDeneyap = deneyapId ? deneyaplar.find(d => d.id === deneyapId) ?? null : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const hata = await onSubmit({
      title,
      description: description || null,
      status,
      priority,
      task_type: type,
      assignee_id: assignee || null,
      start_date: startDate || null,
      due_date: dueDate || null,
      estimated_hours: estimatedHours ? parseFloat(estimatedHours) : null,
      actual_hours: actualHours ? parseFloat(actualHours) : null,
      sprint_id: sprintId || null,
      // DENEYAP seçiliyse il ondan gelir; DB trigger'ı (061) zaten aynısını
      // yapıyor, burada gönderilen değer yalnızca ekranla tutarlı olsun diye.
      il: (secilenDeneyap ? secilenDeneyap.il : il) || null,
      deneyap_id: deneyapId,
    }, files)
    setLoading(false)
    if (hata) setError(hata)
  }

  const etiket = 'block text-xs font-semibold mb-1.5'

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      title={editingTask ? 'Görevi Düzenle' : 'Yeni Görev'}
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={etiket} style={{ color: '#374151' }}>Başlık *</label>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Görev başlığı" className="input" required />
        </div>

        <div>
          <label className={etiket} style={{ color: '#374151' }}>Açıklama</label>
          <textarea
            value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Görev detayları..." className="input resize-y" rows={5}
            style={{ color: '#111827', minHeight: '100px' }}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={etiket} style={{ color: '#374151' }}>Öncelik</label>
            <select value={priority} onChange={e => setPriority(e.target.value as TaskPriority)} className="input">
              {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.icon} {o.label}</option>)}
            </select>
          </div>
          <div>
            <label className={etiket} style={{ color: '#374151' }}>Tür</label>
            <select value={type} onChange={e => setType(e.target.value as TaskType)} className="input">
              {TASK_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className={etiket} style={{ color: '#374151' }}>Durum</label>
          <select value={status} onChange={e => setStatus(e.target.value as TaskStatus)} className="input">
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={etiket} style={{ color: '#374151' }}>Başlangıç Tarihi</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input" />
          </div>
          <div>
            <label className={etiket} style={{ color: '#374151' }}>Son Tarih</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="input" />
          </div>
        </div>

        <div>
          <label className={etiket} style={{ color: '#374151' }}>Atanan Üye</label>
          <select value={assignee} onChange={e => setAssignee(e.target.value)} className="input">
            <option value="">-- Seçilmedi --</option>
            {members.map(m => (
              <option key={m.id} value={m.id}>
                {m.full_name || m.id} ({m.role === 'admin' ? 'Admin' : 'Üye'})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={etiket} style={{ color: '#374151' }}>DENEYAP</label>
          <DeneyapSecici
            deneyaplar={deneyaplar}
            deger={deneyapId}
            onChange={setDeneyapId}
            oncelikliIl={kullaniciIl}
            onYeniIste={onYeniDeneyap}
          />
        </div>

        <div>
          <label className={etiket} style={{ color: '#374151' }}>İl / Birim</label>
          {/*
            DENEYAP seçiliyken il alanı KİLİTLİ ve DENEYAP'ın ilinden dolu.
            Bu, 061'deki DB trigger'ının kullanıcıya görünen aynası: orada da
            `il` DENEYAP'tan yazılıyor. Alan açık bırakılsaydı kullanıcı başka
            bir il seçer, kaydeder ve kaydettiğinden farklı bir sonuç görürdü.
          */}
          <select
            value={secilenDeneyap ? secilenDeneyap.il : il}
            onChange={e => setIl(e.target.value)}
            className="input"
            disabled={!!secilenDeneyap}
            style={secilenDeneyap ? { background: '#f8fafc', color: '#64748b' } : undefined}
          >
            <option value="">-- İl atanmamış --</option>
            {IL_SECENEKLERI.map(o => <option key={o} value={o}>{o}</option>)}
            {/* Seçili DENEYAP'ın ili listede yoksa (veri elle girilmişse)
                alan boş görünmesin. */}
            {secilenDeneyap && !IL_SECENEKLERI.includes(secilenDeneyap.il) && (
              <option value={secilenDeneyap.il}>{secilenDeneyap.il}</option>
            )}
          </select>
          {secilenDeneyap && (
            <p className="text-[11px] mt-1.5" style={{ color: '#64748b' }}>
              İl, seçilen DENEYAP&apos;tan alınır.
            </p>
          )}
        </div>

        <div>
          <label className={etiket} style={{ color: '#374151' }}>Sprint</label>
          <select value={sprintId} onChange={e => setSprintId(e.target.value)} className="input">
            <option value="">-- Sprint&apos;e atama yok --</option>
            {sprints.map(s => <option key={s.id} value={s.id}>{s.is_active ? '● ' : ''}{s.name}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={etiket} style={{ color: '#374151' }}>Tahmini Süre (saat)</label>
            <input type="number" min="0" step="0.5" value={estimatedHours} onChange={e => setEstimatedHours(e.target.value)} placeholder="ör. 4.5" className="input" />
          </div>
          <div>
            <label className={etiket} style={{ color: '#374151' }}>Gerçekleşen Süre (saat)</label>
            <input type="number" min="0" step="0.5" value={actualHours} onChange={e => setActualHours(e.target.value)} placeholder="ör. 3.0" className="input" />
          </div>
        </div>

        <div>
          <label className={etiket} style={{ color: '#374151' }}>Dosya Ekle</label>
          <div
            className="border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition-colors"
            style={{ borderColor: '#e5e7eb', background: '#f9fafb' }}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); dosyaEkle(Array.from(e.dataTransfer.files)) }}
          >
            <input
              ref={fileInputRef} type="file" multiple hidden
              onChange={e => { dosyaEkle(Array.from(e.target.files || [])); e.target.value = '' }}
            />
            <p className="text-xs" style={{ color: '#9ca3af' }}>Dosyaları sürükleyin veya tıklayarak seçin</p>
          </div>
          {files.length > 0 && (
            <div className="mt-2 space-y-1">
              {files.map((f, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg px-3 py-1.5" style={{ background: '#f1f5f9' }}>
                  <span className="text-xs truncate max-w-[80%]" style={{ color: '#111827' }}>{f.name}</span>
                  <button
                    type="button"
                    onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                    className="text-sm font-bold ml-2"
                    style={{ color: '#dc2626' }}
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="text-xs rounded-xl px-4 py-3" style={{ background: '#fee2e2', color: '#dc2626' }}>
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">İptal</button>
          <button type="submit" disabled={loading} className="btn-primary flex-1">
            {loading ? 'Kaydediliyor...' : editingTask ? 'Güncelle' : 'Oluştur'}
          </button>
        </div>
      </form>
    </ResponsiveModal>
  )
}
