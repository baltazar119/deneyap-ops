/**
 * DENEYAP Ops — demo hesap ve örnek veri kurulumu.
 *
 *   npm run seed:demo
 *
 * PRD'deki dört rolü temsil eden dört kullanıcı, bir demo workspace ve
 * gerçekçi bir görev seti oluşturur. Tekrar çalıştırılabilir: mevcut
 * kullanıcı/workspace varsa yeniden kullanılır, görevler sıfırlanır.
 *
 * SERVICE_ROLE anahtarı gerektirir — bu yüzden sunucuda değil, yalnızca
 * elle çalıştırılan bir script olarak duruyor. Anahtar .env.local'den
 * okunur, hiçbir yere yazılmaz/loglanmaz.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const kok = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/* ── .env.local oku ────────────────────────────────────────────────────── */
function envOku() {
  let ham
  try {
    ham = readFileSync(resolve(kok, '.env.local'), 'utf8')
  } catch {
    cik('.env.local bulunamadı. Önce .env.local.example dosyasını kopyalayıp doldurun.')
  }
  const env = {}
  for (const satir of ham.split('\n')) {
    const t = satir.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  return env
}

/** Hata mesajıyla dur. process.exit() kullanmıyoruz: açık Supabase
 *  bağlantıları varken libuv teardown'ında assertion hatası veriyor. */
function cik(mesaj) {
  throw new Error(mesaj)
}

const env = envOku()
const URL  = env.NEXT_PUBLIC_SUPABASE_URL
const KEY  = env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || URL.includes('your-project')) cik('NEXT_PUBLIC_SUPABASE_URL .env.local içinde ayarlı değil.')
if (!KEY || KEY.length < 40)              cik('SUPABASE_SERVICE_ROLE_KEY .env.local içinde ayarlı değil.')

const db = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })

/* ── Demo tanımı ───────────────────────────────────────────────────────── */

const SIFRE = 'Deneyap2026!'
const ORG   = { name: 'DENEYAP Demo', slug: 'deneyap-demo' }

const HESAPLAR = [
  { email: 'merkez@deneyap.demo',  ad: 'Merkez Operasyon',  role: 'owner',  il: 'Genel Merkez' },
  { email: 'koordinator@deneyap.demo', ad: 'Selin Koordinatör', role: 'admin',  il: 'Genel Merkez' },
  { email: 'ankara@deneyap.demo',  ad: 'Ankara İl Sorumlusu', role: 'member', il: 'Ankara' },
  { email: 'izmir@deneyap.demo',   ad: 'İzmir İl Sorumlusu',  role: 'member', il: 'İzmir' },
  { email: 'yonetici@deneyap.demo', ad: 'Yetkili Yönetici',  role: 'viewer', il: 'Genel Merkez' },
]

/** Bugüne göre gün kaydırmalı tarih (YYYY-MM-DD) */
function gun(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

// PRD'deki dört durumu da kapsar: Bekliyor / Devam Ediyor / Tamamlandı / Gecikti
// ("Gecikti" ayrı bir durum değil, termini geçmiş açık görev demek.)
const GOREVLER = [
  { title: 'Ankara atölyesi robotik kiti sayımı', il: 'Ankara', atanan: 'ankara@deneyap.demo',
    status: 'doing',   priority: 'high',     task_type: 'supply',    due: gun(4),
    description: 'Depodaki Arduino ve sensör setlerinin sayımı yapılıp merkeze raporlanacak.' },
  { title: 'Ankara eğitmen oryantasyonu', il: 'Ankara', atanan: 'ankara@deneyap.demo',
    status: 'backlog', priority: 'normal',   task_type: 'training',  due: gun(12),
    description: 'Yeni dönem eğitmenleri için yarım günlük oryantasyon programı planlanacak.' },
  { title: 'Ankara dönem raporu', il: 'Ankara', atanan: 'ankara@deneyap.demo',
    status: 'doing',   priority: 'critical', task_type: 'reporting', due: gun(-3),
    description: 'Geçen dönemin katılım ve tamamlanma verileri merkeze iletilecek. TERMİN GEÇTİ.' },
  { title: 'İzmir atölye açılış etkinliği', il: 'İzmir', atanan: 'izmir@deneyap.demo',
    status: 'doing',   priority: 'high',     task_type: 'event',     due: gun(7),
    description: 'Açılış programı, davetli listesi ve basın duyurusu hazırlanacak.' },
  { title: 'İzmir 3D yazıcı bakımı', il: 'İzmir', atanan: 'izmir@deneyap.demo',
    status: 'blocked', priority: 'high',     task_type: 'mechanical', due: gun(-1),
    description: 'Yedek parça tedariki beklendiği için bloke. TERMİN GEÇTİ.' },
  { title: 'İzmir katılımcı listesi güncellemesi', il: 'İzmir', atanan: 'izmir@deneyap.demo',
    status: 'done',    priority: 'normal',   task_type: 'admin',     due: gun(-6),
    description: 'Dönem başı katılımcı kayıtları sisteme işlendi.' },
  // İl bazlı görünürlüğü kanıtlayan satır: Ankara'nın işi ama Ankara sorumlusuna
  // ATANMAMIŞ. İl Sorumlusu bunu yine de görmeli (PRD md.2).
  { title: 'Ankara valilik protokol yazışması', il: 'Ankara', atanan: null,
    status: 'backlog', priority: 'high',     task_type: 'admin',     due: gun(5),
    description: 'Henüz kimseye atanmadı — il sorumlusu görüp üstlenebilmeli.' },
  { title: 'Bursa atölyesi kurulum takibi', il: 'Bursa', atanan: null,
    status: 'backlog', priority: 'critical', task_type: 'admin',     due: gun(9),
    description: 'İl sorumlusu henüz atanmadı — merkez tarafından atanacak.' },
  { title: 'Ulusal eğitim içeriği v2 hazırlığı', il: 'Genel Merkez', atanan: 'koordinator@deneyap.demo',
    status: 'doing',   priority: 'normal',   task_type: 'software',  due: gun(20),
    description: 'Tüm illerde kullanılacak yeni müfredat modülleri derleniyor.' },
  { title: 'Elektronik laboratuvar güvenlik kontrolü', il: 'Genel Merkez', atanan: 'koordinator@deneyap.demo',
    status: 'backlog', priority: 'high',     task_type: 'electrical', due: gun(2),
    description: 'Tüm illerde uygulanacak güvenlik kontrol listesi yayımlanacak.' },
  { title: 'Dönem kapanış sunumu', il: 'Genel Merkez', atanan: 'merkez@deneyap.demo',
    status: 'done',    priority: 'normal',   task_type: 'reporting', due: gun(-10),
    description: 'Yönetim kuruluna sunulan dönem kapanış raporu tamamlandı.' },
]

/* ── Yardımcılar ───────────────────────────────────────────────────────── */

async function kullaniciBulVeyaOlustur(hesap) {
  // listUsers sayfalı; demo ölçeğinde tek sayfa yeterli
  const { data: liste, error: listeHata } = await db.auth.admin.listUsers({ perPage: 1000 })
  if (listeHata) cik('Kullanıcı listesi alınamadı: ' + listeHata.message)

  const mevcut = liste.users.find(u => u.email === hesap.email)
  if (mevcut) {
    // Şifreyi her seferinde bilinen değere sabitle — demo tekrar kullanılabilir olsun
    await db.auth.admin.updateUserById(mevcut.id, { password: SIFRE, email_confirm: true })
    return { id: mevcut.id, yeni: false }
  }

  const { data, error } = await db.auth.admin.createUser({
    email: hesap.email,
    password: SIFRE,
    email_confirm: true,
    user_metadata: { full_name: hesap.ad },
  })
  if (error) cik(`"${hesap.email}" oluşturulamadı: ` + error.message)
  return { id: data.user.id, yeni: true }
}

/**
 * Migration 052/053 uygulanmış mı? Uygulanmadıysa hiçbir şey oluşturmadan
 * dur — yarım kurulmuş bir demo, hata mesajından daha kafa karıştırıcı olur.
 */
async function onKontrol() {
  const { error } = await db.from('tasks').select('il').limit(1)
  if (error && /column .*il.* does not exist|il/.test(error.message)) {
    cik(
      'Veritabanı hazır değil: tasks.il kolonu yok.\n' +
      '  Supabase SQL Editor\'da su dosyayi calistirin:\n' +
      '    supabase/demo_ve_il_kurulum.sql\n' +
      '  Sonra bu komutu tekrar deneyin.'
    )
  }
  if (error) cik('Veritabanina erisilemedi: ' + error.message)
}

async function main() {
  console.log('\nDENEYAP Ops — demo veri kurulumu')
  console.log('Supabase: ' + URL.replace(/https:\/\/([^.]{4}).*/, 'https://$1***.supabase.co'))

  await onKontrol()

  /* 1) Kullanıcılar */
  const kullanicilar = {}
  for (const h of HESAPLAR) {
    const { id, yeni } = await kullaniciBulVeyaOlustur(h)
    kullanicilar[h.email] = id
    console.log(`  ${yeni ? '+ olusturuldu' : '= mevcut    '}  ${h.email}`)
  }

  const sahipId = kullanicilar['merkez@deneyap.demo']

  /* 2) Profiller (auth trigger'ı kaçırırsa diye garanti altına al) */
  for (const h of HESAPLAR) {
    await db.from('profiles').upsert({
      id: kullanicilar[h.email],
      email: h.email,
      full_name: h.ad,
      // Demo'da tüm modüller görünsün (AI Asistan, Danışmanlık Pro'ya bağlı)
      plan: 'pro',
    }, { onConflict: 'id' })
  }

  /* 3) Workspace */
  let orgId
  const { data: mevcutOrg } = await db
    .from('organizations').select('id').eq('slug', ORG.slug).maybeSingle()

  if (mevcutOrg) {
    orgId = mevcutOrg.id
    console.log(`\n  = workspace mevcut: /${ORG.slug}`)
  } else {
    const { data, error } = await db
      .from('organizations')
      .insert({ name: ORG.name, slug: ORG.slug, created_by: sahipId, plan: 'pro' })
      .select('id').single()
    if (error) cik('Workspace oluşturulamadı: ' + error.message)
    orgId = data.id
    console.log(`\n  + workspace olusturuldu: /${ORG.slug}`)
  }

  /* 4) Üyelikler (rol + il) */
  for (const h of HESAPLAR) {
    const { error } = await db.from('organization_members').upsert({
      organization_id: orgId,
      user_id: kullanicilar[h.email],
      role: h.role,
      il: h.il,
    }, { onConflict: 'organization_id,user_id' })
    if (error) cik(`Üyelik kaydedilemedi (${h.email}): ` + error.message)
  }
  console.log('  + uyelikler ve il atamalari yazildi')

  /* 5) Görevler — demo workspace'in görevleri sıfırlanır */
  await db.from('tasks').delete().eq('organization_id', orgId)

  const satirlar = GOREVLER.map(g => ({
    organization_id: orgId,
    created_by: sahipId,
    title: g.title,
    description: g.description,
    status: g.status,
    priority: g.priority,
    task_type: g.task_type,
    il: g.il,
    assignee_id: g.atanan ? kullanicilar[g.atanan] : null,
    due_date: g.due,
  }))

  const { error: gorevHata } = await db.from('tasks').insert(satirlar)
  if (gorevHata) cik('Görevler eklenemedi: ' + gorevHata.message)
  console.log(`  + ${satirlar.length} ornek gorev eklendi`)

  /* 6) Özet */
  console.log('\nDemo hazir. Giris bilgileri:\n')
  const etiket = { owner: 'Merkez Operasyon Ekibi', admin: 'Koordinator',
                   member: 'Il Sorumlusu', viewer: 'Yetkili Yonetici' }
  for (const h of HESAPLAR) {
    console.log(`  ${h.email.padEnd(26)} ${SIFRE}   ${etiket[h.role]}${h.role === 'member' ? ' (' + h.il + ')' : ''}`)
  }
  console.log('\nGiris ekranindaki "Demo hesapla dene" panelinden tek tikla girebilirsiniz.')
  console.log('Panelin gorunmesi icin .env.local icinde NEXT_PUBLIC_DEMO_MODE=true olmali.\n')
}

main().catch((e) => {
  console.error('\nHATA: ' + (e?.message ?? String(e)) + '\n')
  process.exitCode = 1
})
