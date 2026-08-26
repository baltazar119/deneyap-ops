-- DENEYAP Ops — 051 + 052 + 053 birlesik kurulum
-- Supabase SQL Editor'a yapistirip bir kez calistirin.
-- Tekrar calistirilabilir (idempotent).


-- ============================================================
-- 051_task_categories.sql
-- ============================================================
-- 051_task_categories.sql
-- DENEYAP görev kategorileri: teknik + operasyon karması.
--
-- Eski küme (Tarlis): mechanical, electrical, software, research, documentation, test, other
-- Yeni küme (DENEYAP): mechanical, electrical, software, training, event, supply,
--                      admin, reporting, other
--
-- Kaldırılan research/documentation/test değerleri 'other'a taşınır.
-- Kod tarafındaki tek kaynak: src/lib/taskTypes.ts

-- ── 1) tasks.task_type ────────────────────────────────────────────────────────

-- Kısıt adı ortama göre değişebildiği için pg_constraint üzerinden bulup düşürüyoruz
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public'
      and rel.relname = 'tasks'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%task_type%'
  loop
    execute format('alter table public.tasks drop constraint %I', c.conname);
  end loop;
end $$;

update public.tasks
   set task_type = 'other'
 where task_type not in ('mechanical','electrical','software','training',
                         'event','supply','admin','reporting','other');

alter table public.tasks
  add constraint tasks_task_type_check
  check (task_type in ('mechanical','electrical','software','training',
                       'event','supply','admin','reporting','other'));

-- ── 2) draft_tasks.category ───────────────────────────────────────────────────

do $$
declare c record;
begin
  if to_regclass('public.draft_tasks') is null then
    return;
  end if;
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public'
      and rel.relname = 'draft_tasks'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%category%'
  loop
    execute format('alter table public.draft_tasks drop constraint %I', c.conname);
  end loop;
end $$;

do $$
begin
  if to_regclass('public.draft_tasks') is null then
    return;
  end if;

  update public.draft_tasks
     set category = 'other'
   where category not in ('mechanical','electrical','software','training',
                          'event','supply','admin','reporting','other');

  alter table public.draft_tasks
    add constraint draft_tasks_category_check
    check (category in ('mechanical','electrical','software','training',
                        'event','supply','admin','reporting','other'));
end $$;

-- ============================================================
-- 052_org_role_viewer.sql
-- ============================================================
-- 052_org_role_viewer.sql
-- PRD'deki "Yetkili Yönetici" rolü: raporları ve tamamlanma oranlarını
-- görür ama görev oluşturamaz/düzenleyemez.
--
-- Mevcut org_role enum'una salt-okunur bir değer ekliyoruz. RLS tarafında
-- ek iş yok: viewer bir organizasyon üyesi olduğu için is_org_member()
-- true döner (okuma açık), is_org_admin() false döner (yazma kapalı).
--
-- DİKKAT: PostgreSQL, aynı transaction içinde eklenen bir enum değerinin
-- kullanılmasına izin vermez. Bu yüzden enum değişikliği kendi migration
-- dosyasında tek başına duruyor; kullanımı 053'te.

alter type public.org_role add value if not exists 'viewer';

-- ============================================================
-- 053_il_alani.sql
-- ============================================================
-- 053_il_alani.sql
-- PRD MVP madde 2 ve 3: "Kullanıcı rolü ve sorumlu olduğu il/birim tanımlanır;
-- yalnızca ilgili görevleri görür" + "Görev, açıklama, sorumlu, il, öncelik ve
-- termin tarihiyle tek noktadan oluşturulur".
--
-- Görev, hangi ilin işi olduğunu taşır; üye ise sorumlu olduğu ili taşır.
-- İl kodu (plaka no) değil, il adı saklanıyor — kod tarafındaki liste
-- src/lib/iller.ts. Serbest metne izin veriliyor (CHECK yok), çünkü
-- "Genel Merkez" gibi il dışı birimler de atanabilmeli.

alter table public.tasks
  add column if not exists il text;

alter table public.organization_members
  add column if not exists il text;

comment on column public.tasks.il is
  'Görevin ilgili olduğu il / birim (örn. "Ankara", "Genel Merkez"). Boş = il bağımsız.';
comment on column public.organization_members.il is
  'Üyenin sorumlu olduğu il / birim. İl sorumlusu rolü bu alana göre filtrelenir.';

-- İl sorumlusunun görev listesi il üzerinden filtreleniyor
create index if not exists tasks_org_il_idx
  on public.tasks (organization_id, il);
