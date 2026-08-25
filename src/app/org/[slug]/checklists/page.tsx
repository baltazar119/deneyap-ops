'use client'

import { useState, useEffect, useRef } from 'react'
import { useOrg } from '@/lib/supabase/orgContext'
import { supabase } from '@/lib/supabase/client'
import { useIsMobile } from '@/lib/useIsMobile'
import { Plus, Trash2, X, ChevronLeft, CheckSquare, Search, ListChecks, CheckCheck, Clock, Users } from 'lucide-react'
import type { Checklist, ChecklistItem, ChecklistWithProgress } from '@/types/database'

const COLORS = ['#2288c9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#6b7280']

function ProgressRing({ pct, color, size = 52 }: { pct: number; color: string; size?: number }) {
  const r = size * 0.36; const c = 2 * Math.PI * r; const off = c * (1 - pct / 100); const cx = size / 2
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth={4} />
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={4}
        strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cx})`} style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
      <text x={cx} y={cx + 4} textAnchor="middle" fontSize={size * 0.2} fontWeight={800} fill={color}>
        {Math.round(pct)}%
      </text>
    </svg>
  )
}

export default function ChecklistsPage() {
  const { org, userId } = useOrg()
  const [checklists, setChecklists] = useState<ChecklistWithProgress[]>([])
  const [allItems, setAllItems] = useState<ChecklistItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'mine' | 'shared'>('all')
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newColor, setNewColor] = useState(COLORS[0])
  const [newTag, setNewTag] = useState('')
  const [newIsShared, setNewIsShared] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newItemText, setNewItemText] = useState('')
  const isMobile = useIsMobile(640)
  const itemInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (org) loadAll() }, [org]) // eslint-disable-line

  async function loadAll() {
    setLoading(true)
    const { data: cls } = await supabase.from('checklists').select('*')
      .eq('organization_id', org!.id).order('created_at', { ascending: false })
    const raw = (cls ?? []) as Checklist[]
    if (!raw.length) { setChecklists([]); setAllItems([]); setLoading(false); return }
    const { data: items } = await supabase.from('checklist_items').select('*')
      .in('checklist_id', raw.map(c => c.id)).order('position', { ascending: true })
    const itemsArr = (items ?? []) as ChecklistItem[]
    setAllItems(itemsArr)
    setChecklists(raw.map(cl => toProgress(cl, itemsArr)))
    setLoading(false)
  }

  function toProgress(cl: Checklist, items: ChecklistItem[]): ChecklistWithProgress {
    const its = items.filter(i => i.checklist_id === cl.id)
    const checked = its.filter(i => i.is_checked).length
    return { ...cl, total: its.length, checked, progress: its.length ? Math.round(checked / its.length * 100) : 0 }
  }

  function recalc(items: ChecklistItem[]) {
    setChecklists(prev => prev.map(cl => toProgress(cl, items)))
  }

  async function handleAddList() {
    if (!newTitle.trim() || !org || !userId) return
    setSaving(true)
    const { data, error } = await supabase.from('checklists').insert({
      organization_id: org.id, created_by: userId,
      title: newTitle.trim(), color: newColor,
      tag: newTag.trim() || null, is_shared: newIsShared,
    }).select().single()
    if (!error && data) {
      const cl = data as Checklist
      setChecklists(prev => [{ ...cl, total: 0, checked: 0, progress: 0 }, ...prev])
      setSelectedId(cl.id)
    }
    setNewTitle(''); setNewColor(COLORS[0]); setNewTag(''); setNewIsShared(false)
    setShowModal(false); setSaving(false)
  }

  async function handleDeleteList(id: string) {
    await supabase.from('checklists').delete().eq('id', id)
    setChecklists(prev => prev.filter(c => c.id !== id))
    setAllItems(prev => prev.filter(i => i.checklist_id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  async function handleAddItem() {
    if (!newItemText.trim() || !selectedId) return
    const text = newItemText.trim()
    const position = allItems.filter(i => i.checklist_id === selectedId).length
    const tempId = `temp-${Date.now()}`
    const tempItem: ChecklistItem = { id: tempId, checklist_id: selectedId, text, is_checked: false, position, created_at: new Date().toISOString() }
    const next = [...allItems, tempItem]
    setAllItems(next); recalc(next); setNewItemText('')
    itemInputRef.current?.focus()
    const { data } = await supabase.from('checklist_items').insert({ checklist_id: selectedId, text, is_checked: false, position }).select().single()
    if (data) { const n2 = next.map(i => i.id === tempId ? data as ChecklistItem : i); setAllItems(n2); recalc(n2) }
  }

  async function handleToggle(item: ChecklistItem) {
    const updated = { ...item, is_checked: !item.is_checked }
    const next = allItems.map(i => i.id === item.id ? updated : i)
    setAllItems(next); recalc(next)
    await supabase.from('checklist_items').update({ is_checked: updated.is_checked }).eq('id', item.id)
  }

  async function handleDeleteItem(item: ChecklistItem) {
    const next = allItems.filter(i => i.id !== item.id)
    setAllItems(next); recalc(next)
    await supabase.from('checklist_items').delete().eq('id', item.id)
  }

  const totalChecked = allItems.filter(i => i.is_checked).length
  const totalItems = allItems.length
  const totalPending = totalItems - totalChecked
  const sharedCount = checklists.filter(c => c.is_shared).length
  const myCount = checklists.filter(c => c.created_by === userId).length

  const visibleLists = checklists.filter(cl => {
    const matchFilter = filter === 'mine' ? cl.created_by === userId : filter === 'shared' ? cl.is_shared : true
    const matchSearch = !search || cl.title.toLowerCase().includes(search.toLowerCase()) || (cl.tag ?? '').toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchSearch
  })

  const selectedList = checklists.find(c => c.id === selectedId) ?? null
  const activeItems = allItems.filter(i => i.checklist_id === selectedId).sort((a, b) => a.position - b.position)
  const todoItems = activeItems.filter(i => !i.is_checked)
  const doneItems = activeItems.filter(i => i.is_checked)

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#f5f7fa' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #e5e7eb', borderTopColor: '#2288c9' }} />
    </div>
  )

  // ── DETAY GÖRÜNÜMÜ ─────────────────────────────────────────────────────────
  if (selectedList) {
    const remaining = selectedList.total - selectedList.checked
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f5f7fa' }}>
        {/* Hero header */}
        <div style={{
          background: '#fff', borderBottom: '1px solid #e5e7eb',
          padding: isMobile ? '14px 16px 18px' : '20px 28px 24px', flexShrink: 0,
        }}>
          <button onClick={() => setSelectedId(null)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: '#f3f4f6', border: 'none', borderRadius: 8,
            padding: '6px 12px', color: '#6b7280', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit', marginBottom: 20,
          }}>
            <ChevronLeft size={13} /> Listeler
          </button>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, flexDirection: isMobile ? 'column' : 'row' }}>
            {/* Sol: başlık + istatistikler */}
            <div style={{ flex: 1, minWidth: 0, width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                  background: selectedList.color + '18',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <CheckSquare size={15} color={selectedList.color} />
                </div>
                <span style={{ fontSize: 22, fontWeight: 900, color: '#111827', letterSpacing: '-0.03em' }}>
                  {selectedList.title}
                </span>
                {selectedList.tag && (
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: selectedList.color + '15', color: selectedList.color }}>
                    {selectedList.tag}
                  </span>
                )}
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 99,
                  background: selectedList.is_shared ? '#d1fae5' : '#f3f4f6',
                  color: selectedList.is_shared ? '#059669' : '#9ca3af',
                }}>
                  {selectedList.is_shared ? '🌍 Paylaşımlı' : '🔒 Kişisel'}
                </span>
              </div>

              {/* Stat sayaçları */}
              <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                {[
                  { label: 'Toplam', value: selectedList.total, color: '#6b7280', bg: '#f3f4f6' },
                  { label: 'Tamamlanan', value: selectedList.checked, color: '#059669', bg: '#d1fae5' },
                  { label: 'Bekleyen', value: remaining, color: selectedList.color, bg: selectedList.color + '15' },
                ].map(s => (
                  <div key={s.label} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: s.bg, borderRadius: 10,
                    padding: isMobile ? '7px 11px' : '8px 14px',
                    flex: isMobile ? 1 : undefined,
                    justifyContent: isMobile ? 'center' : undefined,
                  }}>
                    <span style={{ fontSize: isMobile ? 18 : 22, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: s.color, lineHeight: 1.3 }}>{s.label}</span>
                  </div>
                ))}
              </div>

              {/* Progress bar */}
              <div style={{ marginTop: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 500 }}>İlerleme</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: selectedList.color }}>{selectedList.progress}%</span>
                </div>
                <div style={{ height: 8, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 99, transition: 'width 0.5s ease',
                    background: `linear-gradient(90deg, ${selectedList.color}, ${selectedList.color}bb)`,
                    width: `${selectedList.progress}%`,
                  }} />
                </div>
              </div>
            </div>

            {/* Sağ: büyük progress ring */}
            <div style={{
              flexShrink: 0, display: 'flex',
              flexDirection: isMobile ? 'row' : 'column',
              alignItems: 'center', gap: isMobile ? 12 : 6,
              background: selectedList.color + '08', border: `1.5px solid ${selectedList.color}20`,
              borderRadius: 18, padding: isMobile ? '12px 18px' : '18px 22px',
              width: isMobile ? '100%' : undefined,
            }}>
              <ProgressRing pct={selectedList.progress} color={selectedList.color} size={isMobile ? 72 : 96} />
              <span style={{ fontSize: isMobile ? 13 : 11, fontWeight: 700, color: selectedList.color, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                {selectedList.progress === 100 ? '✓ Tamamlandı' : 'Tamamlanma oranı'}
              </span>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '14px 16px' : '20px 28px' }}>
          <div style={{ maxWidth: 620, margin: '0 auto' }}>
            {activeItems.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 0', color: '#9ca3af' }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>✏️</div>
                <div style={{ fontSize: 14 }}>Henüz madde yok. Aşağıdan ekle.</div>
              </div>
            )}
            {todoItems.map(item => (
              <ItemRow key={item.id} item={item} color={selectedList.color} isMobile={isMobile}
                onToggle={() => handleToggle(item)} onDelete={() => handleDeleteItem(item)} />
            ))}
            {doneItems.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0 10px' }}>
                  <div style={{ height: 1, flex: 1, background: '#e5e7eb' }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    Tamamlanan · {doneItems.length}
                  </span>
                  <div style={{ height: 1, flex: 1, background: '#e5e7eb' }} />
                </div>
                {doneItems.map(item => (
                  <ItemRow key={item.id} item={item} color={selectedList.color} isMobile={isMobile}
                    onToggle={() => handleToggle(item)} onDelete={() => handleDeleteItem(item)} />
                ))}
              </>
            )}
          </div>
        </div>

        <div style={{ background: '#fff', borderTop: '1px solid #e5e7eb', padding: isMobile ? '10px 16px 14px' : '12px 28px 16px', flexShrink: 0 }}>
          <div style={{ maxWidth: 620, margin: '0 auto', display: 'flex', gap: 8 }}>
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 10,
              background: '#f5f7fa', border: `2px solid #e5e7eb`, borderRadius: 12, padding: '0 14px',
            }}
              onFocusCapture={e => { (e.currentTarget as HTMLElement).style.borderColor = selectedList.color }}
              onBlurCapture={e => { (e.currentTarget as HTMLElement).style.borderColor = '#e5e7eb' }}
            >
              <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px dashed ${selectedList.color}`, flexShrink: 0, opacity: 0.5 }} />
              <input ref={itemInputRef} value={newItemText}
                onChange={e => setNewItemText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddItem() }}
                placeholder="Yeni madde ekle... (Enter)"
                style={{ flex: 1, padding: '11px 0', background: 'transparent', border: 'none', fontSize: 14, color: '#111827', outline: 'none', fontFamily: 'inherit' }} />
            </div>
            <button onClick={handleAddItem} disabled={!newItemText.trim()} style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0, border: 'none',
              background: newItemText.trim() ? selectedList.color : '#f3f4f6',
              cursor: newItemText.trim() ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: newItemText.trim() ? '#fff' : '#d1d5db', transition: 'all 0.15s',
            }}>
              <Plus size={18} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── ANA SAYFA ──────────────────────────────────────────────────────────────
  const STATS = [
    { label: 'Toplam Liste', value: checklists.length, sub: 'liste', icon: <ListChecks size={22} />, bg: '#e8f3fb', color: '#2288c9', iconBg: '#2288c9' },
    { label: 'Tamamlanan', value: totalChecked, sub: 'madde', icon: <CheckCheck size={22} />, bg: '#d1fae5', color: '#059669', iconBg: '#10b981' },
    { label: 'Bekleyen', value: totalPending, sub: 'madde', icon: <Clock size={22} />, bg: '#fef9c3', color: '#b45309', iconBg: '#f59e0b' },
    { label: 'Paylaşımlı', value: sharedCount, sub: `/ ${myCount} kişisel`, icon: <Users size={22} />, bg: '#fce7f3', color: '#be185d', iconBg: '#ec4899' },
  ]

  const pad = isMobile ? '16px 16px 0' : '24px 28px 0'
  const padCards = isMobile ? '0 16px 24px' : '0 28px 28px'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f5f7fa', overflowY: 'auto' }}>
      <div style={{ padding: pad, flexShrink: 0 }}>

        {/* Başlık + buton */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: isMobile ? 17 : 20, fontWeight: 800, color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>Listelerim</h1>
            {!isMobile && <p style={{ fontSize: 13, color: '#9ca3af', margin: '3px 0 0' }}>Kişisel ve ekip checklist'lerini yönet</p>}
          </div>
          <button onClick={() => setShowModal(true)} style={{
            display: 'flex', alignItems: 'center', gap: 6, background: '#2288c9',
            border: 'none', borderRadius: 10, padding: isMobile ? '8px 13px' : '9px 16px',
            color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            <Plus size={15} /> {isMobile ? 'Yeni' : 'Yeni Liste'}
          </button>
        </div>

        {/* Arama */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 12,
          padding: '0 16px', marginBottom: 20,
        }}
          onFocusCapture={e => { (e.currentTarget as HTMLElement).style.borderColor = '#2288c9' }}
          onBlurCapture={e => { (e.currentTarget as HTMLElement).style.borderColor = '#e5e7eb' }}
        >
          <Search size={16} color="#9ca3af" style={{ flexShrink: 0 }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Liste veya etiket ara..."
            style={{
              flex: 1, padding: '11px 0', background: 'transparent',
              border: 'none', fontSize: 14, color: '#111827', outline: 'none', fontFamily: 'inherit',
            }} />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0 }}>
              <X size={14} />
            </button>
          )}
        </div>

        {/* Stat kartları */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? 10 : 14, marginBottom: isMobile ? 16 : 24 }}>
          {STATS.map(s => (
            <div key={s.label} style={{
              background: s.bg, borderRadius: 14, padding: isMobile ? '13px 14px' : '18px 18px 16px',
              border: `1px solid ${s.color}20`,
            }}>
              <div style={{
                width: isMobile ? 32 : 40, height: isMobile ? 32 : 40, borderRadius: 10, background: s.iconBg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', marginBottom: isMobile ? 8 : 12,
              }}>
                {s.icon}
              </div>
              <div style={{ fontSize: 10, fontWeight: 600, color: s.color, marginBottom: 3, letterSpacing: '0.02em' }}>{s.label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: isMobile ? 20 : 26, fontWeight: 900, color: '#111827', letterSpacing: '-0.03em', lineHeight: 1 }}>{s.value}</span>
                <span style={{ fontSize: 11, color: s.color, fontWeight: 600 }}>{s.sub}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Filtreler */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 3, gap: 2 }}>
            {(['all', 'mine', 'shared'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: isMobile ? '5px 10px' : '5px 14px', borderRadius: 8, fontSize: isMobile ? 11 : 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit', border: 'none', transition: 'all 0.15s',
                background: filter === f ? '#2288c9' : 'transparent',
                color: filter === f ? '#fff' : '#9ca3af',
              }}>
                {isMobile
                  ? (f === 'all' ? 'Hepsi' : f === 'mine' ? 'Kişisel' : 'Paylaşımlı')
                  : (f === 'all' ? `Hepsi (${checklists.length})` : f === 'mine' ? `Kişisel (${myCount})` : `Paylaşımlı (${sharedCount})`)}
              </button>
            ))}
          </div>
          {search && (
            <span style={{ fontSize: 12, color: '#9ca3af' }}>
              "{search}" için <strong style={{ color: '#111827' }}>{visibleLists.length}</strong> sonuç
            </span>
          )}
        </div>
      </div>

      {/* Liste kartları */}
      <div style={{ flex: 1, padding: padCards }}>
        {visibleLists.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', paddingTop: 60, gap: 14,
          }}>
            <div style={{ width: 64, height: 64, borderRadius: 18, background: '#e8f3fb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>📋</div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>
                {search ? 'Sonuç bulunamadı' : filter === 'all' ? 'Henüz liste yok' : 'Bu filtrede liste yok'}
              </div>
              <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>
                {search ? `"${search}" ile eşleşen liste bulunamadı` : 'İlk listeyi oluşturmak için butona tıkla'}
              </div>
            </div>
            {!search && filter === 'all' && (
              <button onClick={() => setShowModal(true)} style={{
                display: 'flex', alignItems: 'center', gap: 7, background: '#2288c9',
                border: 'none', borderRadius: 10, padding: '10px 20px',
                color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}>
                <Plus size={15} /> İlk Listeyi Oluştur
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(260px, 1fr))', gap: isMobile ? 10 : 14 }}>
            {visibleLists.map(cl => (
              <GridCard key={cl.id} cl={cl} isOwner={cl.created_by === userId} isMobile={isMobile}
                onClick={() => setSelectedId(cl.id)} onDelete={() => handleDeleteList(cl.id)} />
            ))}
            <button onClick={() => setShowModal(true)} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 8, padding: '32px', borderRadius: 16, background: 'transparent',
              border: '2px dashed #d1d5db', cursor: 'pointer', color: '#9ca3af',
              fontSize: 13, fontWeight: 600, fontFamily: 'inherit', transition: 'all 0.15s', minHeight: 140,
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#2288c9'; e.currentTarget.style.color = '#2288c9'; e.currentTarget.style.background = '#e8f3fb' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.background = 'transparent' }}
            >
              <Plus size={20} /> Yeni Liste
            </button>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div onClick={() => setShowModal(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.5)',
          zIndex: 50, display: 'flex',
          alignItems: isMobile ? 'flex-end' : 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(3px)',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: isMobile ? '20px 20px 0 0' : 20,
            padding: isMobile ? '24px 20px' : '28px',
            width: isMobile ? '100%' : 420,
            maxHeight: isMobile ? '90vh' : undefined,
            overflowY: isMobile ? 'auto' : undefined,
            boxShadow: '0 24px 60px rgba(0,0,0,0.18)',
            border: '1px solid #e5e7eb',
            alignSelf: isMobile ? 'flex-end' : undefined,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, background: newColor,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s',
                }}>
                  <CheckSquare size={17} color="#fff" />
                </div>
                <span style={{ fontSize: 16, fontWeight: 800, color: '#111827' }}>Yeni Liste</span>
              </div>
              <button onClick={() => setShowModal(false)} style={{
                background: '#f3f4f6', border: 'none', borderRadius: 8,
                width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280',
              }}><X size={15} /></button>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', marginBottom: 6, display: 'block', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Liste Adı</label>
              <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddList() }}
                placeholder="ör. Alışveriş, Sprint 5, Kitap Listesi..."
                style={{
                  width: '100%', padding: '11px 13px', borderRadius: 10,
                  border: `1.5px solid ${newTitle ? newColor : '#e5e7eb'}`,
                  fontSize: 14, color: '#111827', outline: 'none', fontFamily: 'inherit',
                  boxSizing: 'border-box', background: '#f9fafb', transition: 'border-color 0.15s',
                }} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', marginBottom: 6, display: 'block', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Etiket <span style={{ fontWeight: 400, textTransform: 'none', color: '#d1d5db' }}>(isteğe bağlı)</span>
              </label>
              <input value={newTag} onChange={e => setNewTag(e.target.value)}
                placeholder="ör. Market, İş, Kişisel..."
                style={{
                  width: '100%', padding: '11px 13px', borderRadius: 10,
                  border: '1.5px solid #e5e7eb', fontSize: 14, color: '#111827',
                  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', background: '#f9fafb',
                }} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', marginBottom: 10, display: 'block', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Renk</label>
              <div style={{ display: 'flex', gap: 10 }}>
                {COLORS.map(c => (
                  <button key={c} onClick={() => setNewColor(c)} style={{
                    width: 30, height: 30, borderRadius: 9, background: c, border: 'none', cursor: 'pointer',
                    outline: newColor === c ? `3px solid ${c}` : '3px solid transparent', outlineOffset: 2,
                    transform: newColor === c ? 'scale(1.2)' : 'scale(1)', transition: 'all 0.15s',
                  }} />
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 22 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', marginBottom: 8, display: 'block', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Gizlilik</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {([false, true] as const).map(shared => (
                  <button key={String(shared)} onClick={() => setNewIsShared(shared)} style={{
                    flex: 1, padding: '9px 0', borderRadius: 10, fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                    background: newIsShared === shared ? (shared ? '#d1fae5' : '#e8f3fb') : '#f9fafb',
                    border: `1.5px solid ${newIsShared === shared ? (shared ? '#10b981' : '#2288c9') : '#e5e7eb'}`,
                    color: newIsShared === shared ? (shared ? '#059669' : '#2288c9') : '#9ca3af',
                  }}>
                    {shared ? '🌍 Ekiple Paylaş' : '🔒 Kişisel'}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={handleAddList} disabled={!newTitle.trim() || saving} style={{
              width: '100%', padding: '12px 0', borderRadius: 11,
              background: newTitle.trim() ? newColor : '#f3f4f6',
              border: 'none', color: newTitle.trim() ? '#fff' : '#d1d5db',
              fontSize: 14, fontWeight: 700, cursor: newTitle.trim() ? 'pointer' : 'default',
              fontFamily: 'inherit', transition: 'all 0.2s',
            }}>
              {saving ? 'Oluşturuluyor...' : '+ Liste Oluştur'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function GridCard({ cl, isOwner, onClick, onDelete, isMobile }: {
  cl: ChecklistWithProgress; isOwner: boolean; onClick: () => void; onDelete: () => void; isMobile?: boolean
}) {
  const [hov, setHov] = useState(false)
  return (
    <div onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        borderRadius: 16, cursor: 'pointer', background: '#fff',
        border: `1px solid ${hov ? cl.color + '50' : '#e5e7eb'}`,
        boxShadow: hov ? `0 8px 24px ${cl.color}18` : '0 1px 4px rgba(0,0,0,0.05)',
        transition: 'all 0.16s', transform: hov ? 'translateY(-2px)' : 'none',
        overflow: 'hidden',
      }}>
      {/* Renkli üst çizgi */}
      <div style={{ height: 4, background: cl.color }} />

      <div style={{ padding: '16px 16px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: cl.color + '15',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <CheckSquare size={16} color={cl.color} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {cl.title}
            </div>
            <div style={{ display: 'flex', gap: 5, marginTop: 5, flexWrap: 'wrap' }}>
              {cl.tag && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: cl.color + '15', color: cl.color }}>
                  {cl.tag}
                </span>
              )}
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
                background: cl.is_shared ? '#d1fae5' : '#f3f4f6',
                color: cl.is_shared ? '#059669' : '#9ca3af',
              }}>
                {cl.is_shared ? '🌍 Paylaşımlı' : '🔒 Kişisel'}
              </span>
            </div>
          </div>
          {isOwner && (
            <button onClick={e => { e.stopPropagation(); onDelete() }} style={{
              background: 'none', border: 'none', borderRadius: 7, padding: '4px',
              cursor: 'pointer', flexShrink: 0, color: (hov || isMobile) ? '#ef4444' : '#e5e7eb', transition: 'color 0.15s',
            }}>
              <Trash2 size={14} />
            </button>
          )}
        </div>

        {/* Progress */}
        <div style={{ height: 6, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden', marginBottom: 8 }}>
          <div style={{
            height: '100%', borderRadius: 99, background: cl.color,
            width: `${cl.progress}%`, transition: 'width 0.4s ease',
          }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 500 }}>
            <span style={{ color: cl.color, fontWeight: 700 }}>{cl.checked}</span>/{cl.total} tamamlandı
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: cl.progress === 100 ? '#059669' : cl.color }}>
            {cl.progress === 100 ? '✓ Bitti' : `${cl.progress}%`}
          </span>
        </div>
      </div>
    </div>
  )
}

function ItemRow({ item, color, onToggle, onDelete, isMobile }: {
  item: ChecklistItem; color: string; onToggle: () => void; onDelete: () => void; isMobile?: boolean
}) {
  const [hov, setHov] = useState(false)
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={{
      display: 'flex', alignItems: 'center', gap: 11, padding: '10px 13px',
      borderRadius: 12, marginBottom: 5,
      background: item.is_checked ? '#f9fafb' : '#fff',
      border: `1px solid ${hov && !item.is_checked ? color + '40' : '#e5e7eb'}`,
      transition: 'all 0.12s',
    }}>
      <button onClick={onToggle} style={{
        width: 22, height: 22, borderRadius: 7, flexShrink: 0, border: 'none',
        background: item.is_checked ? color : 'transparent',
        outline: item.is_checked ? 'none' : `2px solid ${color}`,
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
      }}>
        {item.is_checked && (
          <svg width={12} height={12} viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <span style={{
        flex: 1, fontSize: 14, fontWeight: 500,
        color: item.is_checked ? '#9ca3af' : '#111827',
        textDecoration: item.is_checked ? 'line-through' : 'none', transition: 'all 0.2s',
      }}>{item.text}</span>
      {(hov || isMobile) && (
        <button onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', color: isMobile ? '#d1d5db' : '#e5e7eb', padding: '2px', borderRadius: 5 }}
          onMouseEnter={e => { e.currentTarget.style.color = '#ef4444' }}
          onMouseLeave={e => { e.currentTarget.style.color = isMobile ? '#d1d5db' : '#e5e7eb' }}
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  )
}
