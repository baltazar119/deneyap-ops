import { trFold } from '@/lib/turkce'
import { normDurum, normOncelik, normKategori, normIl, normTarih, normSaat, normDeneyap } from './normalize'
import type { DeneyapAdayi } from './normalize'
import { disAnahtarTemizle, eslestirmeAnahtari } from './fingerprint'
import type { AlanAnahtari, Esleme } from './columnMap'
import type { TaskStatus, TaskPriority, TaskType } from '@/types/database'

/**
 * Ham Excel satırını uygulama alanlarına çevirir.
 *
 * Saf fonksiyon: veritabanına bakmaz, üye listesi dışarıdan verilir. Böylece
 * içe aktarmanın en hataya açık kısmı bağımsız test edilebiliyor.
 *
 * Tasarım ilkesi: **bir satır asla sessizce yutulmaz.** Tanınmayan değer
 * varsayılana düşer ve uyarı üretir; zorunlu alan eksikse satır hatalı
 * işaretlenir ama diğer satırların aktarılmasını engellemez.
 */

export interface UyeOzeti {
  id: string
  adSoyad: string | null
  email: string | null
}

export interface IsleSecenekleri {
  /** Sayısal önceliklerde 1 en yüksek mi (varsayılan) yoksa en düşük mü */
  birEnYuksek?: boolean
  /** Sorumlu eşleşmezse ne yapılsın */
  sorumluPolitikasi?: 'bos_birak' | 'atla' | 'reddet'
  /** Org'un DENEYAP kayıtları — DENEYAP sütunu eşlenmişse gerekli */
  deneyaplar?: DeneyapAdayi[]
}

export interface SatirHatasi {
  alan: AlanAnahtari | 'genel'
  mesaj: string
}

export interface NormalizeSatir {
  title: string
  description: string | null
  il: string | null
  deneyap_id: string | null
  status: TaskStatus
  priority: TaskPriority
  task_type: TaskType
  start_date: string | null
  due_date: string | null
  estimated_hours: number | null
  assignee_id: string | null
  external_key: string | null
}

export interface IslenmisSatir {
  normalize: NormalizeSatir | null
  hatalar: SatirHatasi[]
  uyarilar: string[]
  eslestirmeAnahtari: string
  anahtarYontemi: 'external_key' | 'fingerprint'
  /** Eşleşmeyen sorumlu metni — içe aktarma sonunda kullanıcıya raporlanır */
  eslesmeyenSorumlu: string | null
  /** Aynı ada birden fazla üye uyuyor — kullanıcı seçmeli */
  belirsizSorumlu: UyeOzeti[] | null
  /** Kullanıcı bu satırda "Gecikti" yazmıştı */
  gecikmeIsareti: boolean
  /** DENEYAP hücresi hiçbir kayda uymadı — önizlemede oluşturma önerilir */
  yeniDeneyapAdi: string | null
}

/** Eşlemeye göre ilgili sütunun ham değerini bulur */
function deger(ham: Record<string, unknown>, esleme: Esleme, alan: AlanAnahtari): unknown {
  for (const [sutun, a] of Object.entries(esleme)) {
    if (a === alan) return ham[sutun]
  }
  return undefined
}

function metin(v: unknown): string {
  return v === null || v === undefined ? '' : String(v).trim()
}

/** Sorumluyu e-posta, yoksa ad-soyad ile çözer */
function sorumluCoz(ham: string, uyeler: UyeOzeti[]):
  | { tip: 'bulundu'; uye: UyeOzeti }
  | { tip: 'belirsiz'; adaylar: UyeOzeti[] }
  | { tip: 'yok' } {
  const k = trFold(ham)
  if (!k) return { tip: 'yok' }

  const epostaIle = uyeler.filter(u => u.email && trFold(u.email) === k)
  if (epostaIle.length === 1) return { tip: 'bulundu', uye: epostaIle[0] }

  const adIle = uyeler.filter(u => u.adSoyad && trFold(u.adSoyad) === k)
  if (adIle.length === 1) return { tip: 'bulundu', uye: adIle[0] }
  if (adIle.length > 1)  return { tip: 'belirsiz', adaylar: adIle }

  return { tip: 'yok' }
}

export function satirIsle(
  ham: Record<string, unknown>,
  esleme: Esleme,
  uyeler: UyeOzeti[],
  opts: IsleSecenekleri = {},
): IslenmisSatir {
  const hatalar: SatirHatasi[] = []
  const uyarilar: string[] = []

  /* ── Başlık — tek zorunlu alan ── */
  const title = metin(deger(ham, esleme, 'title'))
  if (!title) {
    hatalar.push({ alan: 'title', mesaj: 'Görev başlığı boş olamaz.' })
  } else if (title.length < 3) {
    hatalar.push({ alan: 'title', mesaj: 'Görev başlığı en az 3 karakter olmalı.' })
  } else if (title.length > 200) {
    hatalar.push({ alan: 'title', mesaj: 'Görev başlığı 200 karakteri aşamaz.' })
  }

  /* ── İl ve DENEYAP → "etkin il" ──────────────────────────────────────────
   *
   * BU BLOK FINGERPRINT'İ KORUYAN YERDİR. Eşleştirme anahtarı
   * `parmakIzi(baslik, il)` ve o `il` buradan çıkıyor. Kayarsa aynı Excel
   * ikinci kez yüklendiğinde eski kayıtla eşleşmez ve KOPYA GÖREV oluşur.
   *
   * Öncelik sırası:
   *   1. DENEYAP çözüldüyse → DENEYAP'ın ili (DB trigger'ı da aynısını yapar)
   *   2. İl sütunu eşlenmişse → onun değeri (059 öncesi davranışın aynısı)
   *   3. DENEYAP sütunu var, çözülmedi ve İL SÜTUNU YOK → normIl(DENEYAP hücresi)
   *
   * 3. madde geriye dönük uyumun tamamı: "Atölye" başlıklı sütun eskiden
   * `il` alanına eşleniyordu. Faz 7 onu `deneyap`a taşıdı. İçinde "Ankara"
   * yazan eski bir dosya bu geri düşme sayesinde önceki sürümle BİREBİR AYNI
   * anahtarı üretir.
   */
  const ilSutunuEslenmis = Object.values(esleme).includes('il')
  const ilHam = metin(deger(ham, esleme, 'il'))
  const ilSonuc = normIl(ilHam)

  const deneyapHam = metin(deger(ham, esleme, 'deneyap'))
  const deneyapSonuc = normDeneyap(deneyapHam, opts.deneyaplar ?? [], ilSonuc.value)

  // DENEYAP uyarısı, geri düşmenin sonucu belli OLDUKTAN sonra basılır:
  // hücre aslında bir il adıysa "yeni DENEYAP oluşturun" demek yanıltıcı olur.
  let deneyapOnerilsin = !!deneyapSonuc.yeniAd

  let etkinIl: string | null = null
  if (deneyapSonuc.il) {
    etkinIl = deneyapSonuc.il
    // Çelişki HATA değil uyarı: satırı düşürmek kullanıcıyı Excel'e geri iter.
    if (ilSonuc.value && ilSonuc.value !== deneyapSonuc.il) {
      uyarilar.push(
        `İl olarak "${ilSonuc.value}" yazılmış ama DENEYAP "${deneyapSonuc.il}" ilinde — ` +
        `DENEYAP'ın ili kullanıldı.`,
      )
    }
  } else if (ilSutunuEslenmis) {
    etkinIl = ilSonuc.value
    if (ilHam && !ilSonuc.value) {
      // Dolu ama tanınmadı → sessizce null'lamak yanlış olur, il PRD'de bir eksen
      hatalar.push({ alan: 'il', mesaj: ilSonuc.uyari ?? `İl tanınmadı: "${ilHam}".` })
    } else if (ilSonuc.uyari) {
      uyarilar.push(ilSonuc.uyari)
    }
  } else if (deneyapHam) {
    const geriDusme = normIl(deneyapHam)
    etkinIl = geriDusme.value
    if (geriDusme.value) {
      // Hücrenin içeriği aslında bir İL adıydı (eski "Atölye" sütunlu
      // dosyalar). Bu bir DENEYAP adı değil; oluşturma ÖNERİLMEZ, yoksa
      // önizlemedeki panel il adlarıyla dolar ve kullanıcı "Ankara" adında
      // sahte bir DENEYAP oluşturur.
      deneyapOnerilsin = false
      uyarilar.push(`"${deneyapHam}" bir DENEYAP değil, il adı olarak yorumlandı.`)
    }
  }

  // Sıra önemli: geri düşme kararı verildikten SONRA.
  if (deneyapSonuc.uyari && (deneyapSonuc.value || deneyapOnerilsin || deneyapSonuc.oneriler?.length)) {
    uyarilar.push(deneyapSonuc.uyari)
  }

  /* ── Durum / öncelik / kategori ── */
  const durum = normDurum(deger(ham, esleme, 'status'))
  if (durum.uyari) uyarilar.push(durum.uyari)

  const oncelik = normOncelik(deger(ham, esleme, 'priority'), { birEnYuksek: opts.birEnYuksek })
  if (oncelik.uyari) uyarilar.push(oncelik.uyari)

  const kategori = normKategori(deger(ham, esleme, 'task_type'))
  if (kategori.uyari) uyarilar.push(kategori.uyari)

  /* ── Tarihler ── */
  const baslangicHam = metin(deger(ham, esleme, 'start_date'))
  const terminHam    = metin(deger(ham, esleme, 'due_date'))
  const baslangic = normTarih(deger(ham, esleme, 'start_date'))
  const termin    = normTarih(deger(ham, esleme, 'due_date'))

  if (baslangicHam && !baslangic.value) hatalar.push({ alan: 'start_date', mesaj: baslangic.uyari! })
  if (terminHam && !termin.value)       hatalar.push({ alan: 'due_date', mesaj: termin.uyari! })

  if (baslangic.value && termin.value && baslangic.value > termin.value) {
    hatalar.push({ alan: 'start_date', mesaj: 'Başlangıç tarihi terminden sonra olamaz.' })
  }

  // "Gecikti" yazılmış ama termin geçmemişse kullanıcı bunu bilmeli —
  // görev gecikmiş görünmeyecek, çünkü gecikme termin tarihinden hesaplanıyor
  if (durum.gecikmeIsareti) {
    const bugun = bugunYerel()
    if (!termin.value) {
      uyarilar.push('"Gecikti" yazıyor ama termin tarihi yok — görev gecikmiş görünmeyecek.')
    } else if (termin.value >= bugun) {
      uyarilar.push(`"Gecikti" yazıyor ama termin (${termin.value}) henüz geçmemiş — görev gecikmiş görünmeyecek.`)
    }
  }

  /* ── Süre ── */
  const sureHam = metin(deger(ham, esleme, 'estimated_hours'))
  const sure = normSaat(deger(ham, esleme, 'estimated_hours'))
  if (sureHam && sure.value === null && sure.uyari) uyarilar.push(sure.uyari)

  /* ── Sorumlu ── */
  const sorumluHam = metin(deger(ham, esleme, 'assignee'))
  let assigneeId: string | null = null
  let eslesmeyenSorumlu: string | null = null
  let belirsizSorumlu: UyeOzeti[] | null = null

  if (sorumluHam) {
    const c = sorumluCoz(sorumluHam, uyeler)
    if (c.tip === 'bulundu') {
      assigneeId = c.uye.id
    } else if (c.tip === 'belirsiz') {
      belirsizSorumlu = c.adaylar
      uyarilar.push(`"${sorumluHam}" birden fazla üyeyle eşleşiyor — seçim yapın.`)
    } else {
      eslesmeyenSorumlu = sorumluHam
      const politika = opts.sorumluPolitikasi ?? 'bos_birak'
      if (politika === 'reddet') {
        hatalar.push({ alan: 'assignee', mesaj: `"${sorumluHam}" ekipte bulunamadı.` })
      } else {
        // Varsayılan: görev yine de oluşsun. Amaç Excel'den kurtulmak;
        // henüz kayıtlı olmayan bir kişi yüzünden görevi dışarıda bırakmak
        // kullanıcıyı Excel'e geri iter. Atama sonradan yapılabilir.
        uyarilar.push(`"${sorumluHam}" ekipte bulunamadı — görev atanmamış olarak eklenecek.`)
      }
    }
  }

  /* ── Eşleştirme anahtarı ── */
  const disAnahtar = disAnahtarTemizle(deger(ham, esleme, 'external_key'))
  const { anahtar, yontem } = eslestirmeAnahtari(title, etkinIl, disAnahtar)

  const aciklama = metin(deger(ham, esleme, 'description'))

  return {
    normalize: hatalar.length ? null : {
      title,
      description: aciklama || null,
      il: etkinIl,
      deneyap_id: deneyapSonuc.value,
      status: durum.value ?? 'backlog',
      priority: oncelik.value ?? 'normal',
      task_type: kategori.value ?? 'other',
      start_date: baslangic.value,
      due_date: termin.value,
      estimated_hours: sure.value,
      assignee_id: assigneeId,
      external_key: disAnahtar,
    },
    hatalar,
    uyarilar,
    eslestirmeAnahtari: anahtar,
    anahtarYontemi: yontem,
    eslesmeyenSorumlu,
    belirsizSorumlu,
    gecikmeIsareti: !!durum.gecikmeIsareti,
    yeniDeneyapAdi: deneyapOnerilsin ? deneyapSonuc.yeniAd : null,
  }
}

/** Yerel bugünün YYYY-MM-DD hâli — toISOString UTC+3'te bir gün geri kaydırır */
function bugunYerel(): string {
  const d = new Date()
  const iki = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${iki(d.getMonth() + 1)}-${iki(d.getDate())}`
}
