import { trFold } from '@/lib/turkce'
import type { Task } from '@/types/database'

/**
 * Görev araması — Türkçe katlanmış, token bazlı VE (AND) eşleşme.
 *
 * "ankara rapor" yazan kullanıcı iki kelimeyi de içeren görevi bekliyor,
 * herhangi birini içeren 40 görevi değil. Sıra önemli değil.
 *
 * Aranan alanlar: başlık, açıklama, il, atanan ve DENEYAP adı.
 *
 * Katlama `trFold` ile — "İZMİR", "izmir" ve "Izmir" aynı sonucu vermeli.
 * Aynı katlama içe aktarmada da kullanılıyor, ikinci bir kopya çıkarılmadı.
 */

export interface AranabilirGorev {
  title: string
  description?: string | null
  il?: string | null
  assigneeName?: string
  /** Görevin DENEYAP'ının adı (varsa) — çağıran taraf çözüp verir. */
  deneyapAdi?: string | null
}

/**
 * Bir görevin aranabilir metni — katlanmış tek satır.
 *
 * Ayrı fonksiyon çünkü çağıran tarafta `useMemo` ile ÖNCEDEN hesaplanıyor:
 * her tuş vuruşunda 500 görevin metnini yeniden katlamak arama kutusunu
 * gözle görülür şekilde yavaşlatırdı.
 */
export function aranabilirMetin(t: AranabilirGorev): string {
  return trFold(
    [t.title, t.description ?? '', t.il ?? '', t.assigneeName ?? '', t.deneyapAdi ?? ''].join(' '),
  )
}

/** Sorguyu katlanmış token'lara böler. Boş sorgu → boş dizi (süzme yok). */
export function aramaTokenlari(sorgu: string): string[] {
  const katlanmis = trFold(sorgu)
  return katlanmis ? katlanmis.split(' ').filter(Boolean) : []
}

/** Her token metinde geçiyor mu (AND). Token yoksa daima true. */
export function aramaEslesirMi(katlanmisMetin: string, tokenlar: string[]): boolean {
  return tokenlar.every(tok => katlanmisMetin.includes(tok))
}

/**
 * Kolay yol: küçük listeler ve testler için. Sıcak yolda (her tuş vuruşu)
 * `aranabilirMetin` önceden hesaplanıp `aramaEslesirMi` kullanılmalı.
 */
export function gorevleriAra<T extends Task & AranabilirGorev>(gorevler: T[], sorgu: string): T[] {
  const tokenlar = aramaTokenlari(sorgu)
  if (tokenlar.length === 0) return gorevler
  return gorevler.filter(t => aramaEslesirMi(aranabilirMetin(t), tokenlar))
}
