/**
 * Sunum için geçmiş operasyon ölçümü üretir (`gunluk_ozet`, kaynak='demo').
 *
 * NEDEN GEREKLİ: demo verisindeki görevlerin hepsi birkaç gün içinde
 * oluşturulmuş. Trend grafiği gerçek veriden türetilince neredeyse DÜZ ÇİZGİ
 * çıkıyor ve "geçmişe göre yorumlama" özelliği sunumda görünmüyor.
 *
 * Üretilen satırlar `kaynak='demo'` ile işaretlenir; gerçek cron ölçümleriyle
 * karışmaz ve tek komutla silinebilir:
 *
 *   node scripts/ozet-demo.mjs            # 90 günlük geçmiş üret
 *   node scripts/ozet-demo.mjs --temizle  # yalnızca demo satırlarını sil
 *   node scripts/ozet-demo.mjs --gun 120  # farklı uzunluk
 *
 * Üretim DETERMİNİSTİK: aynı tohumla her çalıştırmada aynı seri çıkar,
 * böylece sunum provası ile sunumun kendisi aynı grafiği gösterir.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const kok = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function envOku() {
  const out = {}
  try {
    const ham = readFileSync(resolve(kok, '.env.local'), 'utf8')
    for (const satir of ham.split(/\r?\n/)) {
      const t = satir.trim()
      if (!t || t.startsWith('#')) continue
      const i = t.indexOf('=')
      if (i < 0) continue
      out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    }
  } catch { /* .env.local yoksa process.env'e düşülür */ }
  return { ...process.env, ...out }
}

function cik(mesaj) { console.error('\n' + mesaj + '\n'); process.exit(1) }

const env = envOku()
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) cik('.env.local icinde NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY olmali.')

const db = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const args = process.argv.slice(2)
const temizle = args.includes('--temizle')
const gunIdx = args.indexOf('--gun')
const GUN_SAYISI = gunIdx >= 0 ? Number(args[gunIdx + 1]) : 90

/** Deterministik sözde-rastgele (mulberry32) — tohum sabit, sonuç tekrarlanabilir */
function rastgele(tohum) {
  let a = tohum
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function iki(n) { return String(n).padStart(2, '0') }
function yerelGun(d) { return `${d.getFullYear()}-${iki(d.getMonth() + 1)}-${iki(d.getDate())}` }

async function main() {
  console.log('\nDENEYAP OYS — demo operasyon gecmisi')

  const { data: orglar, error } = await db.from('organizations').select('id, slug')
  if (error) cik('organizations okunamadi: ' + error.message)
  if (!orglar?.length) cik('Hic organizasyon yok. Once: npm run seed:demo')

  if (temizle) {
    const { error: e } = await db.from('gunluk_ozet').delete().eq('kaynak', 'demo')
    if (e) cik('Temizlenemedi: ' + e.message + '\n(migration 064 uygulandi mi?)')
    console.log('  Demo olcumleri silindi. Gercek (cron) olcumlere DOKUNULMADI.\n')
    return
  }

  for (const org of orglar) {
    // Bugünün gerçek durumu çıpa; geçmiş buradan geriye doğru kurgulanır.
    const { data: gorevler } = await db.from('tasks').select('*').eq('organization_id', org.id)
    const bugunToplam = gorevler?.length ?? 0
    if (!bugunToplam) { console.log(`  ${org.slug}: gorev yok, atlandi`); continue }

    const bugunAcik    = gorevler.filter(t => t.status !== 'done').length
    const bugunBloke   = gorevler.filter(t => t.status === 'blocked').length
    const bugunGeciken = gorevler.filter(t => t.status !== 'done' && t.due_date && t.due_date < yerelGun(new Date())).length
    const bugunAtanmamis = gorevler.filter(t => t.status !== 'done' && !t.assignee_id).length

    // İller ve DENEYAP'lar gerçek dağılımdan alınır ki kırılım tutarlı olsun
    const iller = [...new Set(gorevler.map(t => t.il).filter(Boolean))]
    const birimler = [...new Set(gorevler.map(t => t.deneyap_id).filter(Boolean))]

    const rnd = rastgele(1453)
    const kayitlar = []

    for (let geri = GUN_SAYISI; geri >= 1; geri--) {
      const d = new Date(); d.setDate(d.getDate() - geri)
      const gun = yerelGun(d)

      // Zaman içinde büyüyen bir operasyon: eski günler daha az görev.
      const oran = (GUN_SAYISI - geri) / GUN_SAYISI          // 0 → 1
      const buyume = 0.45 + 0.55 * oran
      const gurultu = 0.9 + rnd() * 0.2

      const toplam = Math.max(1, Math.round(bugunToplam * buyume * gurultu))
      const acik   = Math.max(0, Math.round(bugunAcik * buyume * gurultu))
      const tamam  = Math.max(0, toplam - acik)
      // Gecikme ortada tepe yapıp düşsün — grafikte okunur bir hikâye
      const tepe   = 1 + 0.8 * Math.sin(Math.PI * oran)
      const geciken = Math.max(0, Math.round(bugunGeciken * tepe * gurultu))
      const bloke   = Math.max(0, Math.round(bugunBloke * (0.6 + rnd() * 0.9)))
      const atanmamis = Math.max(0, Math.round(bugunAtanmamis * (0.7 + rnd() * 0.7)))

      const orgSatiri = {
        organization_id: org.id, gun, kaynak: 'demo', kirilim: 'org', il: null, deneyap_id: null,
        toplam, acik, tamamlanan: tamam,
        devam_eden: Math.round(acik * 0.45), bekleyen: Math.round(acik * 0.35), bloke,
        geciken, gecikme_gun_toplam: geciken * (3 + Math.round(rnd() * 6)),
        atanmamis, kritik_atanmamis: Math.round(atanmamis * 0.3),
        termini_yaklasan: Math.round(acik * 0.2),
        yeni_olusturulan: Math.round(rnd() * 3),
        gun_icinde_tamamlanan: Math.round(rnd() * 3),
        risk_skoru: Math.min(100, Math.round(geciken * 8 + bloke * 6)),
        risk_seviyesi: null,
      }
      orgSatiri.risk_seviyesi = orgSatiri.risk_skoru >= 60 ? 'high'
                              : orgSatiri.risk_skoru >= 25 ? 'medium' : 'low'
      kayitlar.push(orgSatiri)

      // İl kırılımı — org toplamını illere pay et
      iller.forEach((il, i) => {
        const pay = (1 / iller.length) * (0.7 + ((i * 37 + geri) % 10) / 20)
        kayitlar.push({
          organization_id: org.id, gun, kaynak: 'demo', kirilim: 'il', il, deneyap_id: null,
          toplam: Math.round(toplam * pay), acik: Math.round(acik * pay),
          tamamlanan: Math.round(tamam * pay),
          devam_eden: Math.round(acik * pay * 0.45), bekleyen: Math.round(acik * pay * 0.35),
          bloke: Math.round(bloke * pay), geciken: Math.round(geciken * pay),
          gecikme_gun_toplam: Math.round(geciken * pay) * 4,
          atanmamis: Math.round(atanmamis * pay), kritik_atanmamis: 0,
          termini_yaklasan: Math.round(acik * pay * 0.2),
          yeni_olusturulan: 0, gun_icinde_tamamlanan: 0,
          risk_skoru: null, risk_seviyesi: null,
        })
      })

      // DENEYAP kırılımı
      birimler.forEach((id, i) => {
        const pay = (1 / Math.max(birimler.length, 1)) * (0.6 + ((i * 23 + geri) % 8) / 16)
        const g = gorevler.find(t => t.deneyap_id === id)
        kayitlar.push({
          organization_id: org.id, gun, kaynak: 'demo', kirilim: 'deneyap',
          il: g?.il ?? null, deneyap_id: id,
          toplam: Math.round(toplam * pay), acik: Math.round(acik * pay),
          tamamlanan: Math.round(tamam * pay),
          devam_eden: 0, bekleyen: 0, bloke: Math.round(bloke * pay),
          geciken: Math.round(geciken * pay), gecikme_gun_toplam: 0,
          atanmamis: 0, kritik_atanmamis: 0, termini_yaklasan: 0,
          yeni_olusturulan: 0, gun_icinde_tamamlanan: 0,
          risk_skoru: null, risk_seviyesi: null,
        })
      })
    }

    /**
     * ONCE SIL, SONRA YAZ.
     *
     * `upsert(..., { onConflict })` KULLANILMIYOR: 064'teki benzersiz index
     * `coalesce(il,'')` gibi IFADELER uzerine kurulu (null'lari tekillestirmek
     * icin sart) ve PostgREST'in ON CONFLICT'i yalnizca duz KOLON listesiyle
     * eslesebiliyor. Ikisi eslesmedigi icin upsert
     * "no unique or exclusion constraint matching the ON CONFLICT
     * specification" hatasi veriyordu.
     *
     * Silme yalnizca kaynak='demo' satirlarini kapsar; gercek cron olcumlerine
     * DOKUNULMAZ.
     */
    const { error: silHata } = await db.from('gunluk_ozet')
      .delete().eq('organization_id', org.id).eq('kaynak', 'demo')
    if (silHata) cik('Eski demo satirlari silinemedi: ' + silHata.message)

    // Cron'un gercek olcum yazdigi gunlere demo satiri EKLENMEZ: benzersiz
    // index catisirdi ve gercek olcumun uzerine tahmin yazmak zaten yanlis.
    const { data: cronGunleri } = await db.from('gunluk_ozet')
      .select('gun').eq('organization_id', org.id).eq('kaynak', 'cron')
    const dolu = new Set((cronGunleri ?? []).map(x => x.gun))
    const yazilacak = kayitlar.filter(k => !dolu.has(k.gun))

    let yazilan = 0
    for (let i = 0; i < yazilacak.length; i += 500) {
      const { error: e } = await db.from('gunluk_ozet').insert(yazilacak.slice(i, i + 500))
      if (e) cik('Yazilamadi: ' + e.message + '\n(migration 064 uygulandi mi?)')
      yazilan += Math.min(500, yazilacak.length - i)
    }
    const atlanan = kayitlar.length - yazilacak.length
    console.log(`  ${org.slug}: ${yazilan} olcum satiri (${GUN_SAYISI} gun, ${iller.length} il, ${birimler.length} DENEYAP)`
      + (atlanan ? ` — ${atlanan} satir atlandi (gercek olcum var)` : ''))
  }

  console.log('\nHazir. Silmek icin: node scripts/ozet-demo.mjs --temizle\n')
}

main().catch(e => cik(String(e)))
