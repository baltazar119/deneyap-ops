-- Migration 031: tasks tablosuna start_date kolonu ekle
-- Takvim ve Gantt/Timeline görünümleri için gerekli

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS start_date DATE;
