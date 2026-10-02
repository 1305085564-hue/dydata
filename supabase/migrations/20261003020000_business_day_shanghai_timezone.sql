-- 业务日收口：让"函数体内自己算今天"的对象按上海日历日判定。
--
-- 口径依据：阿禅 2026-10-03 拍板「业务日 = 上海日历日」。
-- 实测事实（本地与生产一致）：库 timezone=UTC，上海 01:52 时 `current_date` 仍是前一天；
--   `get_fulfillment_range(p_start_date => 上海今天, ...)` 因
--   `range_end := least(p_end_date, current_date)` 与 `if p_start_date > range_end then return`
--   直接返回 0 行（本地取证：整月查询 6 行，起始日=上海今天 0 行）。
--   后果：每天 00:00-08:00 发布管理「今天」无数据；每月 1 日 00:00-08:00 整页空表。
--
-- 手法与理由：用函数级 `SET timezone`，不重写函数体。
--   1) 实测函数级 SET 会让函数内的 `current_date` 与 `timestamptz::date` 都按上海求值，
--      一次覆盖两类写法（只改写 current_date 治不了后者）；
--   2) 本地与生产的同名函数定义已双向漂移（生产 admin_cockpit_summary 是转发 v2 的薄壳、
--      本地 get_leaderboard_rows 多 4 个输出列、两个豁免原子函数只在生产存在），
--      任何"整体重建函数"的迁移都会把较新一侧覆盖回去；
--   3) 本迁移幂等、不改任何业务逻辑，回滚只需把 set 换成 reset。
--
-- 用 DO 块按存在性逐函数执行：同一份文件要能在"缺对象"的本地与"全对象"的生产都跑通，
-- 直接 alter 会在缺函数的那一侧整事务回滚（本轮实测踩过）。缺失对象会 notice 出来，不静默。
--
-- 未纳入：另有 7 个函数只在**参数默认值**里用 CURRENT_DATE（admin_cockpit_summary(_v2)、
--   admin_pending_submissions_today(_v2)、admin_pending_videos_today、admin_sidebar_badges_summary、
--   get_leaderboard_rows）。实测参数默认值在调用者上下文求值，函数级 SET 影响不到；
--   应用侧调用都显式传日期（get_leaderboard_rows 传 since_date），且这 7 个在 src 非测试代码里引用为 0。
--   要收口必须重写签名（见上面的覆盖风险），故本轮不动，登记为待观察项。
--
-- 回滚：把下面 `set timezone` 改成 `reset timezone` 再执行一次即可。

do $do$
declare
  target      record;
  arg_types   text;
  wanted      text[] := array[
    'get_fulfillment_range',
    'get_fulfillment_calendar',
    'get_today_submission_status',
    'set_permanent_exemption_owner_atomically',
    'clear_permanent_exemption_owner_atomically'
  ];
  seen        text[] := '{}';
  overload    int;
  missing     text[];
begin
  for target in
    select p.oid, p.proname, p.proargtypes
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = any (wanted)
     order by p.proname
  loop
    select count(*) into overload
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = target.proname;
    if overload <> 1 then
      raise exception '函数 % 存在 % 个重载，拒绝批量设置时区', target.proname, overload;
    end if;

    select string_agg(format_type(t, null), ', ') into arg_types
      from unnest(target.proargtypes) as t;

    execute format('alter function public.%I(%s) set timezone to %L',
                   target.proname, coalesce(nullif(arg_types, ''), ''), 'Asia/Shanghai');
    seen := array_append(seen, target.proname);
    raise notice '业务日口径已设为 Asia/Shanghai: % (%)', target.proname, coalesce(nullif(arg_types, ''), '无参');
  end loop;

  missing := array(select unnest(wanted) except select unnest(seen));
  if array_length(missing, 1) > 0 then
    raise notice '本环境不存在、已跳过的函数：%s', array_to_string(missing, ', ');
  end if;
end
$do$;
