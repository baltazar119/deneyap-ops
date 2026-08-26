/**
 * Vercel'e yapıştırılacak ortam değişkeni metnini üretir.
 *
 *   node scripts/vercel-env.mjs https://deneyap-ops.vercel.app
 *
 * .env.local'i okur, üretim için düzeltir ve `.env.vercel` dosyasına yazar:
 *   · NEXT_PUBLIC_APP_URL ve Google yönlendirme adresleri gerçek adrese çevrilir
 *   · Boş değişkenler atlanır (Vercel'de boş değişken hataya yol açabiliyor)
 *   · Placeholder kalmış değişkenler uyarıyla atlanır
 *
 * Üretilen dosya .gitignore'da — commit edilmez.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const KOK = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const adres = process.argv[2]?.replace(/\/+$/, '')
if (!adres || !/^https:\/\//.test(adres)) {
  console.error('\nKullanım: node scripts/vercel-env.mjs https://<vercel-adresin>\n')
  process.exit(1)
}

/** Demo panelini üretime taşımak isteyip istemediğiniz */
const demoModunuDahilEt = process.argv.includes('--demo')

const satirlar = readFileSync(`${KOK}/.env.local`, 'utf8').split('\n')
const env = {}
for (const l of satirlar) {
  const t = l.trim()
  if (!t || t.startsWith('#') || !t.includes('=')) continue
  const i = t.indexOf('=')
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
}

/* Üretim için düzeltilenler */
env.NEXT_PUBLIC_APP_URL      = adres
env.GOOGLE_REDIRECT_URI      = `${adres}/api/drive/callback`
env.GOOGLE_GCAL_REDIRECT_URI = `${adres}/api/gcal/callback`

/** Değeri hâlâ şablon metni olan değişkenler — Vercel'e taşımanın anlamı yok */
const placeholderMi = (v) =>
  !v || /^(your-|replace-with|<.*>$)/i.test(v) || v === 'your@gmail.com'

const dahil = []
const atlanan = []

for (const [k, v] of Object.entries(env)) {
  if (k === 'NEXT_PUBLIC_DEMO_MODE' && !demoModunuDahilEt) {
    atlanan.push([k, 'demo paneli üretimde kapalı (açmak için --demo)'])
    continue
  }
  if (!v) { atlanan.push([k, 'boş']); continue }
  if (placeholderMi(v)) { atlanan.push([k, 'şablon değeri, gerçek değil']); continue }
  dahil.push([k, v])
}

const cikti = dahil.map(([k, v]) => `${k}=${v}`).join('\n') + '\n'
const yol = resolve(KOK, '.env.vercel')
writeFileSync(yol, cikti, 'utf8')

console.log(`\nVercel ortam değişkenleri hazır → .env.vercel  (${dahil.length} değişken)\n`)
console.log('Dahil edilenler:')
dahil.forEach(([k]) => console.log('  ·', k))

if (atlanan.length) {
  console.log('\nAtlananlar:')
  atlanan.forEach(([k, sebep]) => console.log(`  ·  ${k.padEnd(32)} ${sebep}`))
}

console.log(`
Nasıl kullanılır
  1. Vercel → projen → Settings → Environment Variables
  2. Sayfadaki "Import .env" / yapıştırma alanına .env.vercel içeriğini yapıştır
     (dosyayı Not Defteri ile açıp Ctrl+A, Ctrl+C)
  3. Environment: Production ve Preview ikisi de işaretli olsun
  4. Kaydet → Deployments → en üstteki dağıtımda "Redeploy"

Not: .env.vercel gizli değerler içerir, .gitignore'da tutuluyor.
`)
