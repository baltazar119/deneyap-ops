-- 058_haftalik_rapor_ayari.sql
-- Haftalık rapor e-postası org ve kullanıcı bazında açılıp kapatılabilsin.
--
-- Yeni tablo açmıyoruz: automation_settings zaten org başına tek satır ve
-- diğer otomasyon anahtarlarını (task_overdue, overload_threshold…) tutuyor.

alter table public.automation_settings
  add column if not exists haftalik_rapor boolean not null default true;

comment on column public.automation_settings.haftalik_rapor is
  'Pazartesi sabahı rol bazlı PDF raporun ilgili üyelere e-postayla gönderilmesi.';

-- Kullanıcı bazlı kapatma email_preferences üzerinden
alter table public.email_preferences
  add column if not exists weekly_report boolean not null default true;

comment on column public.email_preferences.weekly_report is
  'Kullanıcının haftalık PDF raporu almak isteyip istemediği.';
