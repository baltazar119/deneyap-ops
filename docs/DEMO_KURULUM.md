# Demo hesaplar ve rol örnekleri

Denemek isteyen birinin giriş ekranından tek tıkla farklı rollere girip
**aynı görev verisinin her role nasıl göründüğünü** karşılaştırabilmesi için
bir demo workspace kurulumu.

---

## Kurulum (iki adım)

### 1. Veritabanı

Supabase panelinde **SQL Editor**'ı açın, şu dosyanın içeriğini yapıştırıp
çalıştırın:

```
supabase/demo_ve_il_kurulum.sql
```

İçinde üç migration var (tekrar çalıştırılabilir):

| Migration | Ne yapıyor |
|---|---|
| `051_task_categories` | Görev kategorilerini DENEYAP kümesine çeker |
| `052_org_role_viewer` | `viewer` (Yetkili Yönetici) rolünü ekler |
| `053_il_alani` | `tasks.il` ve `organization_members.il` kolonlarını ekler |

### 2. Demo verisi

```bash
npm run seed:demo
```

`.env.local` içindeki `SUPABASE_SERVICE_ROLE_KEY` ile çalışır. Beş kullanıcı,
bir workspace (`/deneyap-demo`) ve 10 örnek görev oluşturur. Tekrar
çalıştırılabilir — mevcut kullanıcılar korunur, görevler sıfırlanır.

Migration'lar uygulanmadan çalıştırırsanız hiçbir şey oluşturmadan durur.

### 3. Paneli göster

`.env.local` içine:

```
NEXT_PUBLIC_DEMO_MODE=true
```

> **Uyarı:** Bu değişken açıkken giriş sayfasında çalışan kimlik bilgileri
> görünür. Gerçek/canlı kurulumda **açmayın**. Vercel'de bu değişkeni
> tanımlamazsanız panel hiç render edilmez.

---

## Hesaplar

Ortak şifre: `Deneyap2026!`

| E-posta | PRD rolü | Uygulama rolü | Gördüğü |
|---|---|---|---|
| `merkez@deneyap.demo` | Merkez Operasyon Ekibi | `owner` | Tüm iller; görev oluşturur ve atar |
| `koordinator@deneyap.demo` | Koordinatör | `admin` | Tüm iller; Operasyon Riski ekranı |
| `ankara@deneyap.demo` | İl Sorumlusu | `member` | Yalnızca Ankara |
| `izmir@deneyap.demo` | İl Sorumlusu | `member` | Yalnızca İzmir |
| `yonetici@deneyap.demo` | Yetkili Yönetici | `viewer` | Salt okunur: Panel, Risk, Timeline |

Rol eşleşmesinin tek kaynağı [`src/lib/roller.ts`](../src/lib/roller.ts),
demo listesinin tek kaynağı [`src/lib/demoHesaplar.ts`](../src/lib/demoHesaplar.ts).
Yeni hesap eklerken ikisini de (ve `scripts/demo-seed.mjs`'yi) güncelleyin.

---

## Neyi göstermek için tasarlandı

Örnek görev seti, PRD'nin dört durumunu da kapsıyor:

- **Bekliyor** — Ankara eğitmen oryantasyonu, Bursa kurulum takibi
- **Devam Ediyor** — Ankara kit sayımı, İzmir açılış etkinliği
- **Tamamlandı** — İzmir katılımcı listesi, dönem kapanış sunumu
- **Gecikti** — Ankara dönem raporu, İzmir 3D yazıcı bakımı
  (ayrı bir durum değil; termini geçmiş açık görev)

Karşılaştırma önerisi: önce `merkez@` ile girip 10 görevin tamamını görün,
sonra çıkıp `ankara@` ile girin — yalnızca Ankara görevlerinin geldiğini,
`yonetici@` ile girince de hiçbir düzenleme aksiyonunun görünmediğini
göreceksiniz.

---

## Demoyu kaldırma

Supabase panelinde:

- **Authentication → Users**: `@deneyap.demo` uzantılı beş kullanıcıyı silin
- **SQL Editor**: `delete from organizations where slug = 'deneyap-demo';`
  (görevler ve üyelikler cascade ile gider)

`.env.local`'den `NEXT_PUBLIC_DEMO_MODE` satırını da kaldırın.
