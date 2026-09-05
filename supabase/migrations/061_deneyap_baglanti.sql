-- 061_deneyap_baglanti.sql
--
-- `deneyaplar` (060) tabloya bağlanıyor: görev ve üye bir DENEYAP'a
-- işaret edebiliyor. İki trigger bu bağın tutarlılığını DB'de garanti eder.
--
-- NEDEN TRIGGER, NEDEN UYGULAMA KATMANI DEĞİL:
-- `tasks`'a yazan altıdan fazla yol var (görev formu, Kanban sürükle-bırak,
-- takvim, AI görev üretimi, eylem token'ı, içe aktarma RPC'si). Bunlardan
-- `import_tasks_apply` tamamen plpgsql — TypeScript'e hiç uğramıyor.
-- Senkronu uygulama katmanında yapan bir çözüm bu yollardan birini kaçırır
-- ve `il ≠ DENEYAP'ın ili` durumu SESSİZCE oluşur.

alter table public.tasks
  add column if not exists deneyap_id uuid
  references public.deneyaplar(id) on delete set null;

alter table public.organization_members
  add column if not exists deneyap_id uuid
  references public.deneyaplar(id) on delete set null;

-- DENEYAP bazlı görev listesi ve rapor kırılımı
create index if not exists tasks_org_deneyap_idx
  on public.tasks (organization_id, deneyap_id)
  where deneyap_id is not null;

comment on column public.tasks.deneyap_id is
  'Görevin DENEYAP birimi. null = birim atanmamış; bu durumda `il` serbestçe '
  'kullanılır ve davranış 060 öncesiyle birebir aynıdır.';
comment on column public.organization_members.deneyap_id is
  'Üyenin bağlı olduğu DENEYAP. Kapsam kuralı (taskScope.ts) İL seviyesinde '
  'kalır — bu alan yalnızca varsayılan seçim ve "DENEYAP''ım" görünümü için.';

-- ─────────────────────────────────────────────────────────────────────────
-- Trigger 1 — tasks: deneyap_id doluysa il'i ONDAN al
-- ─────────────────────────────────────────────────────────────────────────
-- İki iş birden yapıyor:
--   a) ÇAPRAZ-ORG ENJEKSİYONU: DENEYAP'ı (id, organization_id) ÇİFTİYLE
--      arar. Yalnızca id ile arasaydı, bir org'un kullanıcısı başka bir
--      org'un deneyap_id'sini gönderip o ismi kendi görevine yazdırabilirdi.
--      Bulunamazsa exception — sessizce null'a düşmek hatayı gizlerdi.
--   b) `il`'i DENEYAP'ın ilinden doldurur, böylece il ile birim asla
--      ayrışmaz.
-- deneyap_id null ise HİÇBİR ŞEY yapmaz: geriye dönük uyum burada.

create or replace function public.tasks_deneyap_il_senkron()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d_il text;
begin
  if new.deneyap_id is null then
    return new;
  end if;

  select d.il into d_il
    from public.deneyaplar d
   where d.id = new.deneyap_id
     and d.organization_id = new.organization_id;

  if d_il is null then
    raise exception
      'DENEYAP % bu organizasyonda bulunamadi (gorev %)', new.deneyap_id, new.id
      using errcode = 'foreign_key_violation';
  end if;

  new.il = d_il;
  return new;
end
$$;

drop trigger if exists tasks_deneyap_il on public.tasks;
create trigger tasks_deneyap_il
  before insert or update of deneyap_id, organization_id, il on public.tasks
  for each row execute function public.tasks_deneyap_il_senkron();

-- ─────────────────────────────────────────────────────────────────────────
-- Trigger 2 — deneyaplar: `il` DEĞİŞTİRİLEMEZ
-- ─────────────────────────────────────────────────────────────────────────
-- GEREKÇE (bu kısıt keyfi değil): `tasks.import_fingerprint` (055) içinde
-- görevin ESKİ ili var. DENEYAP'ın ili değişirse trigger 1 mevcut görevlerin
-- `il`'ini yeni ile taşımaz ama YENİ içe aktarmalar yeni ili kullanır →
-- aynı Excel ikinci kez yüklendiğinde fingerprint tutmaz ve KOPYA GÖREV
-- oluşur, sessizce.
--
-- Yanlış il girildiyse doğru davranış: o DENEYAP'ı kapat, doğrusunu aç.

create or replace function public.deneyaplar_il_kilidi()
returns trigger
language plpgsql
as $$
begin
  if new.il is distinct from old.il then
    raise exception
      'DENEYAP''in ili degistirilemez (% -> %). Yanlissa bu DENEYAP kapatilip dogrusu acilmali; il degisikligi ice aktarma parmak izini bozar ve kopya gorev olusturur.',
      old.il, new.il
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

drop trigger if exists deneyaplar_il_sabit on public.deneyaplar;
create trigger deneyaplar_il_sabit
  before update on public.deneyaplar
  for each row execute function public.deneyaplar_il_kilidi();
