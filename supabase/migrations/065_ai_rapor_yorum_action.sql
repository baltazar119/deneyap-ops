-- 065_ai_rapor_yorum_action.sql
--
-- `ai_usage_logs.action` CHECK kısıtına 'rapor_yorum' ekleniyor.
--
-- NEDEN AYRI BİR EYLEM ADI: rapor yorumu diğer AI uçlarından farklı bir
-- kotaya tabi (AI_DAILY_LIMITS.raporYorum) ve hiçbir şey ÜRETMİYOR, yalnızca
-- var olan veriyi yorumluyor. 'analyze' altına sokmak iki farklı işi aynı
-- günlük sınıra bağlardı.
--
-- Bu kısıt olmadan INSERT sessizce kısıt ihlaliyle düşer ve kota SAYILMAZ —
-- yani sınır hiç uygulanmaz. Faz 5'te `notifications.event_type` ile tam
-- olarak bu yaşandı: kodun ürettiği 6 tip kısıtta yoktu ve o bildirimler
-- hiç oluşmuyordu.

alter table public.ai_usage_logs
  drop constraint if exists ai_usage_logs_action_check;

alter table public.ai_usage_logs
  add constraint ai_usage_logs_action_check
  check (action in ('generate', 'revise', 'revise_task', 'analyze', 'rapor_yorum'));

comment on constraint ai_usage_logs_action_check on public.ai_usage_logs is
  'Yeni bir AI ucu eklerken eylem adını BURAYA da ekleyin; aksi halde kullanım '
  'kaydı sessizce düşer ve günlük kota hiç uygulanmaz.';
