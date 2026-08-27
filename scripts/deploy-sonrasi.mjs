/**
 * Deploy sonrası kurulum ve doğrulama.
 *
 *   node scripts/deploy-sonrasi.mjs https://deneyap-ops.vercel.app
 *
 * Yaptıkları:
 *   1. Sitenin ayakta olduğunu doğrular
 *   2. Telegram webhook'unu kaydeder (yerelde yapılamaz — Telegram herkese
 *      açık HTTPS ister)
 *   3. Webhook'un gerçekten kayıtlı olduğunu Telegram'a sorarak teyit eder
 *   4. Cron uçlarının yetkilendirmesini sınar (secret'sız istek reddedilmeli)
 *   5. Rapor ve içe aktarma uçlarının ayakta olduğunu kontrol eder
 *
 * Gizli değerler .env.local'den okunur, hiçbir yere yazılmaz/loglanmaz.
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const KOK = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const adres = process.argv[2]?.replace(/\/+$/, '')
if (!adres || !/^https:\/\//.test(adres)) {
  console.error('\nKullanım: node scripts/deploy-sonrasi.mjs https://<adresin>\n')
  process.exit(1)
}

const env = Object.fromEntries(
  readFileSync(`${KOK}/.env.local`, 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)

const isaret = { ok: '  ✓', hata: '  ✗', not: '  ·' }
let hataVar = false
function sonuc(basarili, metin) {
  console.log(`${basarili ? isaret.ok : isaret.hata} ${metin}`)
  if (!basarili) hataVar = true
}

console.log(`\nDENEYAP OYS — deploy sonrası kontrol\n${adres}\n`)

/* ── 1. Site ayakta mı ──────────────────────────────────────────────────── */
console.log('1) Site')
try {
  const r = await fetch(`${adres}/login`, { redirect: 'manual' })
  sonuc(r.status < 400, `giriş sayfası HTTP ${r.status}`)
} catch (e) {
  sonuc(false, `siteye ulaşılamadı: ${e.message}`)
  console.log('\nDevam edilemiyor.\n')
  process.exit(1)
}

/* ── 2. Telegram webhook ────────────────────────────────────────────────── */
console.log('\n2) Telegram webhook')
if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET) {
  sonuc(false, 'TELEGRAM_BOT_TOKEN / TELEGRAM_WEBHOOK_SECRET .env.local\'de yok')
} else {
  const kurulum = await fetch(`${adres}/api/kanal/telegram/kurulum`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
  })
  const kj = await kurulum.json().catch(() => ({}))
  sonuc(kurulum.ok, kurulum.ok ? `kaydedildi → ${kj.webhook}` : `kayıt hatası: ${kj.error ?? kurulum.status}`)

  // Telegram'a sorup teyit et
  const bilgi = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getWebhookInfo`)
  const bj = await bilgi.json()
  const url = bj?.result?.url ?? ''
  sonuc(url.startsWith(adres), url ? `Telegram'da kayıtlı: ${url}` : 'Telegram\'da webhook görünmüyor')
  if (bj?.result?.last_error_message) {
    console.log(`${isaret.not} Telegram son hata: ${bj.result.last_error_message}`)
  }
}

/* ── 3. Cron yetkilendirmesi ────────────────────────────────────────────── */
console.log('\n3) Cron güvenliği')
for (const yol of ['/api/cron/daily-checks', '/api/cron/haftalik-rapor', '/api/digest-email?type=daily']) {
  const r = await fetch(`${adres}${yol}`)
  sonuc(r.status === 401, `${yol} → secret'sız istek ${r.status} (401 beklenir)`)
}

/* ── 4. Eylem ucu GET ile mutasyon yapmamalı ────────────────────────────── */
console.log('\n4) E-posta aksiyon güvenliği')
{
  const r = await fetch(`${adres}/api/eylem/sahte-token`)
  sonuc(r.status === 405, `GET /api/eylem/... → ${r.status} (405 beklenir; e-posta tarayıcıları linkleri otomatik açar)`)
}

/* ── 5. Korumalı uçlar ──────────────────────────────────────────────────── */
console.log('\n5) Yetkilendirme')
for (const yol of ['/api/org/deneyap-demo/rapor?format=json', '/api/org/deneyap-demo/import/partiler']) {
  const r = await fetch(`${adres}${yol}`)
  sonuc(r.status === 401, `${yol.split('?')[0]} → oturumsuz istek ${r.status} (401 beklenir)`)
}

/* ── 6. Demo modu ───────────────────────────────────────────────────────── */
console.log('\n6) Demo modu')
{
  const r = await fetch(`${adres}/login`)
  const html = await r.text()
  const acik = html.includes('DEMO HESAPLA DENE')
  console.log(`${acik ? isaret.not : isaret.ok} demo paneli ${acik ? 'AÇIK' : 'kapalı'}`)
  if (acik) {
    console.log('    Creathon sunumu için uygun; gerçek veriyle kullanılmadan önce')
    console.log('    Vercel\'den NEXT_PUBLIC_DEMO_MODE değişkenini kaldırın.')
  }
}

/* ── Özet ───────────────────────────────────────────────────────────────── */
console.log(`\n${hataVar ? 'Bazı kontroller başarısız — yukarı bakın.' : 'Tüm kontroller geçti.'}\n`)

if (!hataVar) {
  console.log('Sırada:')
  console.log('  · Telegram\'da bota /start yazıp uygulamadan Profilim → Telegram\'a Bağla')
  console.log('  · Google OAuth kullanacaksanız Google Cloud Console\'da yönlendirme')
  console.log(`    adreslerini güncelleyin: ${adres}/api/drive/callback ve /api/gcal/callback\n`)
}
