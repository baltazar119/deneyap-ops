import type { AppNotification } from '@/types/database'

/* ── DENEYAP renk paleti ──────────────────────────────────────────────────── */
const C = {
  bg:       '#f0f4f8',
  card:     '#ffffff',
  header:   '#0d1a2a',
  header2:  '#182c3f',
  primary:  '#2288c9',
  accent:   '#2abbd5',
  light:    '#7acfe6',
  pale:     '#bee5f0',
  text:     '#0d1a2a',
  muted:    '#64748b',
  border:   '#d2e4ee',
}

/* ── Shell HTML ───────────────────────────────────────────────────────────── */
function shell(body: string): string {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>DENEYAP Ops Bildirimi</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

      <!-- Header -->
      <tr>
        <td style="background:linear-gradient(135deg,${C.header} 0%,${C.header2} 100%);padding:24px 28px;border-radius:16px 16px 0 0;">
          <table width="100%"><tr>
            <td>
              <span style="font-size:20px;font-weight:800;color:#fff;letter-spacing:-0.5px;">DENEYAP Ops</span><br/>
              <span style="font-size:11px;color:rgba(122,207,230,0.7);font-weight:500;letter-spacing:0.5px;">Operasyon Sistemi</span>
            </td>
            <td align="right">
              <span style="display:inline-block;padding:4px 12px;background:rgba(42,187,213,0.2);border:1px solid rgba(42,187,213,0.35);border-radius:20px;color:${C.accent};font-size:11px;font-weight:700;">BİLDİRİM</span>
            </td>
          </tr></table>
        </td>
      </tr>

      <!-- Body -->
      <tr>
        <td style="background:${C.card};padding:28px;border-left:1px solid ${C.border};border-right:1px solid ${C.border};">
          ${body}
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="background:#f8fafc;padding:16px 28px;border:1px solid ${C.border};border-top:none;border-radius:0 0 16px 16px;text-align:center;">
          <p style="margin:0;font-size:11px;color:${C.muted};">Bu bildirim DENEYAP Ops Operasyon Sistemi tarafından gönderilmiştir.</p>
          <p style="margin:4px 0 0;font-size:11px;color:${C.muted};">E-posta bildirimlerini <a href="{{APP_URL}}/profile" style="color:${C.primary};text-decoration:none;">profil ayarlarınızdan</a> yönetebilirsiniz.</p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`
}

/* ── Olay renk + ikon eşlemesi ────────────────────────────────────────────── */
const EVENT_META: Record<string, { color: string; bg: string; label: string }> = {
  task_assigned:        { color: '#2288c9', bg: '#e0f2fe', label: 'Görev Atandı' },
  task_status_changed:  { color: '#059669', bg: '#d1fae5', label: 'Durum Değişti' },
  task_overdue:         { color: '#dc2626', bg: '#fee2e2', label: 'Gecikmiş Görev' },
  review_reply:         { color: '#7c3aed', bg: '#ede9fe', label: 'Yeni Yanıt' },
  mention:              { color: '#b45309', bg: '#fef3c7', label: 'Mention' },
  annotation_resolved:  { color: '#059669', bg: '#d1fae5', label: 'Annotation Çözüldü' },
  new_version:          { color: '#2abbd5', bg: '#e0f9fe', label: 'Yeni Versiyon' },
  sprint_changed:       { color: '#2288c9', bg: '#e0f2fe', label: 'Sprint Güncellendi' },
}

/* ── Anlık bildirim maili ─────────────────────────────────────────────────── */
export function renderInstantEmail(params: {
  title: string
  description: string | null
  link: string | null
  actorName: string | null
  eventType: string
  appUrl: string
}): string {
  const meta = EVENT_META[params.eventType] || { color: C.primary, bg: C.pale, label: 'Bildirim' }
  const actionUrl = params.link ? `${params.appUrl}${params.link}` : params.appUrl

  const body = `
    <!-- Event badge -->
    <div style="margin-bottom:20px;">
      <span style="display:inline-block;padding:4px 12px;background:${meta.bg};border-radius:20px;font-size:12px;font-weight:700;color:${meta.color};">${meta.label}</span>
    </div>

    <!-- Title -->
    <h2 style="margin:0 0 10px;font-size:20px;font-weight:800;color:${C.text};line-height:1.3;">${params.title}</h2>

    <!-- Description -->
    ${params.description ? `<p style="margin:0 0 20px;font-size:15px;color:${C.muted};line-height:1.6;">${params.description}</p>` : ''}

    <!-- Actor -->
    ${params.actorName ? `<p style="margin:0 0 24px;font-size:13px;color:${C.muted};">İşlemi yapan: <strong style="color:${C.text};">${params.actorName}</strong></p>` : ''}

    <!-- Divider -->
    <div style="height:1px;background:${C.border};margin:0 0 24px;"></div>

    <!-- CTA Button -->
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <a href="${actionUrl}"
            style="display:inline-block;padding:13px 32px;background:linear-gradient(135deg,${C.accent},${C.primary});color:#fff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:700;letter-spacing:0.2px;box-shadow:0 4px 12px rgba(34,136,201,0.3);">
            Uygulamada Görüntüle →
          </a>
        </td>
      </tr>
    </table>
  `

  return shell(body).replace(/\{\{APP_URL\}\}/g, params.appUrl)
}

/* ── Özet maili (günlük / haftalık) ──────────────────────────────────────── */
export function renderDigestEmail(params: {
  userName: string
  notifications: AppNotification[]
  period: 'daily' | 'weekly'
  appUrl: string
}): string {
  const periodLabel = params.period === 'daily' ? 'Günlük Özet' : 'Haftalık Özet'

  // Gruplama
  const tasks  = params.notifications.filter((n) => n.type === 'task')
  const review = params.notifications.filter((n) => n.type === 'review')
  const other  = params.notifications.filter((n) => n.type !== 'task' && n.type !== 'review')

  function renderGroup(title: string, color: string, items: AppNotification[]): string {
    if (items.length === 0) return ''
    const rows = items.map((n) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid ${C.border};">
          <p style="margin:0;font-size:14px;font-weight:700;color:${C.text};">${n.title}</p>
          ${n.description ? `<p style="margin:2px 0 0;font-size:13px;color:${C.muted};">${n.description}</p>` : ''}
          ${n.actor_name ? `<p style="margin:4px 0 0;font-size:12px;color:${C.muted};">— ${n.actor_name}</p>` : ''}
        </td>
      </tr>
    `).join('')
    return `
      <div style="margin-bottom:24px;">
        <h3 style="margin:0 0 12px;font-size:13px;font-weight:800;color:${color};text-transform:uppercase;letter-spacing:0.8px;">${title} (${items.length})</h3>
        <table width="100%" cellpadding="0" cellspacing="0">${rows}</table>
      </div>
    `
  }

  const body = `
    <!-- Greeting -->
    <p style="margin:0 0 6px;font-size:14px;color:${C.muted};">${periodLabel}</p>
    <h2 style="margin:0 0 24px;font-size:22px;font-weight:800;color:${C.text};">Merhaba${params.userName ? ', ' + params.userName : ''}!</h2>
    <p style="margin:0 0 28px;font-size:15px;color:${C.muted};line-height:1.6;">
      ${params.period === 'daily' ? 'Son 24 saatteki' : 'Bu haftaki'}
      <strong style="color:${C.text};">${params.notifications.length} bildiriminiz</strong> var.
    </p>

    <!-- Divider -->
    <div style="height:1px;background:${C.border};margin:0 0 24px;"></div>

    ${renderGroup('Görevler', C.primary, tasks)}
    ${renderGroup('Review', '#7c3aed', review)}
    ${renderGroup('Diğer', C.muted, other)}

    <!-- CTA -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">
      <tr>
        <td align="center">
          <a href="${params.appUrl}"
            style="display:inline-block;padding:13px 32px;background:linear-gradient(135deg,${C.accent},${C.primary});color:#fff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:700;letter-spacing:0.2px;box-shadow:0 4px 12px rgba(34,136,201,0.3);">
            Uygulamayı Aç →
          </a>
        </td>
      </tr>
    </table>
  `

  return shell(body).replace(/\{\{APP_URL\}\}/g, params.appUrl)
}
