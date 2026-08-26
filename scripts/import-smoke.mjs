/**
 * İçe aktarma hattının uçtan uca kontrolü — gerçek HTTP, gerçek veritabanı.
 *
 * Akış: şablon indir → doldur → önizle → uygula → tekrar yükle (kopya
 * oluşmamalı) → geri al.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import ExcelJS from 'exceljs'

import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const KOK = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TABAN = 'http://localhost:3000'
const SLUG = 'deneyap-demo'

const env = Object.fromEntries(
  readFileSync(`${KOK}/.env.local`, 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// merkez@ olarak oturum aç (yazma yetkisi olan rol)
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const { data: oturum, error: oturumHata } = await anon.auth.signInWithPassword({
  email: 'merkez@deneyap.demo', password: 'Deneyap2026!',
})
if (oturumHata) { console.error('Oturum acilamadi:', oturumHata.message); process.exit(1) }
const TOKEN = oturum.session.access_token
const H = { Authorization: `Bearer ${TOKEN}` }

const orgRes = await db.from('organizations').select('id').eq('slug', SLUG).single()
const ORG_ID = orgRes.data.id

async function gorevSayisi() {
  const { count } = await db.from('tasks').select('id', { count: 'exact', head: true }).eq('organization_id', ORG_ID)
  return count
}

function bolum(s) { console.log('\n' + '─'.repeat(58) + '\n' + s) }

/* ── 1. Şablonu indir ──────────────────────────────────────────────────── */
bolum('1) Şablon indirme')
const sablonRes = await fetch(`${TABAN}/api/org/${SLUG}/import/sablon`, { headers: H })
console.log('  HTTP', sablonRes.status, '|', sablonRes.headers.get('content-type')?.slice(0, 50))
if (!sablonRes.ok) { console.error('  ' + await sablonRes.text()); process.exit(1) }
const sablonBuf = Buffer.from(await sablonRes.arrayBuffer())
console.log('  boyut:', sablonBuf.length, 'bayt')

const wbSablon = new ExcelJS.Workbook()
await wbSablon.xlsx.load(sablonBuf)
console.log('  sayfalar:', wbSablon.worksheets.map(w => w.name).join(', '))
console.log('  ilk sayfa:', wbSablon.worksheets[0].name)

/* ── 2. Şablonu doldur ─────────────────────────────────────────────────── */
bolum('2) Test dosyası hazırlanıyor')
const wb = new ExcelJS.Workbook()
const ws = wb.addWorksheet('Görevler')
ws.addRow(['Görev Başlığı*', 'Açıklama', 'İl / Birim', 'Sorumlu (E-posta)', 'Durum', 'Öncelik', 'Kategori', 'Termin Tarihi', 'Kod / Referans'])
ws.addRow(['Şanlıurfa atölye kurulumu', 'Yer tahsisi tamamlandı', 'Şanlıurfa', 'ankara@deneyap.demo', 'Devam Ediyor', 'Yüksek', 'İdari', '15.09.2026', 'TEST-001'])
ws.addRow(['Ankra eğitmen listesi', '', 'Ankra', 'izmir@deneyap.demo', 'Gecikti', '1', 'Eğitim', '20.09.2026', 'TEST-002'])
ws.addRow(['ab', 'Cok kisa baslik - hata bekleniyor', 'Ankara', '', '', '', '', '', 'TEST-003'])
ws.addRow(['Bilinmeyen il testi', '', 'Zamazingostan', '', '', '', '', '', 'TEST-004'])
const dosyaBuf = Buffer.from(await wb.xlsx.writeBuffer())
console.log('  5 satır: 2 geçerli, 2 hatalı (kısa başlık + bilinmeyen il)')

/* ── 3. Önizleme ───────────────────────────────────────────────────────── */
bolum('3) Önizleme')
async function onizle(buf, ad = 'test.xlsx') {
  const fd = new FormData()
  fd.append('dosya', new Blob([buf]), ad)
  const r = await fetch(`${TABAN}/api/org/${SLUG}/import/onizleme`, { method: 'POST', headers: H, body: fd })
  const j = await r.json()
  if (!r.ok) { console.error('  HATA', r.status, j.error); process.exit(1) }
  return j
}
const on1 = await onizle(dosyaBuf)
console.log('  özet:', JSON.stringify(on1.ozet))
console.log('  varsayımlar:')
on1.varsayimlar.forEach(v => console.log('    -', v))
console.log('  eşleme:', JSON.stringify(on1.esleme))
console.log('  hatalı satırlar:')
on1.satirlar.filter(s => s.hatalar.length).forEach(s =>
  console.log(`    satır ${s.satirNo}: ${s.hatalar.map(h => h.mesaj).join(' | ')}`))
console.log('  uyarılı satırlar:')
on1.satirlar.filter(s => s.uyarilar.length).forEach(s =>
  console.log(`    satır ${s.satirNo}: ${s.uyarilar.join(' | ')}`))

/* ── 4. Uygula ─────────────────────────────────────────────────────────── */
bolum('4) Uygula')
const once = await gorevSayisi()
const uygulaRes = await fetch(`${TABAN}/api/org/${SLUG}/import/uygula`, {
  method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
  body: JSON.stringify({ batchId: on1.batchId, yalnizGecerli: true, mod: 'guncelle' }),
})
const uygula = await uygulaRes.json()
if (!uygulaRes.ok) { console.error('  HATA', uygulaRes.status, uygula.error); process.exit(1) }
console.log('  sonuç:', JSON.stringify(uygula))
const sonra = await gorevSayisi()
console.log(`  görev sayısı: ${once} → ${sonra}  (beklenen +2)`)

const { data: eklenen } = await db.from('tasks')
  .select('title, il, status, priority, task_type, due_date, external_key, assignee_id')
  .eq('organization_id', ORG_ID).like('external_key', 'TEST-%').order('external_key')
console.log('  eklenen görevler:')
eklenen.forEach(t => console.log(`    ${t.external_key} | ${t.title} | ${t.il} | ${t.status}/${t.priority}/${t.task_type} | ${t.due_date}`))

/* ── 5. AYNI dosyayı tekrar yükle — kopya OLMAMALI ─────────────────────── */
bolum('5) Aynı dosya tekrar yükleniyor (kritik test)')
const on2 = await onizle(dosyaBuf)
console.log('  önceki yükleme algılandı mı:', on2.oncekiYukleme ? 'EVET' : 'hayır')
console.log('  özet:', JSON.stringify(on2.ozet), ' ← eslesen=2 olmalı, yeni=0')
const uygula2Res = await fetch(`${TABAN}/api/org/${SLUG}/import/uygula`, {
  method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
  body: JSON.stringify({ batchId: on2.batchId, yalnizGecerli: true, mod: 'guncelle' }),
})
const uygula2 = await uygula2Res.json()
console.log('  sonuç:', JSON.stringify(uygula2), ' ← olusturulan=0 olmalı')
const sonra2 = await gorevSayisi()
console.log(`  görev sayısı: ${sonra} → ${sonra2}  (DEĞİŞMEMELİ)`)

/* ── 6a. Son partiyi geri al — güncellemeler eski hâline dönmeli ───────── */
bolum('6a) SON partiyi geri al (güncellemeleri geri alır)')
async function geriAl(batchId) {
  const r = await fetch(`${TABAN}/api/org/${SLUG}/import/${batchId}/geri-al`, { method: 'POST', headers: H })
  return { ok: r.ok, govde: await r.json() }
}
const g2 = await geriAl(on2.batchId)
console.log('  sonuç:', JSON.stringify(g2.govde), ' ← geri_alinan=2 beklenir')
console.log('  görev sayısı:', await gorevSayisi(), '(değişmemeli — güncelleme geri alındı, silme değil)')

/* ── 6b. Eski partiyi geri al — korunma kuralı devreye girmeli ─────────── */
bolum('6b) ESKİ partiyi geri al (sonradan değişmiş görevler korunmalı)')
const g1 = await geriAl(on1.batchId)
console.log('  sonuç:', JSON.stringify(g1.govde))
console.log('  ↑ korunan>0 bekleniyor: bu görevler 2. parti tarafından değiştirildi,')
console.log('    geri alma onları silmiyor — sonradan yapılan işi yok etmemek için.')

/* ── 6c. Temiz bir parti aç ve hemen geri al — silme yolu ──────────────── */
bolum('6c) Yeni bir parti açıp hemen geri al (silme yolu)')
const wb3 = new ExcelJS.Workbook()
const ws3 = wb3.addWorksheet('Görevler')
ws3.addRow(['Görev Başlığı*', 'İl / Birim', 'Kod / Referans'])
ws3.addRow(['Geri alma testi görevi', 'Bursa', 'TEST-900'])
const on3 = await onizle(Buffer.from(await wb3.xlsx.writeBuffer()), 'geri-al-testi.xlsx')
await fetch(`${TABAN}/api/org/${SLUG}/import/uygula`, {
  method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
  body: JSON.stringify({ batchId: on3.batchId, yalnizGecerli: true, mod: 'guncelle' }),
})
const araSayi = await gorevSayisi()
const g3 = await geriAl(on3.batchId)
console.log('  sonuç:', JSON.stringify(g3.govde), ' ← silinen=1 beklenir')
const sonra3 = await gorevSayisi()
console.log(`  görev sayısı: ${araSayi} → ${sonra3}  (-1 olmalı)`)

/* ── 7. Geçmiş ─────────────────────────────────────────────────────────── */
bolum('7) İçe aktarma geçmişi')
const gecmisRes = await fetch(`${TABAN}/api/org/${SLUG}/import/partiler`, { headers: H })
const gecmis = await gecmisRes.json()
gecmis.partiler.slice(0, 5).forEach(p =>
  console.log(`  ${p.dosya_adi} | ${p.durum} | +${p.olusturulan} ~${p.guncellenen} !${p.hatali} | geri alinabilir: ${p.geriAlinabilir}`))

/* ── Temizlik ──────────────────────────────────────────────────────────── */
bolum('Temizlik')
await db.from('tasks').delete().eq('organization_id', ORG_ID).like('external_key', 'TEST-%')
const { data: partiler } = await db.from('import_batches').select('id').eq('organization_id', ORG_ID)
for (const p of partiler ?? []) await db.from('import_batches').delete().eq('id', p.id)
console.log('  test verileri temizlendi, son görev sayısı:', await gorevSayisi())
