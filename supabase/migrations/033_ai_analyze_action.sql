-- Migration 033: ai_usage_logs action constraint'ine 'analyze' ekle
ALTER TABLE public.ai_usage_logs
  DROP CONSTRAINT IF EXISTS ai_usage_logs_action_check;

ALTER TABLE public.ai_usage_logs
  ADD CONSTRAINT ai_usage_logs_action_check
  CHECK (action IN ('generate', 'revise', 'revise_task', 'analyze'));
