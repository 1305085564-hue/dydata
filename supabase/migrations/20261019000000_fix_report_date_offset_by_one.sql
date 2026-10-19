-- =============================================================================
-- 20261019000000_fix_report_date_offset_by_one.sql
-- 历史数据归位修正：修复「默认发布时间 = 选择日期前一天 19:00」造成的归档前一天
--
-- 背景
--   2026-09-03 起前端默认发布时间为「用户选择日期 - 1 天 19:00」。
--   2026-10-13 12:00 后端改为优先用 published_at 归档，14:50 又批量把
--   report_date 对齐到 published_at 的上海日期。
--   结果：用户选了 A 日、默认值给了 A-1 日 19:00 的记录，整体被记到 A-1 日。
--   2026-10-19 前端改为「选择哪天就默认哪天 19:00」，本次修历史数据。
--
-- 重要口径（实测）
--   1. daily_reports.report_date 与 daily_reports.published_at 恒等（上海日期）：
--      20261013150000 加的 CHECK 约束 report_date_must_match_published_at 保证。
--      所以「report_date 比 published_at 早一天」的记录在库里不存在，
--      只改 report_date 的 UPDATE 会是 0 行命中。
--   2. 履约日历 / 排行榜 / 话题池取的是 videos.published_at（没有才回退 report_date），
--      见 20261015052202_unify_fulfillment_date_and_exemptions.sql 第 96/106/166 行。
--      只改 report_date 不会让记录在日历上换一天。
--   3. 因此真正归位必须三处同步 +1 天：videos.published_at、
--      daily_reports.published_at、daily_reports.report_date。
--
-- 安全设计
--   * 不按条件批量改，只按台账里确认过的 id 改；
--   * v_apply 默认 false：直接执行只会建台账、打印候选清单，不动数据；
--   * 每行带 before 值做幂等保护，重复执行不会二次偏移；
--   * 台账记录 before/after，可整表回滚（见文件末尾回滚段）。
--
-- 执行状态（2026-10-19 16:49:43 上海，已执行完毕）
--   * 本文件曾以 v_apply = false 执行过一次：建台账、13 条候选入库、6 apply / 7 skip；
--   * 实际修正由 output/report-date-fix-20261019/apply.sql 单独完成（6 条，三处同步 +1 天）；
--   * 台账 applied_at 与 after_* 已落库，作为修正凭证；
--   * v_apply 保持 false：本文件重跑只会 upsert 台账，不会二次偏移。
--     若确需重跑修正，改为 true，但前提是台账 before 值与库中当前值仍匹配。
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. 台账表（长期保留，作为修正凭证）
-- ---------------------------------------------------------------------------
create table if not exists public.report_date_fix_20261019_ledger (
  report_id                 uuid primary key,
  user_id                   uuid,
  user_name                 text,
  video_id                  uuid,
  before_report_date        date,
  before_report_published   timestamptz,
  before_video_published    timestamptz,
  after_report_date         date,
  after_report_published    timestamptz,
  after_video_published     timestamptz,
  decision                  text not null default 'pending',  -- pending / apply / skip
  applied_at                timestamptz,
  note                      text
);

comment on table public.report_date_fix_20261019_ledger is
  '2026-10-19 归档偏移一天修正台账：记录每条受影响的 report_date / published_at 修正前后值，用于验证与回滚';

-- ---------------------------------------------------------------------------
-- 2. 候选清单（上传日 2026-10-13 ~ 2026-10-19，发布时间恰为上海 19:00:00，
--    且上传日晚于归档案日期 —— 只有「沿用默认值」才会精确落在 19:00:00）
--    注意：19:00 也是部分用户补录时的固定习惯，故不自动 apply，需人工确认。
-- ---------------------------------------------------------------------------
insert into public.report_date_fix_20261019_ledger (
  report_id, user_id, user_name, video_id,
  before_report_date, before_report_published, before_video_published
)
select
  dr.id,
  dr.user_id,
  p.name,
  dr.video_id,
  dr.report_date,
  dr.published_at,
  v.published_at
from public.daily_reports dr
join public.videos v on v.id = dr.video_id
left join public.profiles p on p.id = dr.user_id
where dr.uploaded_at >= '2026-10-13T00:00:00Z'
  and dr.uploaded_at <  '2026-10-19T16:00:00Z'   -- 上海时间 2026-10-20 00:00
  and dr.published_at is not null
  and (dr.published_at at time zone 'Asia/Shanghai')::time = time '19:00:00'
  and (dr.uploaded_at at time zone 'Asia/Shanghai')::date > dr.report_date
on conflict (report_id) do nothing;

-- 修正后目标值：统一 +1 天（保持 19:00 不变）
update public.report_date_fix_20261019_ledger
set after_report_date      = before_report_date + 1,
    after_report_published = ((before_report_published at time zone 'Asia/Shanghai') + interval '1 day') at time zone 'Asia/Shanghai',
    after_video_published  = case when before_video_published is null then null
                             else ((before_video_published at time zone 'Asia/Shanghai') + interval '1 day') at time zone 'Asia/Shanghai' end
where after_report_date is null;

-- ---------------------------------------------------------------------------
-- 2.5 逐个判定（依据：该账号前后每日的发布序列、标题自带的日期、播放量）
--     判据：往后挪一天后，这个账号的日更序列是否更连续、且不与已有记录撞车。
-- ---------------------------------------------------------------------------

-- 【apply】周文杰：10-19 11:07~11:19 十五分钟内录了 6 条，全部精确 19:00:00。
--   同一批补录里另外 11 个人填的都是真实时刻（17:42/18:53/20:12…），只有他把整批默认值原样提交，
--   且 +1 天后 10-07/10-08/10-18/10-19 各归各位，不产生空档。
update public.report_date_fix_20261019_ledger
set decision = 'apply',
    note = '周文杰 10-19 批量补录、整批 19:00 默认值；+1 天补齐 10-07/10-08/10-18/10-19'
where report_id in (
  '6aeca34b-18ef-4207-9a56-9e281f8377f0',  -- 10-06 会炒股的人…   → 10-07
  'cbd02947-9de9-46bc-8418-900f8a04c2ee',  -- 10-07 000           → 10-08
  '68d5be5f-999b-4aad-9586-47bd53fc57d7',  -- 10-17 被套了怎么办？ → 10-18
  'bede205e-6f63-4fd9-a826-9d5b5e3371ac',  -- 10-17 被套了怎么办? → 10-18
  '39271abd-26ec-4846-987a-0cbec44bdd54',  -- 10-17 被套了怎么办？ → 10-18
  '3d2c0356-895f-4535-b642-109dbf202d24'   -- 10-18 1             → 10-19
);

-- 【skip】以下 7 条日期本来就是对的，不动
update public.report_date_fix_20261019_ledger
set decision = 'skip',
    note = case report_id
      when '1f15fb80-6698-43c0-82f1-6c858ab61abe' then '雷洋 09-19：09-15~09-20 每天一条无缝，+1 会与 09-20 撞车且 09-19 空档'
      when 'aa3b3582-28d7-42e6-baf8-bb5964f58281' then '罗礼杰 10-16：标题自带 10.16，标题与归案日历来 1:1 吻合，+1 会与 10-17 撞车'
      when 'a8776da2-95e1-497e-b882-87e7489ab03b' then '王艺博 10-09：当天已有 2 条真实记录（16400/18200 播放），本条 0 播放占位'
      when '6cdfab71-0e06-4f03-9186-6e18266d99c1' then '王艺博 10-15：当天已有 2 条 10.15 记录，10-16 也有 2 条，+1 无处可放'
      when 'fa64890d-85e4-48cb-808a-3f14f0aa0e71' then '张皓宇 10-07：与同日另一条同标题、同播放量 903/16 赞，是同一作品重复提交，非日期错'
      when 'd59b8da7-a006-42cb-80d1-32a8ce7cdd94' then '张皓宇 10-18：11300 播放说明 10-18 确实发了，+1 反而在 10-18 制造空档'
      when '9a099e0e-d2bd-4f10-bf1b-9a8f4ef48b41' then '测试组长：测试账号'
      else '未分类'
    end
where report_id in (
  '1f15fb80-6698-43c0-82f1-6c858ab61abe',
  'aa3b3582-28d7-42e6-baf8-bb5964f58281',
  'a8776da2-95e1-497e-b882-87e7489ab03b',
  '6cdfab71-0e06-4f03-9186-6e18266d99c1',
  'fa64890d-85e4-48cb-808a-3f14f0aa0e71',
  'd59b8da7-a006-42cb-80d1-32a8ce7cdd94',
  '9a099e0e-d2bd-4f10-bf1b-9a8f4ef48b41'
);

-- 防御：台账里只要还有未判定的记录，就不允许往下走
do $$
begin
  if exists (select 1 from public.report_date_fix_20261019_ledger where decision = 'pending') then
    raise exception '台账仍有未判定（pending）记录，先逐条确认后再执行';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. 执行（v_apply = false 时只打印，不改数据）
-- ---------------------------------------------------------------------------
do $$
declare
  v_apply   boolean := false;   -- ← 核对完成后改成 true
  v_total   int;
  v_apply_n int;
  v_ok      int;
begin
  select count(*) into v_total from public.report_date_fix_20261019_ledger;
  select count(*) into v_apply_n from public.report_date_fix_20261019_ledger where decision = 'apply';
  raise notice '台账候选 % 条，本次将执行 % 条，v_apply=%', v_total, v_apply_n, v_apply;

  if not v_apply then
    raise notice '只建台账未改数据。复核 candidates.csv 后把 v_apply 改为 true 重跑。';
    return;
  end if;

  -- 3.1 作品发布时间 +1 天（履约日历按这个日期归属）
  update public.videos v
  set published_at = ((l.before_video_published at time zone 'Asia/Shanghai') + interval '1 day') at time zone 'Asia/Shanghai'
  from public.report_date_fix_20261019_ledger l
  where l.decision = 'apply'
    and v.id = l.video_id
    and v.published_at = l.before_video_published;   -- 幂等：已改过的不再动

  -- 3.2 日报发布时间 + 归属日 +1 天（同一语句同时改，满足 CHECK 约束）
  update public.daily_reports dr
  set published_at = ((l.before_report_published at time zone 'Asia/Shanghai') + interval '1 day') at time zone 'Asia/Shanghai',
      report_date  = l.before_report_date + 1
  from public.report_date_fix_20261019_ledger l
  where l.decision = 'apply'
    and dr.id = l.report_id
    and dr.report_date = l.before_report_date
    and dr.published_at = l.before_report_published;  -- 幂等：已改过的不再动

  update public.report_date_fix_20261019_ledger
  set applied_at = now()
  where decision = 'apply' and applied_at is null;

  -- 3.3 结果自检
  select count(*) into v_ok
  from public.report_date_fix_20261019_ledger l
  join public.daily_reports dr on dr.id = l.report_id
  where l.applied_at is not null
    and dr.report_date = l.after_report_date
    and dr.published_at = l.after_report_published;
  raise notice '已修正 % 条，校验通过 % 条', v_apply_n, v_ok;
end $$;

commit;

-- =============================================================================
-- 4. 验证（执行后跑这三个查询）
-- =============================================================================
-- 4.1 不变量：全库不应再有 report_date 与 published_at 上海日期不一致的记录
-- select count(*) from public.daily_reports
--  where published_at is not null
--    and report_date <> (published_at at time zone 'Asia/Shanghai')::date;

-- 4.2 本批修正明细（台账 before -> after）
-- select user_name, before_report_date, after_report_date,
--        before_report_published at time zone 'Asia/Shanghai' as before_pub,
--        after_report_published  at time zone 'Asia/Shanghai' as after_pub,
--        applied_at
--   from public.report_date_fix_20261019_ledger
--  order by applied_at nulls last, before_report_date;

-- 4.3 履约日历抽查（user = 周文杰，日期 2026-10-16 ~ 2026-10-20）
-- select * from public.get_fulfillment_range('2026-10-16','2026-10-20',null,null,null)
--  where user_name in ('周文杰','罗礼杰','张皓宇');

-- =============================================================================
-- 5. 回滚（把台账里已应用的记录还原成 before 值，需在事务里执行）
-- =============================================================================
-- begin;
--   update public.videos v
--      set published_at = l.before_video_published
--     from public.report_date_fix_20261019_ledger l
--    where l.applied_at is not null
--      and v.id = l.video_id
--      and v.published_at = l.after_video_published;
--
--   update public.daily_reports dr
--      set published_at = l.before_report_published,
--          report_date  = l.before_report_date
--     from public.report_date_fix_20261019_ledger l
--    where l.applied_at is not null
--      and dr.id = l.report_id
--      and dr.report_date = l.after_report_date
--      and dr.published_at = l.after_report_published;
--
--   update public.report_date_fix_20261019_ledger
--      set applied_at = null
--    where applied_at is not null;
-- commit;
-- =============================================================================
