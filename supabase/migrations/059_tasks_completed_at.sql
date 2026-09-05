-- 059_tasks_completed_at.sql
--
-- Bir görevin NE ZAMAN tamamlandığı hiçbir yerde tutulmuyordu. `updated_at`
-- (054) yalnızca "en son ne zaman dokunuldu" bilgisi — başlık düzeltmesi de
-- onu tazeliyor, dolayısıyla tamamlanma zamanı için güvenilir değil.
--
-- Buna üç yerde ihtiyaç var:
--   1. "Dönemde tamamlanan görev" — rapor dönem filtresi
--   2. Tamamlanma trendi (haftalık/aylık grafik)
--   3. Çevrim süresi (açılıştan bitişe kaç gün)
--
-- Tam bir durum değişikliği geçmişi tablosu BİLİNÇLİ olarak yapılmıyor;
-- günlük özet (snapshot) yaklaşımı trend için yeterli ve çok daha ucuz.

alter table public.tasks
  add column if not exists completed_at timestamptz;

-- Durum 'done'a geçtiğinde damgala, 'done'dan çıkınca temizle.
-- 054'teki touch_updated_at deseninin aynısı.
create or replace function public.tasks_completed_at_isaretle()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'done' and (old.status is distinct from 'done') then
    new.completed_at = now();
  elsif new.status is distinct from 'done' and old.status = 'done' then
    -- Görev yeniden açıldı: eski tamamlanma zamanı artık geçerli değil.
    new.completed_at = null;
  end if;
  return new;
end
$$;

drop trigger if exists tasks_completed_at on public.tasks;
create trigger tasks_completed_at
  before update on public.tasks
  for each row execute function public.tasks_completed_at_isaretle();

-- INSERT ile doğrudan 'done' olarak oluşturulan görevler (içe aktarma bunu
-- yapıyor) trigger'a takılmaz; ayrı bir BEFORE INSERT gerekiyor.
create or replace function public.tasks_completed_at_insert()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'done' and new.completed_at is null then
    new.completed_at = now();
  end if;
  return new;
end
$$;

drop trigger if exists tasks_completed_at_ins on public.tasks;
create trigger tasks_completed_at_ins
  before insert on public.tasks
  for each row execute function public.tasks_completed_at_insert();

-- Geriye dönük doldurma: mevcut tamamlanmış görevler için elimizdeki en iyi
-- yaklaşım updated_at. Kesin değil ama null'dan iyi; yeni kayıtlar doğru.
update public.tasks
   set completed_at = updated_at
 where status = 'done' and completed_at is null;

create index if not exists tasks_completed_at_idx
  on public.tasks (organization_id, completed_at desc)
  where completed_at is not null;

comment on column public.tasks.completed_at is
  'Görevin done durumuna geçtiği an. Trigger ile yönetilir. Geçmiş kayıtlar '
  'updated_at ile dolduruldu (yaklaşık). Tamamlanma trendi ve çevrim süresi '
  'hesapları buna dayanır.';
