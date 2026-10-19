-- =============================================================================
-- 20261019000000_fix_report_date_offset_by_one.sql 的回滚脚本
-- 对应迁移：supabase/migrations/20261019000000_fix_report_date_offset_by_one.sql
-- 执行时间回滚对象：2026-10-19 16:49:43 修正的 6 条（周文杰）
--
-- 逻辑：按台账 before 值还原三处字段（videos.published_at /
--       daily_reports.published_at / daily_reports.report_date）。
-- 匹配条件用「当前值 = 台账 after 值」，避免误伤修正后又被人工改过的记录。
--
-- 使用：psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f 本文件
-- =============================================================================

begin;

-- 回滚前确认：待回滚记录数
do $$
declare v_n int;
begin
  select count(*) into v_n
    from public.report_date_fix_20261019_ledger
   where applied_at is not null;
  raise notice '台账中已应用记录 % 条，开始回滚', v_n;
  if v_n = 0 then
    raise exception '没有已应用的记录可回滚';
  end if;
end $$;

-- 1) 日报：归属日与发布时间同时还原（同一语句，满足 CHECK 约束）
update public.daily_reports dr
   set published_at = l.before_report_published,
       report_date  = l.before_report_date
  from public.report_date_fix_20261019_ledger l
 where l.applied_at is not null
   and dr.id = l.report_id
   and dr.report_date = l.after_report_date
   and dr.published_at = l.after_report_published;

-- 2) 作品发布时间还原
update public.videos v
   set published_at = l.before_video_published
  from public.report_date_fix_20261019_ledger l
 where l.applied_at is not null
   and v.id = l.video_id
   and v.published_at = l.after_video_published;

-- 3) 清空 applied_at，标记为未应用
update public.report_date_fix_20261019_ledger
   set applied_at = null,
       note = coalesce(note, '') || ' [rolled back ' || to_char(now() at time zone 'Asia/Shanghai','YYYY-MM-DD HH24:MI') || ']'
 where applied_at is not null;

commit;

-- 校验：应恢复为 0 条已应用
-- select count(*) from public.report_date_fix_20261019_ledger where applied_at is not null;
