'use client'

import Link from 'next/link'
import StatusBadge from '@/components/StatusBadge'
import {
  getPriorityMeta, getTypeMeta, gecikmisMi,
  STATUS_KISA_ETIKET, STATUS_RENK,
  type TaskWithAssignee,
} from './gorevMeta'
import type { Sprint, Deneyap } from '@/types/database'

interface Props {
  task: TaskWithAssignee
  slug: string
  sprints: Sprint[]
  /** Görevin DENEYAP'ı — varsa il rozeti yerine bunun adı gösterilir. */
  deneyap?: Deneyap | null
  /** 'satir' = masaüstü liste satırı, 'kart' = mobil kart. */
  variant: 'satir' | 'kart'
  /** Satır varyantında son öğede alt çizgi çizilmez. */
  sonMu?: boolean
  yazabilir: boolean
  onEdit: (task: TaskWithAssignee) => void
  onDelete: (taskId: string) => void
}

/**
 * Tek görev öğesi. Rozet mantığı (öncelik, tür, il, sprint, gecikme) burada
 * TEK yerde — daha önce mobil kart ve masaüstü satır kendi kopyalarını
 * taşıyordu ve ikisi zaman içinde ayrışmıştı (ör. mobilde "gecikmiş" kelimesi
 * hiç yazmıyordu).
 *
 * DOM'u iki varyantta gerçekten farklı olduğu için `variant` bir prop;
 * Tailwind ile tek ağaçta ifade edilemezdi.
 */
export default function GorevSatiri({
  task, slug, sprints, deneyap, variant, sonMu = false, yazabilir, onEdit, onDelete,
}: Props) {
  const pMeta = getPriorityMeta(task.priority || 'normal')
  const tMeta = getTypeMeta(task.task_type || 'other')
  const overdue = gecikmisMi(task)
  const sprint = task.sprint_id ? sprints.find(s => s.id === task.sprint_id) : undefined
  /*
    DENEYAP varsa il rozeti yerine DENEYAP adı gösteriliyor: "Ankara"
    rozeti, aynı ilde iki DENEYAP olduğunda hangi birimin işi olduğunu
    söylemiyor — ki bu projenin belirleyici gereksinimi tam olarak buydu.
    DENEYAP'ın ili zaten onun ili (061 trigger'ı garanti ediyor), o yüzden
    bilgi kaybı yok.
  */
  const yerRozeti = deneyap
    ? { metin: deneyap.ad, baslik: `${deneyap.il}${deneyap.ilce ? ` · ${deneyap.ilce}` : ''}` }
    : task.il ? { metin: task.il, baslik: undefined } : null

  const terminMetni = task.due_date
    ? new Date(task.due_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
    : null

  if (variant === 'kart') {
    const sc = STATUS_RENK[task.status] ?? '#94a3b8'
    return (
      <div style={{
        background: '#fff', borderRadius: 14,
        border: '1px solid #e5e7eb',
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        overflow: 'hidden',
      }}>
        {/* Öncelik çizgisi */}
        <div style={{ height: 3, background: `linear-gradient(90deg, ${pMeta.color}, ${pMeta.color}66)` }} />
        <div style={{ padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
            <Link href={`/org/${slug}/tasks/${task.id}`} style={{ fontSize: 14, fontWeight: 700, color: '#111827', textDecoration: 'none', flex: 1, lineHeight: 1.4 }}>
              {task.title}
            </Link>
            {yazabilir && (
              <button onClick={() => onEdit(task)} style={{
                flexShrink: 0, background: '#f1f5f9', border: 'none', borderRadius: 7,
                padding: '4px 8px', fontSize: 11, fontWeight: 600, color: '#2288c9', cursor: 'pointer',
              }}>Düzenle</button>
            )}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: pMeta.bg, color: pMeta.color }}>{pMeta.label}</span>
            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: '#f1f5f9', color: '#64748b' }}>{tMeta.label}</span>
            {yerRozeti && (
              <span title={yerRozeti.baslik} style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: '#f0fdfa', color: '#0f766e' }}>
                📍 {yerRozeti.metin}
              </span>
            )}
            {sprint && <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: '#ede9fe', color: '#7c3aed' }}>{sprint.name}</span>}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {task.assigneeName && (
                <span style={{ fontSize: 11, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <span style={{ width: 16, height: 16, borderRadius: '50%', background: '#e0f2fe', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#0369a1' }}>
                    {task.assigneeName[0].toUpperCase()}
                  </span>
                  {task.assigneeName}
                </span>
              )}
              {terminMetni && (
                <span style={{ fontSize: 11, fontWeight: 600, color: overdue ? '#dc2626' : '#9ca3af' }}>
                  {overdue && '⚠ '}{terminMetni}
                </span>
              )}
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: sc + '18', color: sc }}>
              {STATUS_KISA_ETIKET[task.status] ?? task.status}
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex items-center gap-3 px-5 py-3.5"
      style={{ borderBottom: sonMu ? 'none' : '1px solid #f3f4f6' }}
    >
      {/* Öncelik çizgisi */}
      <div className="w-0.5 self-stretch rounded-full shrink-0" style={{ background: pMeta.color, minHeight: 36 }} />

      <div className="min-w-0 flex-1">
        <Link
          href={`/org/${slug}/tasks/${task.id}`}
          className="text-[13px] font-semibold hover:underline truncate block"
          style={{ color: '#111827' }}
        >
          {task.title}
        </Link>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: pMeta.bg, color: pMeta.color }}>
            {pMeta.label}
          </span>
          <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: '#f1f5f9', color: '#64748b' }}>
            {tMeta.label}
          </span>
          {yerRozeti && (
            <span title={yerRozeti.baslik} className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: '#f0fdfa', color: '#0f766e' }}>
              📍 {yerRozeti.metin}
            </span>
          )}
          {task.assigneeName && (
            <span className="text-xs" style={{ color: '#9ca3af' }}>{task.assigneeName}</span>
          )}
          {terminMetni && (
            <span className="text-xs font-medium" style={{ color: overdue ? '#dc2626' : '#9ca3af' }}>
              {overdue && '⚠ '}{terminMetni}{overdue && ' gecikmiş'}
            </span>
          )}
          {sprint && (
            <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: '#ede9fe', color: '#7c3aed' }}>
              {sprint.name}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <StatusBadge status={task.status} />
        <button
          onClick={() => onEdit(task)}
          className="text-xs px-2.5 py-1 rounded-lg font-medium"
          style={{ color: '#2288c9', background: '#eff6ff', border: '1px solid #dbeafe', display: yazabilir ? undefined : 'none' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#dbeafe' }}
          onMouseLeave={e => { e.currentTarget.style.background = '#eff6ff' }}
        >
          Düzenle
        </button>
        <button
          onClick={() => onDelete(task.id)}
          className="text-xs px-2.5 py-1 rounded-lg font-medium"
          style={{ color: '#dc2626', background: '#fff1f1', border: '1px solid #fecaca', display: yazabilir ? undefined : 'none' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2' }}
          onMouseLeave={e => { e.currentTarget.style.background = '#fff1f1' }}
        >
          Sil
        </button>
      </div>
    </div>
  )
}
