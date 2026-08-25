/**
 * Determine if user is currently IN the workshop.
 * Logic: last checkin record's type is 'in'.
 */
export function isCurrentlyIn(checkins: { type: string; timestamp: string }[]): boolean {
  if (!checkins || checkins.length === 0) return false
  // Sort descending by timestamp
  const sorted = [...checkins].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )
  return sorted[0].type === 'in'
}

/**
 * Format date to Turkish locale string
 */
export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/**
 * Format datetime to Turkish locale string
 */
export function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Format time only
 */
export function formatTime(date: string | Date): string {
  return new Date(date).toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Check if a due_date is in the past (overdue)
 */
export function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false
  const due = new Date(dueDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return due < today
}

/**
 * Get today's date range (start and end of day)
 */
export function getTodayRange(): { start: Date; end: Date } {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

/**
 * Get current week's date range
 */
export function getWeekRange(): { start: Date; end: Date } {
  const now = new Date()
  const dayOfWeek = now.getDay() // 0=Sun, 1=Mon...
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek // Start from Monday
  const start = new Date(now)
  start.setDate(now.getDate() + diff)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}
