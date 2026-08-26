import { describe, it, expect } from 'vitest'
import { renderInstantEmail, renderDigestEmail } from './emailTemplates'
import { esc, guvenliUrl } from './html'
import type { AppNotification } from '@/types/database'

const APP = 'https://deneyap-ops.vercel.app'

describe('esc', () => {
  it('HTML özel karakterlerini kaçırır', () => {
    expect(esc('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;')
    expect(esc(`"tırnak" & 'kesme'`)).toBe('&quot;tırnak&quot; &amp; &#39;kesme&#39;')
  })

  it('null/undefined için boş string döner', () => {
    expect(esc(null)).toBe('')
    expect(esc(undefined)).toBe('')
  })

  it('Türkçe karakterlere dokunmaz', () => {
    expect(esc('Şanlıurfa İl Müdürlüğü')).toBe('Şanlıurfa İl Müdürlüğü')
  })
})

describe('guvenliUrl', () => {
  it('http(s) ve göreli yollara izin verir', () => {
    expect(guvenliUrl('https://a.com/x', APP)).toBe('https://a.com/x')
    expect(guvenliUrl('/org/x/tasks', APP)).toBe('/org/x/tasks')
  })

  it('javascript: ve data: şemalarını reddeder', () => {
    expect(guvenliUrl('javascript:alert(1)', APP)).toBe(APP)
    expect(guvenliUrl('data:text/html,<script>', APP)).toBe(APP)
  })

  it('boş değerde yedeğe düşer', () => {
    expect(guvenliUrl(null, APP)).toBe(APP)
  })
})

describe('renderInstantEmail — kaçış regresyonu', () => {
  const kotu = '<img src=x onerror=alert(1)>'

  it('görev başlığındaki etiketi çalıştırılamaz hâle getirir', () => {
    const html = renderInstantEmail({
      title: kotu, description: null, link: null, actorName: null,
      eventType: 'task_assigned', appUrl: APP,
    })
    expect(html).not.toContain(kotu)
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('açıklama ve işlemi yapan alanlarını da kaçırır', () => {
    const html = renderInstantEmail({
      title: 'Normal', description: kotu, link: null, actorName: '<b>Ali</b>',
      eventType: 'task_assigned', appUrl: APP,
    })
    expect(html).not.toContain(kotu)
    expect(html).not.toContain('<b>Ali</b>')
  })

  it('javascript: linkini butona koymaz', () => {
    const html = renderInstantEmail({
      title: 'X', description: null, link: 'javascript:alert(1)', actorName: null,
      eventType: 'task_assigned', appUrl: APP,
    })
    expect(html).not.toContain('javascript:alert(1)')
  })

  it('tam URL verilirse appUrl ile birleştirmez', () => {
    const html = renderInstantEmail({
      title: 'X', description: null, link: 'https://baska.com/y', actorName: null,
      eventType: 'task_assigned', appUrl: APP,
    })
    expect(html).toContain('https://baska.com/y')
    expect(html).not.toContain(`${APP}https://`)
  })
})

describe('profil linki', () => {
  it('org slug verilince org bazlı profil sayfasına gider', () => {
    const html = renderInstantEmail({
      title: 'X', description: null, link: null, actorName: null,
      eventType: 'task_assigned', appUrl: APP, orgSlug: 'deneyap-demo',
    })
    expect(html).toContain(`${APP}/org/deneyap-demo/profile`)
  })

  it('slug yoksa kök /profile yerine workspace listesine düşer (o sayfa yok)', () => {
    const html = renderInstantEmail({
      title: 'X', description: null, link: null, actorName: null,
      eventType: 'task_assigned', appUrl: APP,
    })
    expect(html).toContain(`${APP}/workspaces`)
    expect(html).not.toContain(`${APP}/profile`)
  })
})

describe('renderDigestEmail — kaçış regresyonu', () => {
  it('bildirim başlığı ve kullanıcı adını kaçırır', () => {
    const bildirimler = [{
      id: '1', title: '<script>x</script>', description: '<i>y</i>',
      actor_name: '<b>z</b>', type: 'task',
    }] as unknown as AppNotification[]

    const html = renderDigestEmail({
      userName: '<em>Ayşe</em>', notifications: bildirimler,
      period: 'daily', appUrl: APP,
    })
    expect(html).not.toContain('<script>x</script>')
    expect(html).not.toContain('<i>y</i>')
    expect(html).not.toContain('<b>z</b>')
    expect(html).not.toContain('<em>Ayşe</em>')
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;')
  })
})
