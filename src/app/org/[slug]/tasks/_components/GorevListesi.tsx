'use client'

import { useIsMobile } from '@/lib/useIsMobile'
import GorevSatiri from './GorevSatiri'
import type { TaskWithAssignee } from './gorevMeta'
import type { Sprint, Deneyap } from '@/types/database'

interface Props {
  gorevler: TaskWithAssignee[]
  slug: string
  sprints: Sprint[]
  /** DENEYAP id → kayıt. Satırdaki yer rozeti için. */
  deneyapHaritasi: Map<string, Deneyap>
  yazabilir: boolean
  onEdit: (task: TaskWithAssignee) => void
  onDelete: (taskId: string) => void
}

/**
 * Görev listesi kabuğu. `useIsMobile` burada bilinçli kullanılıyor: mobil kart
 * ile masaüstü satırının DOM'u gerçekten farklı (kartta öncelik şeridi ayrı
 * öğe, satırda aksiyon düğmeleri var) — Tailwind breakpoint'iyle ifade etmek
 * her görevi iki kez render etmek olurdu. Bkz. `useIsMobile.ts` doc kuralı.
 */
export default function GorevListesi({
  gorevler, slug, sprints, deneyapHaritasi, yazabilir, onEdit, onDelete,
}: Props) {
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <div className="flex flex-col gap-2">
        {gorevler.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
            <div style={{ fontSize: 14 }}>Görev bulunamadı</div>
          </div>
        ) : gorevler.map(task => (
          <GorevSatiri
            key={task.id}
            task={task} slug={slug} sprints={sprints} variant="kart"
            deneyap={task.deneyap_id ? deneyapHaritasi.get(task.deneyap_id) : null}
            yazabilir={yazabilir} onEdit={onEdit} onDelete={onDelete}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e5e7eb' }}>
      {gorevler.length === 0 ? (
        <div className="px-5 py-16 text-center text-sm" style={{ color: '#9ca3af' }}>
          Görev bulunamadı.
        </div>
      ) : gorevler.map((task, i) => (
        <GorevSatiri
          key={task.id}
          task={task} slug={slug} sprints={sprints} variant="satir"
          deneyap={task.deneyap_id ? deneyapHaritasi.get(task.deneyap_id) : null}
          sonMu={i === gorevler.length - 1}
          yazabilir={yazabilir} onEdit={onEdit} onDelete={onDelete}
        />
      ))}
    </div>
  )
}
