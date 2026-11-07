-- 截图识别测速台账与 90 天清理函数
-- 2026-11-07 审查修订版

create table if not exists public.ocr_recognition_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  duration_ms integer not null,
  ocr_ms integer,
  download_ms integer,
  channel_name text,
  model_id text,
  screenshot_type text,
  is_success boolean not null default true,
  error_code text,
  user_id uuid
);

create index if not exists idx_ocr_recognition_logs_created_at
  on public.ocr_recognition_logs (created_at desc);

-- 开启 RLS，不配置前台策略（浏览器端密钥不可读写）
alter table public.ocr_recognition_logs enable row level security;
revoke all on public.ocr_recognition_logs from public, anon, authenticated;
grant select, insert, update, delete on public.ocr_recognition_logs to service_role;

-- 90 天自动清理函数（供每日定时任务调用）
create or replace function public.cleanup_ocr_recognition_logs()
returns integer
language plpgsql
security definer
as $$
declare
  deleted_count integer;
begin
  delete from public.ocr_recognition_logs
  where created_at < now() - interval '90 days';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.cleanup_ocr_recognition_logs() from public, anon, authenticated;
grant execute on function public.cleanup_ocr_recognition_logs() to service_role;
