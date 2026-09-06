#!/usr/bin/env node
/**
 * tr_fold (SQL) ile trFold (TypeScript) İKİZ DOĞRULAMASI.
 *
 * İkisi ayrışırsa DENEYAP tekilleştirmesi bozulur: arayüz "böyle bir DENEYAP
 * yok" der, unique kısıt "var" der (ya da tersi) ve aynı isimde iki kayıt
 * oluşabilir. Sessiz bir bozulma olduğu için ayrı bir kontrol hak ediyor.
 *
 * Kullanım:
 *   node scripts/tr-fold-ikiz.mjs            # canlı DB'ye karşı doğrula
 *   node scripts/tr-fold-ikiz.mjs --uret     # translate() çiftlerini üret
 *
 * Doğrulama için .env.local içinde NEXT_PUBLIC_SUPABASE_URL ve
 * SUPABASE_SERVICE_ROLE_KEY gerekir (RPC çağrısı için).
 */

import { readFileSync } from 'node:fs'

// src/lib/turkce.ts:trFold ile birebir aynı — bu dosya .mjs olduğu için
// TS'ten import edemiyoruz; kopya kasıtlı ve testle kilitli
// (src/lib/turkce.test.ts, "ikiz kopya" testi).
function trFold(s) {
  return s
    .replace(/[İIı]/g, 'i')
    .replace(/[Ğğ]/g, 'g')
    .replace(/[Üü]/g, 'u')
    .replace(/[Şş]/g, 's')
    .replace(/[Öö]/g, 'o')
    .replace(/[Çç]/g, 'c')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Migration'daki translate() çiftlerini üretir. */
function ciftleriUret() {
  const kaynak =
    'İIıĞğÜüŞşÖöÇç' +
    'âÂàÀáÁäÄãÃåÅ' +
    'êÊèÈéÉëË' +
    'îÎìÌíÍïÏ' +
    'ôÔòÒóÓõÕ' +
    'ûÛùÙúÚ' +
    'ñÑýÝÿ'
  let hedef = ''
  const sorunlu = []
  for (const ch of kaynak) {
    const f = trFold(ch)
    if ([...f].length !== 1) { sorunlu.push([ch, f]); hedef += '?' }
    else hedef += f
  }
  return { kaynak, hedef, sorunlu }
}

/** İki tarafın da aynı sonucu vermesi gereken örnekler. */
const ORNEKLER = [
  'Çankaya DENEYAP',
  'ÇANKAYA DENEYAP',
  'cankaya deneyap',
  'İSTANBUL',
  'İstanbul',
  'Istanbul',
  'Şanlıurfa  Merkez',
  '  Ağrı Gümüşhane  ',
  'Hakkâri',
  'Elâzığ',
  'Café DENEYAP',
  'Bağcılar / Çınar',
  'ÖZEL ÖĞRETİM',
  'İzmir Karşıyaka DENEYAP',
]

async function main() {
  if (process.argv.includes('--uret')) {
    const { kaynak, hedef, sorunlu } = ciftleriUret()
    console.log("translate(s,\n  '" + kaynak + "',\n  '" + hedef + "'\n)")
    console.log('karakter sayısı:', [...kaynak].length, '=', [...hedef].length)
    if (sorunlu.length) {
      console.error('TEK KARAKTERE İNMEYENLER:', sorunlu)
      process.exit(1)
    }
    return
  }

  // .env.local'i elle oku — bu script build'e girmiyor, dotenv bağımlılığı
  // eklemeye değmez.
  let env = {}
  try {
    // Satırlara CRLF'e dayanıklı bölünüyor. JS regex'inde `.` bir satır
    // sonlandırıcı olan CR'yi EŞLEMEZ ve `$` de CR'den önce eşleşmez; bu
    // yüzden Windows'ta yazılmış bir .env.local'de aşağıdaki `/^KEY=(.*)$/`
    // hiçbir satırı tutmuyor, script de "anahtar yok" deyip duruyordu.
    for (const satir of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
      const m = satir.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m) env[m[1]] = m[2].trim()
    }
  } catch {
    console.error('.env.local okunamadı.')
    process.exit(1)
  }

  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    console.error('NEXT_PUBLIC_SUPABASE_URL ve bir anahtar gerekli.')
    process.exit(1)
  }

  let hata = 0
  for (const ornek of ORNEKLER) {
    const r = await fetch(`${url}/rest/v1/rpc/tr_fold`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ s: ornek }),
    })
    if (!r.ok) {
      console.error(`RPC hatası (${r.status}) — 060 uygulandı mı?`, await r.text())
      process.exit(1)
    }
    const sql = await r.json()
    const ts = trFold(ornek)
    const ok = sql === ts
    if (!ok) hata++
    console.log(`${ok ? '✓' : '✗'} ${JSON.stringify(ornek)}  TS=${JSON.stringify(ts)}  SQL=${JSON.stringify(sql)}`)
  }

  if (hata) {
    console.error(`\n${hata} örnekte AYRIŞMA var. tr_fold ile trFold aynı olmalı.`)
    process.exit(1)
  }
  console.log(`\n${ORNEKLER.length} örneğin hepsinde ikiz uyumlu.`)
}

main()
