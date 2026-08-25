import type { TaskStatus } from '@/types/database'

const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: 'Beklemede',
  doing: 'Yapılıyor',
  testing: 'Test',
  blocked: 'Bloke',
  done: 'Tamamlandı',
}

const STATUS_CLASSES: Record<TaskStatus, string> = {
  backlog: 'status-backlog',
  doing: 'status-doing',
  testing: 'status-testing',
  blocked: 'status-blocked',
  done: 'status-done',
}

export default function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={STATUS_CLASSES[status]}>
      {STATUS_LABELS[status]}
    </span>
  )
}
