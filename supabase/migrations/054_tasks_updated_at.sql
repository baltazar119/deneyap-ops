-- 054_tasks_updated_at.sql
-- tasks tablosunda yalnızca created_at vardı; güncelleme zamanı hiç tutulmuyordu.
--
-- Excel içe aktarmasını geri alırken şu soruyu cevaplayabilmek gerekiyor:
-- "Bu görev içe aktarmadan SONRA elle düzenlendi mi?" Düzenlendiyse geri alma
-- onu silmemeli/üzerine yazmamalı. Cevap updated_at > import_batches.applied_at
-- karşılaştırmasıyla veriliyor.
--
-- Ayrıca genel hijyen: "en son ne zaman dokunuldu" bilgisi raporlamada da işe yarar.

alter table public.tasks
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

drop trigger if exists tasks_touch_updated_at on public.tasks;
create trigger tasks_touch_updated_at
  before update on public.tasks
  for each row execute function public.touch_updated_at();

-- Mevcut satırlar için makul başlangıç: oluşturulma zamanı
update public.tasks set updated_at = created_at where updated_at < created_at;

comment on column public.tasks.updated_at is
  'Trigger ile otomatik güncellenir. İçe aktarma geri alınırken "sonradan elle düzenlendi mi" kontrolü buna dayanır.';
