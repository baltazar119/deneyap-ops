/**
 * CSV byte'larını metne çevirir.
 *
 * Türkçe yerelli Excel'in "CSV (Ayrılmış liste)" çıktısı genelde
 * **windows-1254** kodlamalı ve **noktalı virgül** ayırıcılıdır. İkisi de
 * ele alınmazsa "Şanlıurfa" bozulur ve başlıklar hiç bulunamaz — kullanıcı
 * da "dosyam neden okunmuyor" der.
 */

const BOM_UTF8 = [0xEF, 0xBB, 0xBF]

export interface CozumSonuc {
  metin: string
  kodlama: 'utf-8' | 'utf-8 (BOM)' | 'utf-16le' | 'utf-16be' | 'windows-1254'
  /** Kullanıcıya önizlemede gösterilecek varsayım notu */
  not: string
}

function bomVarMi(b: Uint8Array, imza: number[]): boolean {
  return imza.every((x, i) => b[i] === x)
}

/** Çözülen metinde değiştirme karakteri (U+FFFD) var mı — bozuk kodlama işareti */
function bozukMu(s: string): boolean {
  return s.includes('�')
}

export function csvCoz(buf: Uint8Array): CozumSonuc {
  if (bomVarMi(buf, BOM_UTF8)) {
    return {
      metin: new TextDecoder('utf-8').decode(buf.subarray(3)),
      kodlama: 'utf-8 (BOM)',
      not: 'Dosya UTF-8 olarak okundu.',
    }
  }
  if (buf[0] === 0xFF && buf[1] === 0xFE) {
    return {
      metin: new TextDecoder('utf-16le').decode(buf.subarray(2)),
      kodlama: 'utf-16le',
      not: 'Dosya UTF-16 olarak okundu.',
    }
  }
  if (buf[0] === 0xFE && buf[1] === 0xFF) {
    return {
      metin: new TextDecoder('utf-16be').decode(buf.subarray(2)),
      kodlama: 'utf-16be',
      not: 'Dosya UTF-16 olarak okundu.',
    }
  }

  // BOM yok: önce UTF-8 dene
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf)
  if (!bozukMu(utf8)) {
    return { metin: utf8, kodlama: 'utf-8', not: 'Dosya UTF-8 olarak okundu.' }
  }

  // Bozuk karakter var → Türkçe Windows kodlaması dene
  try {
    const tr = new TextDecoder('windows-1254', { fatal: false }).decode(buf)
    if (!bozukMu(tr)) {
      return {
        metin: tr,
        kodlama: 'windows-1254',
        not: 'Dosya Türkçe Windows kodlamasıyla (windows-1254) okundu.',
      }
    }
  } catch {
    // Ortamda windows-1254 desteklenmiyorsa UTF-8'e geri dön
  }

  return {
    metin: utf8,
    kodlama: 'utf-8',
    not: 'Dosyanın kodlaması anlaşılamadı; UTF-8 varsayıldı. Türkçe karakterler bozuksa dosyayı UTF-8 olarak kaydedip tekrar deneyin.',
  }
}

/** Ayırıcıyı ilk satırdan tahmin eder (papaparse'a ipucu olarak verilir) */
export function ayiriciTahmin(metin: string): ';' | ',' | '\t' | '|' {
  const ilkSatir = metin.split(/\r?\n/, 1)[0] ?? ''
  const adaylar: (';' | ',' | '\t' | '|')[] = [';', ',', '\t', '|']
  let enIyi: ';' | ',' | '\t' | '|' = ';'
  let enCok = -1
  for (const a of adaylar) {
    const n = ilkSatir.split(a).length - 1
    if (n > enCok) { enCok = n; enIyi = a }
  }
  return enCok > 0 ? enIyi : ';'
}
