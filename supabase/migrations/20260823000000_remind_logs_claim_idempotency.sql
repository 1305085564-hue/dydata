-- ============================================================
-- 催交日志并发幂等（claim-then-send）
--
-- 背景：/api/remind 原先「查成功记录 → 发送 → 写成功记录」在两个
-- 请求同时进入时会都认为"尚未发送"，导致同一成员收到两条催交。
-- 本 migration 提供数据库层兜底：
--   1) status 允许 'sending'，作为发送前抢占标记；
--   2) 同一成员同一天（非豁免）最多一条 success 记录的唯一索引。
--
-- ⚠️ 执行前置检查（Supabase SQL Editor 先跑这句，无结果才可继续）：
--   select target_date, user_id, count(*)
--   from public.remind_logs
--   where status = 'success' and is_exempted = false
--   group by 1, 2 having count(*) > 1;
-- 若有历史重复行，唯一索引会创建失败；先人工归并历史重复再执行。
-- ============================================================

alter table public.remind_logs
  drop constraint if exists remind_logs_status_check;

alter table public.remind_logs
  add constraint remind_logs_status_check
  check (status in ('success', 'failed', 'sending'));

create unique index if not exists uq_remind_logs_success_per_day
  on public.remind_logs(target_date, user_id)
  where status = 'success' and is_exempted = false;
