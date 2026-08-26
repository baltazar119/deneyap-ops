-- Migration 010: Fix drive_tokens - refresh_token can be null (some Google flows don't return it)
alter table public.drive_tokens
  alter column refresh_token drop not null;

-- Also allow null values going forward
alter table public.drive_tokens
  alter column refresh_token set default null;
