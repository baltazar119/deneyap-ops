-- ============================================================
-- Migration 027: Join Code — organizations.join_code kolonu
-- ============================================================

-- 1. Kolonu ekle (nullable olarak başla, backfill sonrası NOT NULL yapılacak)
alter table public.organizations
  add column if not exists join_code text;

-- 2. Mevcut org'lar için benzersiz 6 karakterlik kod üret
do $$
declare
  rec record;
  candidate text;
  collision boolean;
begin
  for rec in
    select id from public.organizations where join_code is null
  loop
    loop
      candidate := upper(substring(encode(gen_random_bytes(4), 'hex') from 1 for 6));
      select exists(
        select 1 from public.organizations where join_code = candidate
      ) into collision;
      exit when not collision;
    end loop;
    update public.organizations set join_code = candidate where id = rec.id;
  end loop;
end; $$;

-- 3. NOT NULL ve UNIQUE kısıtlamaları ekle
alter table public.organizations
  alter column join_code set not null;

alter table public.organizations
  add constraint organizations_join_code_unique unique (join_code);

create unique index if not exists organizations_join_code_idx
  on public.organizations (join_code);

-- 4. Yeni INSERT'lerde otomatik kod üretecek trigger
create or replace function public.generate_join_code()
returns trigger
language plpgsql
as $$
declare
  candidate text;
  collision boolean;
begin
  if new.join_code is null then
    loop
      candidate := upper(substring(encode(gen_random_bytes(4), 'hex') from 1 for 6));
      select exists(
        select 1 from public.organizations where join_code = candidate
      ) into collision;
      exit when not collision;
    end loop;
    new.join_code := candidate;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_org_join_code on public.organizations;

create trigger trg_org_join_code
  before insert on public.organizations
  for each row execute function public.generate_join_code();
