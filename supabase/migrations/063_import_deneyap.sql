-- 063_import_deneyap.sql
--
-- İçe aktarma RPC'si DENEYAP farkında hâle getiriliyor (Faz 7).
--
-- 056'daki iki fonksiyon `deneyap_id`'yi hiç bilmiyordu; Excel'de DENEYAP
-- sütunu olsa bile alan boş kalıyordu. Bu dosya 056'nın BİREBİR kopyası,
-- üzerine YALNIZCA `deneyap_id` satırları eklendi:
--   * `il` yazımına dokunulmadı — 061'deki trigger `deneyap_id` doluyken
--     zaten `il`'i DENEYAP'tan türetiyor.
--   * Eşleştirme anahtarı (import_fingerprint) mantığına DOKUNULMADI.
--   * "Yalnızca dolu gelen alanlar yazılır" kuralı `deneyap_id` için de
--     geçerli: Excel'de DENEYAP sütunu yoksa mevcut bağ EZİLMEZ.

/* ── Uygula ─────────────────────────────────────────────────────────────── */

create or replace function public.import_tasks_apply(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org      uuid;
  v_user     uuid;
  v_mod      text;
  v_row      record;
  v_task     public.tasks%rowtype;
  v_mevcut   uuid;
  v_norm     jsonb;
  v_eklendi  int := 0;
  v_guncel   int := 0;
  v_atlandi  int := 0;
begin
  select organization_id, created_by, coalesce(secenekler->>'mod', 'guncelle')
    into v_org, v_user, v_mod
    from public.import_batches
   where id = p_batch_id;

  if v_org is null then
    raise exception 'İçe aktarma partisi bulunamadı';
  end if;

  -- security definer olduğu için yetkiyi BURADA doğrulamak zorundayız,
  -- aksi halde herhangi bir oturum başka org'un partisini uygulayabilir
  if not public.is_org_admin(v_org) then
    raise exception 'Bu işlem için yetkiniz yok';
  end if;

  update public.import_batches set durum = 'uygulaniyor' where id = p_batch_id;

  for v_row in
    select * from public.import_rows
     where batch_id = p_batch_id and eylem <> 'hatali'
     order by satir_no
  loop
    v_norm := v_row.normalize_veri;
    if v_norm is null then continue; end if;

    -- Eşleşen görevi ara (yalnızca bu org içinde)
    v_mevcut := null;
    if v_mod <> 'her_zaman_olustur' then
      if v_norm->>'external_key' is not null then
        select id into v_mevcut from public.tasks
         where organization_id = v_org and external_key = v_norm->>'external_key'
         limit 1;
      else
        select id into v_mevcut from public.tasks
         where organization_id = v_org and import_fingerprint = v_row.eslesme_anahtari
         limit 1;
      end if;
    end if;

    if v_mevcut is not null and v_mod = 'atla' then
      update public.import_rows
         set eylem = 'atlandi', task_id = v_mevcut
       where id = v_row.id;
      v_atlandi := v_atlandi + 1;

    elsif v_mevcut is not null then
      -- GÜNCELLE. Kritik kural: yalnızca dolu gelen alanlar yazılır.
      -- Excel'de "Durum" sütunu yoksa ya da hücre boşsa, sahada elle
      -- yapılmış güncelleme EZİLMEZ. Bu kural olmadan "göç" özelliği
      -- saha güncellemelerini silen bir silaha dönüşür.
      select * into v_task from public.tasks where id = v_mevcut;

      update public.import_rows
         set onceki = to_jsonb(v_task), task_id = v_mevcut, eylem = 'guncellendi'
       where id = v_row.id;

      update public.tasks set
        title           = coalesce(nullif(v_norm->>'title', ''), title),
        description     = coalesce(nullif(v_norm->>'description', ''), description),
        il              = coalesce(nullif(v_norm->>'il', ''), il),
        deneyap_id      = coalesce((nullif(v_norm->>'deneyap_id', ''))::uuid, deneyap_id),
        status          = coalesce(nullif(v_norm->>'status', '')::text, status),
        priority        = coalesce(nullif(v_norm->>'priority', '')::text, priority),
        task_type       = coalesce(nullif(v_norm->>'task_type', '')::text, task_type),
        start_date      = coalesce((nullif(v_norm->>'start_date', ''))::date, start_date),
        due_date        = coalesce((nullif(v_norm->>'due_date', ''))::date, due_date),
        estimated_hours = coalesce((nullif(v_norm->>'estimated_hours', ''))::numeric, estimated_hours),
        assignee_id     = coalesce((nullif(v_norm->>'assignee_id', ''))::uuid, assignee_id),
        external_key    = coalesce(nullif(v_norm->>'external_key', ''), external_key),
        import_batch_id = p_batch_id
      where id = v_mevcut;

      v_guncel := v_guncel + 1;

    else
      -- EKLE
      insert into public.tasks (
        organization_id, created_by, title, description, il, deneyap_id,
        status, priority, task_type, start_date, due_date,
        estimated_hours, assignee_id, external_key, import_fingerprint, import_batch_id
      ) values (
        v_org, v_user,
        v_norm->>'title',
        nullif(v_norm->>'description', ''),
        nullif(v_norm->>'il', ''),
        (nullif(v_norm->>'deneyap_id', ''))::uuid,
        coalesce(nullif(v_norm->>'status', ''), 'backlog'),
        coalesce(nullif(v_norm->>'priority', ''), 'normal'),
        coalesce(nullif(v_norm->>'task_type', ''), 'other'),
        (nullif(v_norm->>'start_date', ''))::date,
        (nullif(v_norm->>'due_date', ''))::date,
        (nullif(v_norm->>'estimated_hours', ''))::numeric,
        (nullif(v_norm->>'assignee_id', ''))::uuid,
        nullif(v_norm->>'external_key', ''),
        v_row.eslesme_anahtari,
        p_batch_id
      )
      returning id into v_mevcut;

      update public.import_rows
         set eylem = 'eklendi', task_id = v_mevcut
       where id = v_row.id;

      v_eklendi := v_eklendi + 1;
    end if;
  end loop;

  update public.import_batches
     set durum = 'tamamlandi',
         olusturulan = v_eklendi,
         guncellenen = v_guncel,
         atlanan = v_atlandi,
         uygulandi_at = now()
   where id = p_batch_id;

  return jsonb_build_object(
    'olusturulan', v_eklendi,
    'guncellenen', v_guncel,
    'atlanan', v_atlandi
  );
end
$$;

/* ── Geri al ────────────────────────────────────────────────────────────── */

create or replace function public.import_tasks_revert(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org       uuid;
  v_uygulandi timestamptz;
  v_row       record;
  v_onceki    jsonb;
  v_silindi   int := 0;
  v_geri      int := 0;
  v_korunan   int := 0;
begin
  select organization_id, uygulandi_at into v_org, v_uygulandi
    from public.import_batches where id = p_batch_id;

  if v_org is null then raise exception 'İçe aktarma partisi bulunamadı'; end if;
  if not public.is_org_admin(v_org) then raise exception 'Bu işlem için yetkiniz yok'; end if;
  if v_uygulandi is null then raise exception 'Bu parti henüz uygulanmamış'; end if;
  if v_uygulandi < now() - interval '30 days' then
    raise exception '30 günden eski içe aktarmalar geri alınamaz';
  end if;

  for v_row in
    select r.*, t.updated_at
      from public.import_rows r
      join public.tasks t on t.id = r.task_id
     where r.batch_id = p_batch_id and r.eylem in ('eklendi', 'guncellendi')
  loop
    -- İçe aktarmadan SONRA elle düzenlenmiş görevlere dokunmuyoruz.
    -- Kullanıcının sonradan yaptığı işi geri alma adına silmek kabul edilemez.
    if v_row.updated_at > v_uygulandi then
      v_korunan := v_korunan + 1;
      continue;
    end if;

    if v_row.eylem = 'eklendi' then
      delete from public.tasks where id = v_row.task_id;
      v_silindi := v_silindi + 1;
    else
      v_onceki := v_row.onceki;
      if v_onceki is not null then
        update public.tasks set
          title           = v_onceki->>'title',
          description     = v_onceki->>'description',
          -- deneyap_id de geri yazılır, yoksa geri alma SESSİZCE ETKİSİZ
          -- kalır: bağ kalırsa 061'deki trigger il'i DENEYAP'ınkine geri çeker.
          deneyap_id      = (nullif(v_onceki->>'deneyap_id', ''))::uuid,
          il              = v_onceki->>'il',
          status          = v_onceki->>'status',
          priority        = v_onceki->>'priority',
          task_type       = v_onceki->>'task_type',
          start_date      = (nullif(v_onceki->>'start_date', ''))::date,
          due_date        = (nullif(v_onceki->>'due_date', ''))::date,
          estimated_hours = (nullif(v_onceki->>'estimated_hours', ''))::numeric,
          assignee_id     = (nullif(v_onceki->>'assignee_id', ''))::uuid,
          external_key    = nullif(v_onceki->>'external_key', '')
        where id = v_row.task_id;
        v_geri := v_geri + 1;
      end if;
    end if;
  end loop;

  update public.import_batches
     set durum = 'geri_alindi', geri_alindi_at = now(), geri_alan = auth.uid()
   where id = p_batch_id;

  return jsonb_build_object(
    'silinen', v_silindi,
    'geri_alinan', v_geri,
    'korunan', v_korunan
  );
end
$$;

revoke all on function public.import_tasks_apply(uuid)  from public;
revoke all on function public.import_tasks_revert(uuid) from public;
grant execute on function public.import_tasks_apply(uuid)  to authenticated;
grant execute on function public.import_tasks_revert(uuid) to authenticated;
