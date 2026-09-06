# DEVAM — proje durumu

**14 fazın tamamı bitti.** Ayrıntılı plan: [docs/YOL-HARITASI.md](YOL-HARITASI.md)

---

## Durum: HAZIR

**Tüm migration'lar uygulandı** (059–065) ve doğrulandı. Demo trend geçmişi
üretildi (900 ölçüm satırı). Günlük cron gerçek ölçüm yazıyor ve idempotent
çalıştığı iki kez koşturularak doğrulandı.

Trend geçmişini yeniden üretmek gerekirse:

```bash
npm run seed:ozet
```

Silmek için (yalnızca demo satırları, gerçek ölçümlere dokunmaz):

```bash
npm run seed:ozet -- --temizle
```

---

## Proje

DENEYAP OYS — T3 Vakfı Yapay Zekâ Creathon için operasyon yönetim sistemi.
Next.js 14 (App Router) + TypeScript strict + Supabase + Vercel.

- Canlı: https://deneyap-ops.vercel.app
- Depo: https://github.com/baltazar119/deneyap-ops (`master`)
- Her `git push` sonrası Vercel otomatik yayına alır.

**Roller:** `owner`=Merkez Operasyon · `admin`=Koordinatör · `member`=İl Sorumlusu ·
`viewer`=Yetkili Yönetici

**Demo hesaplar** (şifre: `Deneyap2026!`): `merkez@` · `koordinator@` · `ankara@` ·
`izmir@` · `yonetici@` + `deneyap.demo` · workspace: `deneyap-demo`

---

## Durum

Son commit `47946c3`. `npx tsc --noEmit` temiz · **486 test yeşil** ·
`npx next build` başarılı · dört rolle tarayıcı turu sıfır konsol hatası.

| Faz | Ne geldi |
|---|---|
| 0 | Dönem filtresi düzeltmesi, fingerprint altın testleri, ResponsiveModal, panel temizliği |
| 1-2 | Görevler sayfası: 1157→366 satır, hazır görünümler + arama, 11→3 kontrol |
| 3-4 | DENEYAP veri modeli (ayrı tablo, DB trigger, il kilidi) + arayüz |
| 5 | Duyurular + panelde popup (bir kez göster, DB'de) |
| 6 | Panel işlevselleşti (4 yeni blok, kaydırmaya açıldı) |
| 7 | Excel'de DENEYAP — fingerprint üç katmanlı korumayla |
| 8 | Risk sunucu/istemci ayrımı + günlük özet + trend altyapısı |
| 9 | Grafikler (web + PDF, tek geometri, kütüphanesiz) |
| 10 | Kural tabanlı yorum motoru (12 kural) |
| 11 | Türkiye ısı haritası (Natural Earth, kamu malı) |
| 12 | Excel'e yorum/eğilim/risk sayfaları + rol matrisi doğrulaması |
| 13 | AI ile derinleştirme (isteğe bağlı) |

---

## Doğrulanmış rol matrisi (gerçek API)

```
  merkez      | 10 bölüm | 5 yorum | 13 trend | 3 il | 4 sinyal | isim VAR
  koordinator | 10 bölüm | 5 yorum | 13 trend | 3 il | 4 sinyal | isim VAR
  ankara      |  9 bölüm | 1 yorum | 13 trend | 1 il | 1 sinyal | isim VAR
  yonetici    |  7 bölüm | 3 yorum | 13 trend | 3 il | 0 sinyal | İSİM YOK
```

İl Sorumlusu yalnızca kendi ilini görüyor. Yetkili Yönetici çıktısında kişi adı
hiç geçmiyor — yapısal koruma (`kisiBazli` bayraklı kuralların hiç çalıştırılmaması)
uçtan uca çalışıyor.

---

## Dokunulmaması gerekenler

| Dosya | Neden |
|---|---|
| `src/lib/import/fingerprint.ts` | İçe aktarma tekilleştirme anahtarı. Değişirse aynı Excel ikinci kez yüklendiğinde **kopya görev** oluşur, sessizce. Altın testlerle kilitli — test kırılırsa "beklenen değeri güncelle" YANLIŞ tepkidir. |
| `src/lib/taskScope.ts` | Rol/il kapsam kuralı. Yanlış tırnaklama hata vermez, **sessizce yanlış sonuç** verir. |
| `src/lib/rapor/kapsam.ts` | `member` için boş küme güvenliği — "tüm iller"e düşmek veri sızıntısıdır. |
| `src/lib/harita/turkiyeIller.ts` | Otomatik üretildi. Elle düzenleme; `npm run harita:uret` ile yeniden üret. |

---

## Öğrenilen tuzaklar

- **`next build`'i `next dev` çalışırken KOŞTURMA** — `.next`'i bozar, `MODULE_NOT_FOUND`.
  Bozulursa: dev'i durdur, `rm -rf .next`, yeniden başlat.
- **Sunucuda Supabase istemcisi kurarken `{ global: { fetch: onbelleksizFetch } }` ver.**
  Next.js route handler içindeki `fetch`'i önbelleğe alıyor; supabase-js de fetch
  kullandığı için **veritabanı OKUMALARI bayat kalıyor**. `dynamic = 'force-dynamic'`
  bunu engellemiyor (ölçüldü).
- **Yeni bir CHECK kısıtlı sütun değeri eklerken migration yazmayı unutma.**
  `notifications.event_type` ve `ai_usage_logs.action` ikisi de bu yüzden sessizce
  kayıt düşürdü.
- **Kod migration'dan önce yayına çıkabilir** — yeni kolonlar kritik yolun sorgusuna
  eklenmemeli (Faz 3'te `orgContext` bu yüzden tüm org sayfalarını kırdı).
- Form doldururken `computer type` yerine **`form_input`** (React state'ine işlemiyor).
- Konsol geçmişi sekmede birikir — temiz kontrol için **yeni sekme aç**.
- PDF metin çıkarma araçları (`pdf-parse` v2) `@react-pdf` çıktısını okuyamıyor.

**Migration numaralandırma:** en son **065**. Yenileri 066'dan devam.

---

## Komutlar

```bash
npm run dev              # dev server (3000)
npx tsc --noEmit         # tip kontrolü
npx vitest run           # 486 test
npx next build           # üretim derlemesi
npm run seed:demo        # demo veriyi yeniden kur
npm run seed:ozet        # 90 günlük demo trend geçmişi
npm run harita:uret      # Türkiye haritasını yeniden üret (GeoJSON gerekir)
node scripts/tr-fold-ikiz.mjs   # SQL/TS trFold ikiz doğrulaması
```

---

## Bilinen, kapsam dışı teknik borç

- Google OAuth: `state` nonce doğrulanmıyor, `api/drive/*` uçlarında auth yok,
  `api/drive/debug` açık, `meetings` GET kimlik doğrulamıyor
- `notifications` INSERT politikası gevşek (`auth.uid() is not null`)
- PWA ikonları / manifest yok
- `npm audit` borcu (çoğu devralınmış)

---

## Canlıda dikkat

`NEXT_PUBLIC_DEMO_MODE=true` — giriş ekranındaki demo paneli **açık**. Creathon
sunumu için doğru, gerçek veriyle kullanıma geçmeden önce Vercel'den kaldırılmalı.

`src/components/YasalSayfa.tsx` içindeki `KURUM` sabitinde `[KURUM ADRESİ]` ve
`[VERBİS KAYIT NO]` hâlâ doldurulmayı bekliyor.
