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
