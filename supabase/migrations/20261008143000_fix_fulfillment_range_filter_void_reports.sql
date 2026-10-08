-- 修复 get_fulfillment_range RPC：排除已作废日报 (is_void = true)
-- 
-- 背景：
-- 2026-10-08 审计发现陈海潮 2026-10-02 日报标记作废 (is_void = true) 后，
-- get_fulfillment_range 仍然返回 status = 'published', published_count = 1。
-- 根因分析：
-- 1) daily_counts CTE 未过滤 dr.is_void = false，导致作废记录仍被计入发布篇数；
-- 2) last_published CTE 未过滤 dr.is_void = false，导致连续缺勤天数计算错误。
--
-- 修复方案：
-- 在 daily_counts 和 last_published 中增加 coalesce(dr.is_void, false) = false。
-- 严格保留现有签名、参数默认值、返回字段、时区 (Asia/Shanghai) 与 security definer。

CREATE OR REPLACE FUNCTION public.get_fulfillment_range(
  p_start_date date,
  p_end_date date,
  p_visible_user_ids uuid[] DEFAULT NULL::uuid[],
  p_team_id uuid DEFAULT NULL::uuid,
  p_group_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  user_id uuid,
  user_name text,
  team_id uuid,
  team_name text,
  group_id uuid,
  group_name text,
  record_date date,
  status text,
  reason text,
  marked_at timestamp with time zone,
  marked_by_name text,
  published_count integer,
  consecutive_missing integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
SET "TimeZone" TO 'Asia/Shanghai'
AS $function$
declare
  range_end date;
begin
  if not public.is_admin_or_owner() then
    raise exception 'permission denied';
  end if;

  if p_start_date is null or p_end_date is null then
    raise exception 'date range is required';
  end if;

  if p_end_date < p_start_date then
    raise exception 'invalid date range';
  end if;

  if p_end_date - p_start_date > 366 then
    raise exception 'date range too large';
  end if;

  range_end := least(p_end_date, current_date);
  if p_start_date > range_end then
    return;
  end if;

  return query
  with
  eligible_members as (
    select
      p.id as uid,
      p.name as uname,
      p.team_id as tid,
      t.name as tname,
      null::uuid as gid,
      null::text as gname,
      p.created_at::date as joined_date,
      p.exempt_type,
      p.exempt_start_date,
      p.exempt_end_date
    from public.profiles p
    left join public.teams t on t.id = p.team_id
    where coalesce(p.status, 'active') = 'active'
      and coalesce(p.exempt_type, '') <> 'permanent'
      and p.created_at::date <= range_end
      and (p_visible_user_ids is null or p.id = any(p_visible_user_ids))
      and (p_team_id is null or p.team_id = p_team_id)
      -- p_group_id retained for compatibility and intentionally ignored.
  ),
  dates as (
    select d::date as dt
    from generate_series(p_start_date, range_end, '1 day'::interval) d
  ),
  member_dates as (
    select em.uid, em.uname, em.tid, em.tname, em.gid, em.gname, em.joined_date,
           em.exempt_type, em.exempt_start_date, em.exempt_end_date,
           d.dt
    from eligible_members em
    cross join dates d
    where d.dt >= em.joined_date
  ),
  daily_counts as (
    select dr.user_id as uid, dr.report_date as dt, count(*)::int as cnt
    from public.daily_reports dr
    join eligible_members em on em.uid = dr.user_id
    where dr.report_date between p_start_date and range_end
      and coalesce(dr.is_void, false) = false
    group by dr.user_id, dr.report_date
  ),
  marks as (
    select fr.user_id as uid, fr.record_date as dt,
           fr.status as mark_status, fr.reason as mark_reason,
           fr.marked_at as mark_time, mp.name as marker_name
    from public.fulfillment_records fr
    left join public.profiles mp on mp.id = fr.marked_by
    join eligible_members em on em.uid = fr.user_id
    where fr.record_date between p_start_date and range_end
  ),
  grants as (
    select eg.user_id as uid, eg.start_date, eg.end_date
    from public.exemption_grant eg
    join eligible_members em on em.uid = eg.user_id
    where eg.status = 'active'
      and eg.start_date is not null
      and eg.start_date <= range_end
      and (eg.end_date is null or eg.end_date >= p_start_date)
  ),
  computed as (
    select
      md.uid,
      md.uname,
      md.tid,
      md.tname,
      md.gid,
      md.gname,
      md.dt,
      case
        when m.mark_status is not null then m.mark_status
        when dc.cnt > 0 then 'published'
        when (
          md.exempt_type = 'temporary'
          and md.exempt_start_date is not null
          and md.exempt_end_date is not null
          and md.dt between md.exempt_start_date and md.exempt_end_date
        ) then 'exempted'
        when exists (
          select 1 from grants gr
          where gr.uid = md.uid
            and md.dt >= gr.start_date
            and (gr.end_date is null or md.dt <= gr.end_date)
        ) then 'exempted'
        else 'unconfirmed'
      end as computed_status,
      coalesce(m.mark_reason, '') as computed_reason,
      m.mark_time as computed_marked_at,
      coalesce(m.marker_name, '') as computed_marker,
      coalesce(dc.cnt, 0) as pub_count
    from member_dates md
    left join daily_counts dc on dc.uid = md.uid and dc.dt = md.dt
    left join marks m on m.uid = md.uid and m.dt = md.dt
  ),
  last_published as (
    select
      em.uid,
      max(src.dt) as last_published_date
    from eligible_members em
    cross join lateral (
      select dr.report_date as dt
      from public.daily_reports dr
      left join public.fulfillment_records fr
        on fr.user_id = dr.user_id
       and fr.record_date = dr.report_date
      where dr.user_id = em.uid
        and dr.report_date between em.joined_date and current_date
        and coalesce(dr.is_void, false) = false
        and fr.status is null

      union

      select fr.record_date as dt
      from public.fulfillment_records fr
      where fr.user_id = em.uid
        and fr.record_date between em.joined_date and current_date
        and fr.status = 'confirmed_published'
    ) src
    group by em.uid
  ),
  consecutive as (
    select
      em.uid,
      case
        when em.joined_date > current_date then 0
        when lp.last_published_date is null then current_date - em.joined_date + 1
        else greatest(current_date - lp.last_published_date, 0)
      end as consec
    from eligible_members em
    left join last_published lp on lp.uid = em.uid
  )
  select
    c.uid,
    c.uname,
    c.tid,
    c.tname,
    c.gid,
    c.gname,
    c.dt,
    c.computed_status,
    c.computed_reason,
    c.computed_marked_at,
    c.computed_marker,
    c.pub_count,
    coalesce(con.consec, 0)::int
  from computed c
  left join consecutive con on con.uid = c.uid
  order by c.tname nulls last, c.gname nulls last, c.uname, c.dt;
end;
$function$;

grant execute on function public.get_fulfillment_range(date, date, uuid[], uuid, uuid) to authenticated, service_role;
