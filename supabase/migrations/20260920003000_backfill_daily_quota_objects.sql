-- ============================================================
-- BLK-3 补链：日报目标对象（daily_quota_config + get_daily_quota）
-- 原因：线上对象完整且权限正确（见 docs/plans/cleanup-batches/
--       2026-09-19-blk1-blk3-b16-readonly-check.txt），但仓库迁移链
--       无其出生证明；20260919030217 权限收口已登记，本文件补齐对象本体。
-- 策略：全部幂等、逐字回放线上真实定义（PG 17.6 实测），不扩大任何权限。
--       线上已存在 → 全部安全跳过；新库重放 → 得到与线上一致的最终状态。
-- ============================================================
BEGIN;

-- 1) 表（已存在则整体跳过，含约束）
CREATE TABLE IF NOT EXISTS public.daily_quota_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  effective_date date NOT NULL UNIQUE,
  daily_target integer NOT NULL CHECK (daily_target >= 1 AND daily_target <= 50),
  created_by uuid REFERENCES public.profiles(id),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2) RLS + 策略（逐字对齐线上：成员读取 SELECT using(true)；仅管理员写入 ALL）
ALTER TABLE public.daily_quota_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "成员读取每日产量目标" ON public.daily_quota_config;
CREATE POLICY "成员读取每日产量目标" ON public.daily_quota_config
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "仅管理员写入每日产量目标" ON public.daily_quota_config;
CREATE POLICY "仅管理员写入每日产量目标" ON public.daily_quota_config
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 3) 表权限（与 20260919030217 收口口径一致：anon 零权限，authenticated 仅 SELECT+INSERT）
REVOKE ALL PRIVILEGES ON TABLE public.daily_quota_config FROM anon;
REVOKE DELETE, UPDATE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.daily_quota_config FROM authenticated;
GRANT SELECT, INSERT ON TABLE public.daily_quota_config TO authenticated;

-- 4) 函数（逐字回放线上 live_definition）
CREATE OR REPLACE FUNCTION public.get_daily_quota(p_date date)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (
      SELECT daily_target
      FROM public.daily_quota_config
      WHERE effective_date <= p_date
      ORDER BY effective_date DESC
      LIMIT 1
    ),
    4
  )::int;
$function$;

-- 5) 函数权限（anon 不可执行；authenticated/service_role 可执行）
REVOKE EXECUTE ON FUNCTION public.get_daily_quota(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_daily_quota(date) TO authenticated, service_role;

COMMIT;
