-- 修复发布履约 RPC 中的错误表名
-- 问题：20260806 的修复将 daily_reports 改为 content_items，但 content_items 表不存在
-- 只有 content_item（单数）表存在，且该表属于新架构尚未启用
-- 解决方案：改回查询 daily_reports 表，并增加 is_void 过滤

CREATE OR REPLACE FUNCTION public.get_fulfillment_range(
  p_start_date date,
  p_end_date date,
  p_visible_user_ids uuid[] DEFAULT NULL,
  p_team_id uuid DEFAULT NULL,
  p_group_id uuid DEFAULT NULL
)
RETURNS TABLE (
  user_id uuid,
  user_name text,
  team_id uuid,
  team_name text,
  group_id uuid,
  group_name text,
  record_date date,
  status text,
  reason text,
  marked_at timestamptz,
  marked_by_name text,
  published_count int,
  consecutive_missing int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  range_end date;
BEGIN
  IF NOT public.is_admin_or_owner() THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'date range is required';
  END IF;

  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'invalid date range';
  END IF;

  IF p_end_date - p_start_date > 366 THEN
    RAISE EXCEPTION 'date range too large';
  END IF;

  range_end := LEAST(p_end_date, current_date);
  IF p_start_date > range_end THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH
  eligible_members AS (
    SELECT
      p.id AS uid,
      p.name AS uname,
      p.team_id AS tid,
      t.name AS tname,
      NULL::uuid AS gid,
      NULL::text AS gname,
      p.created_at::date AS joined_date,
      p.exempt_type,
      p.exempt_start_date,
      p.exempt_end_date
    FROM public.profiles p
    LEFT JOIN public.teams t ON t.id = p.team_id
    WHERE COALESCE(p.status, 'active') = 'active'
      AND COALESCE(p.exempt_type, '') <> 'permanent'
      AND p.created_at::date <= range_end
      AND (p_visible_user_ids IS NULL OR p.id = ANY(p_visible_user_ids))
      AND (p_team_id IS NULL OR p.team_id = p_team_id)
      -- p_group_id is accepted but ignored (groups table removed)
  ),
  dates AS (
    SELECT d::date AS dt
    FROM generate_series(p_start_date, range_end, '1 day'::interval) d
  ),
  member_dates AS (
    SELECT em.uid, em.uname, em.tid, em.tname, em.gid, em.gname, em.joined_date,
           em.exempt_type, em.exempt_start_date, em.exempt_end_date,
           d.dt
    FROM eligible_members em
    CROSS JOIN dates d
    WHERE d.dt >= em.joined_date
  ),
  records AS (
    SELECT
      r.user_id AS ruid,
      r.record_date AS rdate,
      r.status AS rstatus,
      r.reason AS rreason,
      r.marked_at AS rmarked_at,
      marker.name AS rmarked_by_name
    FROM public.fulfillment_records r
    LEFT JOIN public.profiles marker ON marker.id = r.marked_by
    WHERE r.record_date BETWEEN p_start_date AND range_end
      AND (p_visible_user_ids IS NULL OR r.user_id = ANY(p_visible_user_ids))
      AND (p_team_id IS NULL OR r.team_id = p_team_id)
  ),
  -- 修复：将 content_items 改回 daily_reports，并增加 is_void 过滤
  daily_publish_counts AS (
    SELECT
      dr.user_id AS pub_uid,
      dr.report_date AS pub_date,
      count(*)::int AS pub_count
    FROM public.daily_reports dr
    WHERE dr.report_date BETWEEN p_start_date AND range_end
      AND dr.is_void = false  -- 重要：过滤掉被标记为无效的记录
      AND (p_visible_user_ids IS NULL OR dr.user_id = ANY(p_visible_user_ids))
    GROUP BY dr.user_id, dr.report_date
  ),
  combined AS (
    SELECT
      md.uid,
      md.uname,
      md.tid,
      md.tname,
      md.gid,
      md.gname,
      md.dt,
      CASE
        WHEN md.exempt_type = 'temporary'
             AND md.dt >= COALESCE(md.exempt_start_date, md.dt)
             AND md.dt <= COALESCE(md.exempt_end_date, md.dt)
        THEN 'exempted'
        WHEN r.rstatus IS NOT NULL THEN r.rstatus
        WHEN dpc.pub_count > 0 THEN 'published'
        ELSE 'unconfirmed'
      END AS final_status,
      r.rreason,
      r.rmarked_at,
      r.rmarked_by_name,
      COALESCE(dpc.pub_count, 0) AS pub_count
    FROM member_dates md
    LEFT JOIN records r ON r.ruid = md.uid AND r.rdate = md.dt
    LEFT JOIN daily_publish_counts dpc ON dpc.pub_uid = md.uid AND dpc.pub_date = md.dt
  ),
  with_streak AS (
    SELECT
      c.*,
      CASE
        WHEN c.final_status IN ('unconfirmed', 'absent') THEN
          (SELECT count(*)::int
           FROM combined c2
           WHERE c2.uid = c.uid
             AND c2.dt <= c.dt
             AND c2.dt > COALESCE(
               (SELECT max(c3.dt)
                FROM combined c3
                WHERE c3.uid = c.uid
                  AND c3.dt < c.dt
                  AND c3.final_status NOT IN ('unconfirmed', 'absent')),
               '1970-01-01'::date)
             AND c2.final_status IN ('unconfirmed', 'absent'))
        ELSE 0
      END AS streak
    FROM combined c
  )
  SELECT
    ws.uid,
    ws.uname,
    ws.tid,
    ws.tname,
    ws.gid,
    ws.gname,
    ws.dt,
    ws.final_status,
    ws.rreason,
    ws.rmarked_at,
    ws.rmarked_by_name,
    ws.pub_count,
    ws.streak
  FROM with_streak ws
  ORDER BY ws.uname, ws.dt;
END;
$$;

COMMENT ON FUNCTION public.get_fulfillment_range IS
  '发布履约日历查询（已修复：将错误的 content_items 改回 daily_reports）';

-- 保留原有权限
GRANT EXECUTE ON FUNCTION public.get_fulfillment_range(date, date, uuid[], uuid, uuid)
  TO authenticated, service_role;
