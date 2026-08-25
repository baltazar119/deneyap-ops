'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { Schedule } from '@/types/database'

interface WeekCalendarProps {
  userId: string
  schedules: Schedule[]
  onRefresh: () => void
}

const DAYS_TR = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
const DAYS_FULL = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']

function getWeekDays(offsetWeeks = 0): Date[] {
  const now = new Date()
  const day = now.getDay() // 0=Sun
  const diffToMon = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setDate(now.getDate() + diffToMon + offsetWeeks * 7)
  monday.setHours(0, 0, 0, 0)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

function toLocalDateStr(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function toDatetimeLocal(d: Date) {
  return toLocalDateStr(d) + 'T' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}

function formatHHMM(iso: string) {
  const d = new Date(iso)
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}

export default function WeekCalendar({ userId, schedules, onRefresh }: WeekCalendarProps) {
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const days = getWeekDays(weekOffset)
  const today = toLocalDateStr(new Date())

  // Group schedules by date
  const byDate: Record<string, Schedule[]> = {}
  schedules.forEach(s => {
    const dateStr = toLocalDateStr(new Date(s.start_time))
    if (!byDate[dateStr]) byDate[dateStr] = []
    byDate[dateStr].push(s)
  })

  function openDay(day: Date) {
    setSelectedDay(day)
    setError(null)
    const base = toLocalDateStr(day)
    setStartTime(base + 'T09:00')
    setEndTime(base + 'T17:00')
    setNote('')
  }

  async function handleSave() {
    if (!startTime || !endTime) return
    if (new Date(startTime) >= new Date(endTime)) {
      setError('Bitiş zamanı başlangıçtan sonra olmalı.')
      return
    }
    setSaving(true)
    setError(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: err } = await (supabase as any).from('schedules').insert({
      user_id: userId,
      start_time: new Date(startTime).toISOString(),
      end_time: new Date(endTime).toISOString(),
      note: note || null,
    })
    if (err) { setError('Kayıt sırasında hata oluştu.'); setSaving(false); return }
    setSaving(false)
    setSelectedDay(null)
    onRefresh()
  }

  async function handleDelete(id: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('schedules').delete().eq('id', id)
    onRefresh()
  }

  // Calculate week label
  const weekStart = days[0]
  const weekEnd = days[6]
  const weekLabel = `${weekStart.getDate()} ${weekStart.toLocaleString('tr-TR', { month: 'short' })} – ${weekEnd.getDate()} ${weekEnd.toLocaleString('tr-TR', { month: 'short', year: 'numeric' })}`

  return (
    <div>
      {/* Week navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setWeekOffset(w => w - 1)}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
          style={{ background: '#f0fbff', border: '1px solid #bee5f0', color: '#2288c9' }}
        >
          ‹
        </button>
        <div className="text-center">
          <div className="text-sm font-semibold" style={{ color: '#0d1a2a' }}>{weekLabel}</div>
          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="text-xs font-medium"
              style={{ color: '#2abbd5' }}
            >
              Bugüne dön
            </button>
          )}
        </div>
        <button
          onClick={() => setWeekOffset(w => w + 1)}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
          style={{ background: '#f0fbff', border: '1px solid #bee5f0', color: '#2288c9' }}
        >
          ›
        </button>
      </div>

      {/* 7-day grid */}
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((day, i) => {
          const dateStr = toLocalDateStr(day)
          const isToday = dateStr === today
          const isPast = day < new Date(today)
          const daySchedules = byDate[dateStr] || []
          const hasSchedule = daySchedules.length > 0

          return (
            <button
              key={dateStr}
              onClick={() => !isPast && openDay(day)}
              disabled={isPast && !hasSchedule}
              className="rounded-xl p-2 flex flex-col items-center gap-1 transition-all min-h-[80px] relative"
              style={{
                background: isToday
                  ? 'linear-gradient(135deg, #182c3f, #2288c9)'
                  : hasSchedule
                  ? '#bee5f0'
                  : '#f8fcff',
                border: isToday
                  ? '2px solid #2abbd5'
                  : hasSchedule
                  ? '1.5px solid #7acfe6'
                  : '1.5px solid #e0f4fb',
                opacity: isPast && !hasSchedule ? 0.4 : 1,
                cursor: isPast && !hasSchedule ? 'default' : 'pointer',
              }}
            >
              {/* Day label */}
              <span
                className="text-xs font-semibold"
                style={{ color: isToday ? 'rgba(255,255,255,0.7)' : '#7acfe6' }}
              >
                {DAYS_TR[i]}
              </span>

              {/* Date number */}
              <span
                className="text-lg font-bold leading-none"
                style={{ color: isToday ? '#fff' : hasSchedule ? '#0d1a2a' : '#182c3f' }}
              >
                {day.getDate()}
              </span>

              {/* Schedule dots */}
              {daySchedules.length > 0 && (
                <div className="flex flex-col gap-0.5 w-full mt-1">
                  {daySchedules.slice(0, 2).map(s => (
                    <div
                      key={s.id}
                      className="rounded text-center w-full"
                      style={{
                        background: isToday ? 'rgba(255,255,255,0.25)' : '#2288c9',
                        color: isToday ? '#fff' : '#fff',
                        fontSize: '9px',
                        fontWeight: 700,
                        padding: '1px 2px',
                      }}
                    >
                      {formatHHMM(s.start_time)}–{formatHHMM(s.end_time)}
                    </div>
                  ))}
                  {daySchedules.length > 2 && (
                    <div className="text-center" style={{ fontSize: '9px', color: '#2288c9', fontWeight: 700 }}>
                      +{daySchedules.length - 2}
                    </div>
                  )}
                </div>
              )}

              {/* Add hint for future days without schedule */}
              {!hasSchedule && !isPast && (
                <span style={{ fontSize: '16px', opacity: 0.25, marginTop: 'auto' }}>+</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Day detail / form modal */}
      {selectedDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(13,26,42,0.5)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: '#fff', boxShadow: '0 20px 60px rgba(13,26,42,0.3)' }}>
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="text-base font-bold" style={{ color: '#0d1a2a' }}>
                  {DAYS_FULL[selectedDay.getDay() === 0 ? 6 : selectedDay.getDay() - 1]}
                </div>
                <div className="text-sm" style={{ color: '#7acfe6' }}>
                  {selectedDay.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
              </div>
              <button
                onClick={() => setSelectedDay(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-lg"
                style={{ background: '#f0fbff', color: '#7acfe6' }}
              >
                ×
              </button>
            </div>

            {/* Existing schedules for this day */}
            {(byDate[toLocalDateStr(selectedDay)] || []).length > 0 && (
              <div className="mb-4">
                <div className="text-xs font-bold mb-2 uppercase tracking-wide" style={{ color: '#7acfe6' }}>Mevcut Planlar</div>
                <div className="space-y-2">
                  {(byDate[toLocalDateStr(selectedDay)] || []).map(s => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between rounded-xl px-3 py-2"
                      style={{ background: '#f0fbff', border: '1px solid #bee5f0' }}
                    >
                      <div>
                        <div className="text-sm font-semibold" style={{ color: '#0d1a2a' }}>
                          {formatHHMM(s.start_time)} – {formatHHMM(s.end_time)}
                        </div>
                        {s.note && <div className="text-xs" style={{ color: '#7acfe6' }}>{s.note}</div>}
                      </div>
                      <button
                        onClick={() => handleDelete(s.id)}
                        className="text-xs px-2 py-1 rounded-lg"
                        style={{ background: '#fee2e2', color: '#dc2626' }}
                      >
                        Sil
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add new plan form */}
            <div className="text-xs font-bold mb-3 uppercase tracking-wide" style={{ color: '#7acfe6' }}>
              Yeni Plan Ekle
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: '#182c3f' }}>Başlangıç</label>
                  <input type="time" value={startTime.split('T')[1] || ''} onChange={e => setStartTime(toLocalDateStr(selectedDay) + 'T' + e.target.value)} className="input text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: '#182c3f' }}>Bitiş</label>
                  <input type="time" value={endTime.split('T')[1] || ''} onChange={e => setEndTime(toLocalDateStr(selectedDay) + 'T' + e.target.value)} className="input text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: '#182c3f' }}>Not (opsiyonel)</label>
                <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Hangi amaçla geliyorsunuz?" className="input text-sm" />
              </div>
              {error && <div className="text-xs font-medium" style={{ color: '#dc2626' }}>{error}</div>}
              <button onClick={handleSave} disabled={saving} className="btn-primary w-full">
                {saving ? 'Kaydediliyor...' : 'Planı Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
