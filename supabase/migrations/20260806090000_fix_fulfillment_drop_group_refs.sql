-- 20260806: 修复 permission_v2 删除 profiles.group_id / groups 表后，
-- 发布履约 RPC 函数引用已删列/表导致崩溃的问题。
-- group_id 在 fulfillment_records 表中仍保留（历史数据），但不再写入新值。

-- 1. get_fulfillment_range: 移除 groups JOIN 和 group_id 筛选
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
  daily_publish_counts AS (
    SELECT
      ci.user_id AS pub_uid,
      ci.published_date AS pub_date,
      count(*)::int AS pub_count
    FROM public.content_items ci
    WHERE ci.published_date BETWEEN p_start_date AND range_end
      AND (p_visible_user_ids IS NULL OR ci.user_id = ANY(p_visible_user_ids))
    GROUP BY ci.user_id, ci.published_date
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

-- 2. mark_fulfillment_status: 不再读 profiles.group_id，fulfillment_records.group_id 写 NULL
CREATE OR REPLACE FUNCTION public.mark_fulfillment_status(
  p_user_id uuid,
  p_record_date date,
  p_status text,
  p_reason text DEFAULT NULL,
  p_marker_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  marker_id uuid;
  member_team_id uuid;
  result_id uuid;
BEGIN
  IF NOT public.is_admin_or_owner() THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF p_status NOT IN ('leave', 'waived', 'absent', 'confirmed_published') THEN
    RAISE EXCEPTION 'invalid status: %', p_status;
  END IF;

  marker_id := COALESCE(
    p_marker_id,
    CASE WHEN auth.role() = 'service_role' THEN NULL ELSE auth.uid() END
  );

  SELECT team_id INTO member_team_id
  FROM public.profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member not found';
  END IF;

  INSERT INTO public.fulfillment_records (user_id, record_date, status, reason, marked_by, team_id, group_id)
  VALUES (p_user_id, p_record_date, p_status, p_reason, marker_id, member_team_id, NULL)
  ON CONFLICT (user_id, record_date)
  DO UPDATE SET
    status = EXCLUDED.status,
    reason = EXCLUDED.reason,
    marked_by = EXCLUDED.marked_by,
    team_id = EXCLUDED.team_id,
    group_id = NULL,
    marked_at = now()
  RETURNING id INTO result_id;

  IF marker_id IS NOT NULL THEN
    INSERT INTO public.audit_logs (user_id, action, target, detail)
    VALUES (
      marker_id,
      'mark_fulfillment',
      p_user_id::text,
      jsonb_build_object(
        'record_date', p_record_date,
        'status', p_status,
        'reason', COALESCE(p_reason, '')
      )::text
    );
  END IF;

  RETURN jsonb_build_object('id', result_id, 'status', p_status);
END;
$$;

-- 3. mark_fulfillment_status_batch: 同上，group_id 写 NULL
CREATE OR REPLACE FUNCTION public.mark_fulfillment_status_batch(
  p_user_ids uuid[],
  p_record_date date,
  p_status text,
  p_reason text DEFAULT NULL,
  p_marker_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  marker_id uuid;
  affected_count int;
BEGIN
  IF NOT public.is_admin_or_owner() THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF p_user_ids IS NULL OR array_length(p_user_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'user ids are required';
  END IF;

  IF array_length(p_user_ids, 1) > 200 THEN
    RAISE EXCEPTION 'too many users';
  END IF;

  IF p_status NOT IN ('leave', 'waived', 'absent', 'confirmed_published') THEN
    RAISE EXCEPTION 'invalid status: %', p_status;
  END IF;

  marker_id := COALESCE(
    p_marker_id,
    CASE WHEN auth.role() = 'service_role' THEN NULL ELSE auth.uid() END
  );

  WITH target_members AS (
    SELECT DISTINCT p.id, p.team_id
    FROM public.profiles p
    WHERE p.id = ANY(p_user_ids)
  ),
  upserted AS (
    INSERT INTO public.fulfillment_records (user_id, record_date, status, reason, marked_by, team_id, group_id)
    SELECT id, p_record_date, p_status, p_reason, marker_id, team_id, NULL
    FROM target_members
    ON CONFLICT (user_id, record_date)
    DO UPDATE SET
      status = EXCLUDED.status,
      reason = EXCLUDED.reason,
      marked_by = EXCLUDED.marked_by,
      team_id = EXCLUDED.team_id,
      group_id = NULL,
      marked_at = now()
    RETURNING user_id
  )
  SELECT count(*)::int INTO affected_count
  FROM upserted;

  IF marker_id IS NOT NULL THEN
    INSERT INTO public.audit_logs (user_id, action, target, detail)
    VALUES (
      marker_id,
      'mark_fulfillment_batch',
      'fulfillment_records',
      jsonb_build_object(
        'record_date', p_record_date,
        'status', p_status,
        'reason', COALESCE(p_reason, ''),
        'requested_count', array_length(p_user_ids, 1),
        'affected_count', affected_count
      )::text
    );
  END IF;

  RETURN jsonb_build_object('affected_count', affected_count, 'status', p_status);
END;
$$;

-- 保留原有 GRANT（签名未变）
GRANT EXECUTE ON FUNCTION public.get_fulfillment_range(date, date, uuid[], uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_fulfillment_status(uuid, date, text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_fulfillment_status_batch(uuid[], date, text, text, uuid) TO authenticated, service_role;
