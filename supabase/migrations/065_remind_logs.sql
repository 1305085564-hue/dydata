-- ============================================================
-- 065: 催交记录表（remind_logs）
-- 用于记录每日催交发送历史，支持豁免-催交闭环统计
-- ============================================================

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

-- 索引：按日期查询催交记录
CREATE INDEX IF NOT EXISTS idx_remind_logs_target_date ON public.remind_logs(target_date);
-- 索引：按用户查询催交记录
CREATE INDEX IF NOT EXISTS idx_remind_logs_user_id ON public.remind_logs(user_id);
-- 索引：按日期+用户查询（用于去重和统计）
CREATE INDEX IF NOT EXISTS idx_remind_logs_target_date_user ON public.remind_logs(target_date, user_id);

alter table public.remind_logs enable row level security;

-- RLS：管理员/owner 可查看所有记录
-- [重放修复] 原写法 `CREATE POLICY IF NOT EXISTS` 在 PostgreSQL 全版本均非合法语法
--   （CREATE POLICY 没有 IF NOT EXISTS 分支），导致本文件在 `supabase db reset --local`
--   空库重放时直接 42601，本迁移的效果在线上从未被真正应用过（线上靠人工执行的
--   `补丁/065-safe-patch.sql` 补齐）。改为 drop-if-exists + create，语义不变且可重复执行。
DROP POLICY IF EXISTS "admin can view all remind logs" ON public.remind_logs;
CREATE POLICY "admin can view all remind logs"
  ON public.remind_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'owner')
    )
  );

-- RLS：成员可查看自己的记录
DROP POLICY IF EXISTS "member can view own remind logs" ON public.remind_logs;
CREATE POLICY "member can view own remind logs"
  ON public.remind_logs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- service_role 拥有全部权限（用于 cron 写入）
GRANT ALL ON public.remind_logs TO service_role;

-- ============================================================
-- RPC：查询某成员在某日期前 N 天内的催交次数
-- ============================================================
CREATE OR REPLACE FUNCTION public.count_remind_logs_for_user(
  p_user_id uuid,
  p_target_date date,
  p_days int DEFAULT 7
)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int
  FROM public.remind_logs
  WHERE user_id = p_user_id
    AND target_date <= p_target_date
    AND target_date > (p_target_date - (p_days || ' days')::interval)
$$;

GRANT EXECUTE ON FUNCTION public.count_remind_logs_for_user(uuid, date, int) TO authenticated, service_role;
