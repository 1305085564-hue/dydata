-- C8 低峰另单执行。前置：核对当前部署、外部作业与应用调用，运行只读预检，
-- 审阅目录依赖与函数正文候选。仅同批删除对象间的依赖可在确认删除顺序后放行。
-- 保留目标库这 13 个精确签名的 pg_get_functiondef、所有者和 ACL，确认备份与执行窗口。
-- 以下 13 条即完整签名清单。默认 RESTRICT，任一未解除的目录依赖使整笔回滚。
-- 保留 exemption_request 排除约束、btree_gist 扩展与全部业务数据。
--
-- 回滚：优先按执行前导出的实际定义、所有者、授权还原，先建被引用函数，再建调用方。
-- 历史迁移定位（supabase/migrations/ 内版本前缀，仅摘取目标函数及对应授权）：
--   admin_analytics_first_screen / admin_first_screen_perf_regressions：20260530052000
--   admin_pending_violations：059；conversion_hub 三项：060
--   get_today_submission_status：009；validate_invite_code：004
--   case_library_actor_scope：20260807103000；case_library_processed：20260527000000
--   case_library_inbox：20260527200908；case_library_inbox_counts：073
--   inbox / inbox_counts 另有 20260628113000 版本，按实际生效定义选择。
--   re_review_exemption_request_atomically：20260902190000（前版 20260901120000）
-- 在同一事务恢复执行前存在的签名及其原 ACL，复核后刷新接口缓存并提交。

begin;
drop function if exists public.admin_analytics_first_screen(uuid[],uuid,text,text,date,date,boolean,date,date);
drop function if exists public.admin_pending_violations(integer);
drop function if exists public.conversion_hub_advice_list(integer);
drop function if exists public.conversion_hub_pipeline_counts(date);
drop function if exists public.conversion_hub_weekly_items(date,text);
drop function if exists public.get_today_submission_status();
drop function if exists public.validate_invite_code(text);
drop function if exists public.case_library_inbox_counts(uuid);
drop function if exists public.case_library_inbox(uuid);
drop function if exists public.case_library_processed(uuid);
drop function if exists public.case_library_actor_scope(uuid);
drop function if exists public.re_review_exemption_request_atomically(uuid,text,text);
drop function if exists public.admin_first_screen_perf_regressions(text,integer,integer);
notify pgrst, 'reload schema';
commit;
