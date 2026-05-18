-- ============================================================
-- 065-safe-patch：实际补齐 065_remind_logs 的 RLS / policy / RPC
-- 原因：065 原文用了 PG 17 才支持的 CREATE POLICY IF NOT EXISTS
--       导致 supabase db push 在 PG 15 远端报语法错，从未真正应用
--       但 remind_logs 表在线上已存在（业务代码在用），只缺 RLS policy
-- 策略：全部 idempotent + drop policy if exists 重建，对存量数据零风险
-- ============================================================

-- 1) 表结构（防御性，已存在则跳过）
create table if not exists public.remind_logs (
  id uuid primary key default gen_random_uuid(),
  target_date date not null,
  user_id uuid references auth.users(id),
  user_name text,
  channel text not null default 'feishu_webhook',
  status text not null check (status in ('success', 'failed')),
  is_exempted boolean not null default false,
  exempt_reason text,
  sent_at timestamptz default now(),
  response_body text
);

-- 2) 索引
create index if not exists idx_remind_logs_target_date
  on public.remind_logs (target_date);
create index if not exists idx_remind_logs_user_id
  on public.remind_logs (user_id);
create index if not exists idx_remind_logs_target_date_user
  on public.remind_logs (target_date, user_id);

-- 3) RLS
alter table public.remind_logs enable row level security;

drop policy if exists "admin can view all remind logs" on public.remind_logs;
create policy "admin can view all remind logs"
  on public.remind_logs
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'owner')
    )
  );

drop policy if exists "member can view own remind logs" on public.remind_logs;
create policy "member can view own remind logs"
  on public.remind_logs
  for select
  to authenticated
  using (user_id = auth.uid());

-- 4) service_role 全权（cron 写入用）
grant all on public.remind_logs to service_role;

-- 5) RPC：查询某成员在某日期前 N 天内的催交次数
create or replace function public.count_remind_logs_for_user(
  p_user_id uuid,
  p_target_date date,
  p_days int default 7
)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.remind_logs
  where user_id = p_user_id
    and target_date <= p_target_date
    and target_date > (p_target_date - (p_days || ' days')::interval)
$$;

grant execute on function public.count_remind_logs_for_user(uuid, date, int)
  to authenticated, service_role;
