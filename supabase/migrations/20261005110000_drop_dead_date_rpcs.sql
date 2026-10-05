-- 2026-10-05 S5.3：删除 6 个无人调用的日期 RPC（死函数清理）
--
-- 依据
--   1) docs/reference/2026-10-05-S5.3-生产函数只读盘点.md（生产 pg_proc 全定义存档）
--   2) [QW] 10-05 对账批准：6 个函数 src 非测试引用为 0、pg_stat_user_functions 累计 0、
--      pg_depend 外部依赖 0；get_leaderboard_rows 有现役调用（route.ts:45）保留不动。
--   3) 阿禅 10-05 授权执行（清理类，非止血，当轮确认）。
--
-- 删除顺序：先 v1（外层包装）后 v2（被 v1 调用的实现），避免中间态出现"活的坏函数"。
--   admin_cockpit_summary(date) 体内调 admin_cockpit_summary_v2(date,text)
--   admin_pending_submissions_today(date) 体内调 admin_pending_submissions_today_v2(date,text)
--   admin_pending_videos_today / admin_sidebar_badges_summary 无 v2 包装关系。
--
-- 幂等：全部 drop function if exists，本地/其它环境重复执行不报错。
-- 回滚：6 个函数完整定义已存档于盘点文档，如需恢复按该文档 CREATE OR REPLACE 逐字重建
--   （重建必须带 set timezone = 'Asia/Shanghai'，见台账"函数级 SET timezone"纪律行）。

drop function if exists public.admin_cockpit_summary(date);
drop function if exists public.admin_cockpit_summary_v2(date, text);
drop function if exists public.admin_pending_submissions_today(date);
drop function if exists public.admin_pending_submissions_today_v2(date, text);
drop function if exists public.admin_pending_videos_today(date, integer);
drop function if exists public.admin_sidebar_badges_summary(date, uuid[]);
