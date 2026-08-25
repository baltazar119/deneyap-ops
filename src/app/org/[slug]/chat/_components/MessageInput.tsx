'use client'

import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { Send, Mic, MicOff } from 'lucide-react'
import { OrgMember, Profile } from './types'
import { avatarBg, getInitials } from './helpers'

interface Props {
  placeholder: string
  members: OrgMember[]
  profileMap: Record<string, Profile | null>
  disabled?: boolean
  onSend: (content: string) => Promise<void>
}

export default function MessageInput({ placeholder, members, profileMap, disabled, onSend }: Props) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionStart, setMentionStart] = useState(-1)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [isListening, setIsListening] = useState(false)
  const [micErrMsg, setMicErrMsg] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const interimRef = useRef('')

  function toggleMic() {
    setMicErrMsg(null)
    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      interimRef.current = ''
      return
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      setMicErrMsg('Tarayıcınız desteklemiyor. Chrome veya Edge kullanın.')
      return
    }
    const rec = new SR()
    rec.lang = 'tr-TR'
    rec.interimResults = true
    rec.continuous = false
    const baseText = draft.trimEnd()
    interimRef.current = ''
    rec.onresult = (e: any) => {
      let interim = ''
      let final = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) final += t
        else interim += t
      }
      if (final) {
        interimRef.current = ''
        setDraft((baseText ? baseText + ' ' : '') + final.trim())
      } else {
        interimRef.current = interim
        setDraft((baseText ? baseText + ' ' : '') + interim)
      }
    }
    rec.onend = () => { setIsListening(false); interimRef.current = '' }
    rec.onerror = (e: any) => {
      setIsListening(false)
      interimRef.current = ''
      if (e.error === 'not-allowed') {
        setMicErrMsg('Mikrofon izni reddedildi. Adres çubuğundaki 🔒 kilit → Mikrofon → İzin Ver → sayfayı yenile.')
      } else if (e.error === 'no-speech') {
        setMicErrMsg(null) // normal — kullanıcı konuşmadı
      } else {
        setMicErrMsg('Ses tanıma başlatılamadı. Mikrofon izinlerini kontrol et.')
      }
    }
    rec.start()
    recognitionRef.current = rec
    setIsListening(true)
  }

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
  }, [draft])

  // Filter members for mention
  const mentionCandidates = mentionQuery !== null
    ? [
        ...(mentionQuery === '' || 'here'.startsWith(mentionQuery.toLowerCase())
          ? [{ user_id: '__here__', label: '@here', sub: 'Çevrimiçi herkesi etiketle' }]
          : []),
        ...(mentionQuery === '' || 'channel'.startsWith(mentionQuery.toLowerCase())
          ? [{ user_id: '__channel__', label: '@channel', sub: 'Kanal üyelerini etiketle' }]
          : []),
        ...members
          .filter(m => {
            const name = (profileMap[m.user_id]?.full_name ?? profileMap[m.user_id]?.username ?? '').toLowerCase()
            return mentionQuery === '' || name.includes(mentionQuery.toLowerCase())
          })
          .map(m => ({
            user_id: m.user_id,
            label: profileMap[m.user_id]?.full_name ?? profileMap[m.user_id]?.username ?? m.user_id.slice(0, 8),
            sub: profileMap[m.user_id]?.username ? `@${profileMap[m.user_id]?.username}` : '',
          })),
      ].slice(0, 8)
    : []

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    setDraft(val)

    // Detect @ trigger
    const cursor = e.target.selectionStart ?? val.length
    const textBefore = val.slice(0, cursor)
    const match = textBefore.match(/@(\w*)$/)
    if (match) {
      setMentionQuery(match[1])
      setMentionStart(cursor - match[0].length)
      setMentionIndex(0)
    } else {
      setMentionQuery(null)
      setMentionStart(-1)
    }
  }

  function insertMention(candidate: { user_id: string; label: string }) {
    const cursor = textareaRef.current?.selectionStart ?? draft.length
    const before = draft.slice(0, mentionStart)
    const after = draft.slice(cursor)
    let token: string
    if (candidate.user_id === '__here__') token = '@here'
    else if (candidate.user_id === '__channel__') token = '@channel'
    else token = `<@${candidate.user_id}>`
    const newDraft = before + token + ' ' + after
    setDraft(newDraft)
    setMentionQuery(null)
    setMentionStart(-1)
    setTimeout(() => {
      const ta = textareaRef.current
      if (ta) {
        const pos = before.length + token.length + 1
        ta.focus()
        ta.setSelectionRange(pos, pos)
      }
    }, 0)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionQuery !== null && mentionCandidates.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => Math.min(i + 1, mentionCandidates.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => Math.max(i - 1, 0)); return }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault()
        insertMention(mentionCandidates[mentionIndex])
        return
      }
      if (e.key === 'Escape') { setMentionQuery(null); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  async function handleSend() {
    const content = draft.trim()
    if (!content || sending) return
    setSending(true)
    setDraft('')
    setMentionQuery(null)
    try { await onSend(content) } finally { setSending(false) }
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* Mic error message */}
      {micErrMsg && (
        <div style={{
          marginBottom: 6, padding: '7px 12px', borderRadius: 10,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
          fontSize: 12, color: '#dc2626', lineHeight: 1.5,
          display: 'flex', alignItems: 'flex-start', gap: 6,
        }}>
          <span style={{ flexShrink: 0, marginTop: 1 }}>🎤</span>
          <span>{micErrMsg}</span>
          <button
            onClick={() => setMicErrMsg(null)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 14, padding: 0, lineHeight: 1 }}
          >×</button>
        </div>
      )}
      {/* Mention dropdown */}
      {mentionQuery !== null && mentionCandidates.length > 0 && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 0, right: 0,
          marginBottom: 8, borderRadius: 14,
          background: '#ffffff', border: '1px solid #e2e8f0',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.1)', overflow: 'hidden', zIndex: 10,
        }}>
          {mentionCandidates.map((c, i) => (
            <div
              key={c.user_id}
              onClick={() => insertMention(c)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 13px', cursor: 'pointer',
                background: i === mentionIndex ? 'rgba(37,99,235,0.08)' : 'transparent',
                transition: 'background 0.1s',
              }}
              onMouseEnter={() => setMentionIndex(i)}
            >
              {c.user_id.startsWith('__') ? (
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#64748b' }}>@</div>
              ) : (
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: avatarBg(c.user_id), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', overflow: 'hidden', flexShrink: 0 }}>
                  {profileMap[c.user_id]?.avatar_url
                    ? <img src={profileMap[c.user_id]!.avatar_url!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : getInitials(profileMap[c.user_id])
                  }
                </div>
              )}
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1e293b' }}>{c.label}</div>
                {c.sub && <div style={{ fontSize: 11.5, color: '#94a3b8' }}>{c.sub}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Input row */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: 10,
        background: '#f8fafc', borderRadius: 16,
        border: '1px solid #e2e8f0', padding: '10px 12px',
        transition: 'border-color 0.2s',
      }}
        onFocus={e => { e.currentTarget.style.borderColor = 'rgba(37,99,235,0.4)' }}
        onBlur={e => { e.currentTarget.style.borderColor = '#e2e8f0' }}
      >
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || sending}
          rows={1}
          style={{
            flex: 1, background: 'none', border: 'none', outline: 'none',
            color: '#1e293b', fontSize: 14, resize: 'none', fontFamily: 'inherit',
            lineHeight: 1.55, maxHeight: 160, overflow: 'auto',
          }}
        />
        {/* Mic button */}
        <button
          onClick={toggleMic}
          disabled={disabled || sending}
          title={isListening ? 'Dinlemeyi durdur' : 'Sesle yaz (Türkçe)'}
          style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: isListening ? 'linear-gradient(135deg, #ef4444, #dc2626)' : '#f1f5f9',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s',
            boxShadow: isListening ? '0 0 0 3px rgba(239,68,68,0.25)' : 'none',
            animation: isListening ? 'micPulse 1.4s ease-in-out infinite' : 'none',
          }}
        >
          {isListening
            ? <MicOff size={16} color="#fff" />
            : <Mic size={16} color="#64748b" />
          }
        </button>

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!draft.trim() || sending}
          style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: draft.trim() ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : '#e2e8f0',
            border: 'none', cursor: draft.trim() ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s',
          }}
        >
          <Send size={16} color={draft.trim() ? '#fff' : '#94a3b8'} />
        </button>

        <style>{`
          @keyframes micPulse {
            0%, 100% { box-shadow: 0 0 0 3px rgba(239,68,68,0.25); }
            50% { box-shadow: 0 0 0 6px rgba(239,68,68,0.12); }
          }
        `}</style>
      </div>
    </div>
  )
}
