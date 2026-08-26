/** Rapor uçlarının gerçek HTTP ile kontrolü — her rol, her format. */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const KOK = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TABAN = 'http://localhost:3000'
const SLUG = 'deneyap-demo'
const CIKTI = resolve(KOK, '.rapor-ciktilari')

const env = Object.fromEntries(
  readFileSync(`${KOK}/.env.local`, 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))

mkdirSync(CIKTI, { recursive: true })

const HESAPLAR = [
  ['merkez@deneyap.demo', 'Merkez Operasyon'],
  ['koordinator@deneyap.demo', 'Koordinatör'],
  ['ankara@deneyap.demo', 'İl Sorumlusu (Ankara)'],
  ['yonetici@deneyap.demo', 'Yetkili Yönetici'],
]

for (const [eposta, etiket] of HESAPLAR) {
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { data, error } = await anon.auth.signInWithPassword({ email: eposta, password: 'Deneyap2026!' })
  if (error) { console.log(etiket.padEnd(24), 'oturum HATASI:', error.message); continue }
  const H = { Authorization: `Bearer ${data.session.access_token}` }

  // JSON — kapsam kontrolü
  const jr = await fetch(`${TABAN}/api/org/${SLUG}/rapor?format=json&donem=tumu`, { headers: H })
  if (!jr.ok) { console.log(etiket.padEnd(24), 'JSON', jr.status, (await jr.json()).error); continue }
  const v = await jr.json()

  const iller = [...new Set(v.ilKirilimi.map(x => x.il))]
  const isimVar = JSON.stringify(v).includes('Sorumlusu') || v.sorumluKirilimi.length > 0

  console.log(`\n${etiket}`)
  console.log('  rapor adı :', v.meta.raporAdi)
  console.log('  kapsam    :', v.meta.kapsamEtiketi)
  console.log('  görev     :', v.kpi.toplam, '| geciken:', v.kpi.geciken, '| oran: %' + v.kpi.tamamlanmaOrani)
  console.log('  iller     :', iller.join(', ') || '—')
  console.log('  kişi verisi:', isimVar ? 'VAR' : 'yok')
  console.log('  bölümler  :', v.meta.bolumler.join(', '))

  for (const fmt of ['pdf', 'xlsx', 'csv']) {
    const r = await fetch(`${TABAN}/api/org/${SLUG}/rapor?format=${fmt}&donem=tumu`, { headers: H })
    if (!r.ok) { console.log(`  ${fmt.padEnd(4)}: HATA ${r.status}`); continue }
    const buf = Buffer.from(await r.arrayBuffer())
    const ad = `${eposta.split('@')[0]}.${fmt}`
    writeFileSync(resolve(CIKTI, ad), buf)
    console.log(`  ${fmt.padEnd(4)}: ${String(buf.length).padStart(7)} bayt → .rapor-ciktilari/${ad}`)
  }
}
console.log('\nÇıktılar:', CIKTI)
