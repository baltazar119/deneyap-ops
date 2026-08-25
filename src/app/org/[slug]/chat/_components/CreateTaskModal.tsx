'use client'

import { useState } from 'react'
import { X, CheckSquare } from 'lucide-react'
import { SupabaseClient } from '@supabase/supabase-js'
import { ChatMessage, OrgMember } from './types'

interface Props {
  message: ChatMessage
  orgId: string
  userId: string
  members: OrgMember[]
  supabase: SupabaseClient
  onClose: () => void
  onCreated: () => void
}

export default function CreateTaskModal({ message, orgId, userId, members, supabase, onClose, onCreated }: Props) {
  const [title, setTitle] = useState(message.content.slice(0, 120))
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('normal')
  const [assigneeId, setAssigneeId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function create() {
    if (!title.trim()) { setError('Başlık gerekli'); return }
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('tasks').insert({
      title: title.trim(),
      description: description.trim() || null,
      status: 'backlog',
      priority,
      assignee_id: assigneeId || null,
      due_date: dueDate || null,
      created_by: userId,
      organization_id: orgId,
    })
    if (err) { setError(err.message); setSaving(false); return }
    onCreated()
    onClose()
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 10,
    background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
    color: '#fff', fontSize: 13.5, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 480, borderRadius: 20,
          background: '#0f1e2e', border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <CheckSquare size={17} color="#22c55e" />
            <span style={{ fontSize: 15.5, fontWeight: 700, color: '#fff' }}>Mesajdan Görev Oluştur</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        {/* Kaynak mesaj */}
        <div style={{ margin: '14px 20px 0', padding: '10px 13px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', borderLeft: '3px solid #2563eb' }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Kaynak mesaj</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 60, overflow: 'hidden' }}>
            {message.content}
          </div>
        </div>

        {/* Form */}
        <div style={{ padding: '14px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.45)', marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Başlık *
            </label>
            <input value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} maxLength={200} />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.45)', marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Açıklama
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              style={{ ...inputStyle, resize: 'vertical', minHeight: 56 }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.45)', marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Öncelik
              </label>
              <select value={priority} onChange={e => setPriority(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="critical">🔴 Kritik</option>
                <option value="high">🟠 Yüksek</option>
                <option value="normal">🔵 Normal</option>
                <option value="low">⚪ Düşük</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.45)', marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Son Tarih
              </label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ ...inputStyle, colorScheme: 'dark' }} />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.45)', marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Atanan Kişi
            </label>
            <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">— Seçiniz —</option>
              {members.map(m => (
                <option key={m.user_id} value={m.user_id}>
                  {m.profile?.full_name ?? m.profile?.username ?? m.user_id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>

          {error && <div style={{ fontSize: 13, color: '#f87171' }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 2 }}>
            <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 10, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)', fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' }}>
              İptal
            </button>
            <button
              onClick={create}
              disabled={saving}
              style={{ padding: '9px 22px', borderRadius: 10, background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', border: 'none', color: '#fff', fontSize: 13.5, fontWeight: 600, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1, fontFamily: 'inherit' }}
            >
              {saving ? 'Oluşturuluyor…' : 'Görev Oluştur'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
