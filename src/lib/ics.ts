/**
 * ICS (iCalendar) dosya oluşturma ve indirme yardımcıları.
 * Google Calendar, Apple Calendar, Outlook vb. uygulamalarla uyumludur.
 */

export interface ICSTask {
  id: string
  title: string
  description?: string | null
  start_date?: string | null  // ISO date string (YYYY-MM-DD)
  due_date?: string | null    // ISO date string (YYYY-MM-DD)
}

/** YYYYMMDD formatına çevirir (all-day event için) */
function toICSDate(isoDate: string): string {
  return isoDate.replace(/-/g, '')
}

/** Şimdiki zamanı UTC YYYYMMDDTHHMMSSZ formatına çevirir */
function nowUTC(): string {
  return new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

/** iCal için özel karakterleri escape et */
function escapeICS(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g,  '\\;')
    .replace(/,/g,  '\\,')
    .replace(/\n/g, '\\n')
}

/** Tek bir görev için VEVENT bloğu üretir */
function taskToVEVENT(task: ICSTask, now: string): string {
  const today    = new Date().toISOString().slice(0, 10)
  const startIso = task.start_date ?? task.due_date ?? today
  const endDate  = new Date(task.due_date ?? task.start_date ?? today)
  endDate.setDate(endDate.getDate() + 1)           // DTEND exclusive
  const endIso   = endDate.toISOString().slice(0, 10)

  const lines = [
    'BEGIN:VEVENT',
    `UID:${task.id}@deneyap-ops.app`,
    `DTSTAMP:${now}`,
    `DTSTART;VALUE=DATE:${toICSDate(startIso)}`,
    `DTEND;VALUE=DATE:${toICSDate(endIso)}`,
    `SUMMARY:${escapeICS(task.title)}`,
  ]
  if (task.description) lines.push(`DESCRIPTION:${escapeICS(task.description)}`)
  lines.push('END:VEVENT')
  return lines.join('\r\n')
}

/**
 * Birden fazla görevi tek bir ICS dosyasına yazar.
 * Tarihi olmayan görevler için bugün kullanılır.
 */
export function generateMultiICS(tasks: ICSTask[]): string {
  const now = nowUTC()
  const events = tasks.map(t => taskToVEVENT(t, now)).join('\r\n')
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DENEYAP//DENEYAP OYS//TR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    events,
    'END:VCALENDAR',
  ].join('\r\n')
}

/** Tarayıcıda .ics dosyası indirmeyi tetikler */
function triggerDownload(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Tüm görevleri tek .ics dosyası olarak indirir (takvim butonu için) */
export function downloadAllICS(tasks: ICSTask[], filename = 'deneyap-takvim.ics'): void {
  triggerDownload(generateMultiICS(tasks), filename)
}
