-- ============================================================
-- 发布履约工作台 V2：时间范围、团队筛选、批量标记、成员历史
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_fulfillment_records_team_date
  ON public.fulfillment_records (team_id, record_date);

CREATE INDEX IF NOT EXISTS idx_fulfillment_records_group_date
  ON public.fulfillment_records (group_id, record_date);

CREATE INDEX IF NOT EXISTS idx_fulfillment_records_marked_by_date
  ON public.fulfillment_records (marked_by, record_date);

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
      p.group_id AS gid,
      g.name AS gname,
      p.created_at::date AS joined_date,
      p.exempt_type,
      p.exempt_start_date,
      p.exempt_end_date
    FROM public.profiles p
    LEFT JOIN public.teams t ON t.id = p.team_id
    LEFT JOIN public.groups g ON g.id = p.group_id
    WHERE COALESCE(p.status, 'active') = 'active'
      AND COALESCE(p.exempt_type, '') <> 'permanent'
      AND p.created_at::date <= range_end
      AND (p_visible_user_ids IS NULL OR p.id = ANY(p_visible_user_ids))
      AND (p_team_id IS NULL OR p.team_id = p_team_id)
      AND (p_group_id IS NULL OR p.group_id = p_group_id)
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
  daily_counts AS (
    SELECT dr.user_id AS uid, dr.report_date AS dt, count(*)::int AS cnt
    FROM public.daily_reports dr
    JOIN eligible_members em ON em.uid = dr.user_id
    WHERE dr.report_date BETWEEN p_start_date AND range_end
    GROUP BY dr.user_id, dr.report_date
  ),
  marks AS (
    SELECT fr.user_id AS uid, fr.record_date AS dt,
           fr.status AS mark_status, fr.reason AS mark_reason,
           fr.marked_at AS mark_time, mp.name AS marker_name
    FROM public.fulfillment_records fr
    LEFT JOIN public.profiles mp ON mp.id = fr.marked_by
    JOIN eligible_members em ON em.uid = fr.user_id
    WHERE fr.record_date BETWEEN p_start_date AND range_end
  ),
  grants AS (
    SELECT eg.user_id AS uid, eg.start_date, eg.end_date
    FROM public.exemption_grant eg
    JOIN eligible_members em ON em.uid = eg.user_id
    WHERE eg.status = 'active'
      AND eg.start_date IS NOT NULL
      AND eg.start_date <= range_end
      AND (eg.end_date IS NULL OR eg.end_date >= p_start_date)
  ),
  computed AS (
    SELECT
      md.uid,
      md.uname,
      md.tid,
      md.tname,
      md.gid,
      md.gname,
      md.dt,
      CASE
        WHEN m.mark_status IS NOT NULL THEN m.mark_status
        WHEN dc.cnt > 0 THEN 'published'
        WHEN (
          md.exempt_type = 'temporary'
          AND md.exempt_start_date IS NOT NULL
          AND md.exempt_end_date IS NOT NULL
          AND md.dt BETWEEN md.exempt_start_date AND md.exempt_end_date
        ) THEN 'exempted'
        WHEN EXISTS (
          SELECT 1 FROM grants gr
          WHERE gr.uid = md.uid
            AND md.dt >= gr.start_date
            AND (gr.end_date IS NULL OR md.dt <= gr.end_date)
        ) THEN 'exempted'
        ELSE 'unconfirmed'
      END AS computed_status,
      COALESCE(m.mark_reason, '') AS computed_reason,
      m.mark_time AS computed_marked_at,
      COALESCE(m.marker_name, '') AS computed_marker,
      COALESCE(dc.cnt, 0) AS pub_count
    FROM member_dates md
    LEFT JOIN daily_counts dc ON dc.uid = md.uid AND dc.dt = md.dt
    LEFT JOIN marks m ON m.uid = md.uid AND m.dt = md.dt
  ),
  last_published AS (
    SELECT
      em.uid,
      max(src.dt) AS last_published_date
    FROM eligible_members em
    CROSS JOIN LATERAL (
      SELECT dr.report_date AS dt
      FROM public.daily_reports dr
      LEFT JOIN public.fulfillment_records fr
        ON fr.user_id = dr.user_id
       AND fr.record_date = dr.report_date
      WHERE dr.user_id = em.uid
        AND dr.report_date BETWEEN em.joined_date AND current_date
        AND fr.status IS NULL

      UNION

      SELECT fr.record_date AS dt
      FROM public.fulfillment_records fr
      WHERE fr.user_id = em.uid
        AND fr.record_date BETWEEN em.joined_date AND current_date
        AND fr.status = 'confirmed_published'
    ) src
    GROUP BY em.uid
  ),
  consecutive AS (
    SELECT
      em.uid,
      CASE
        WHEN em.joined_date > current_date THEN 0
        WHEN lp.last_published_date IS NULL THEN current_date - em.joined_date + 1
        ELSE GREATEST(current_date - lp.last_published_date, 0)
      END AS consec
    FROM eligible_members em
    LEFT JOIN last_published lp ON lp.uid = em.uid
  )
  SELECT
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
    COALESCE(con.consec, 0)::int
  FROM computed c
  LEFT JOIN consecutive con ON con.uid = c.uid
  ORDER BY c.tname NULLS LAST, c.gname NULLS LAST, c.uname, c.dt;
END;
$$;

DROP FUNCTION IF EXISTS public.mark_fulfillment_status(uuid, date, text, text);

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
  member_group_id uuid;
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

  SELECT team_id, group_id INTO member_team_id, member_group_id
  FROM public.profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member not found';
  END IF;

  INSERT INTO public.fulfillment_records (user_id, record_date, status, reason, marked_by, team_id, group_id)
  VALUES (p_user_id, p_record_date, p_status, p_reason, marker_id, member_team_id, member_group_id)
  ON CONFLICT (user_id, record_date)
  DO UPDATE SET
    status = EXCLUDED.status,
    reason = EXCLUDED.reason,
    marked_by = EXCLUDED.marked_by,
    team_id = EXCLUDED.team_id,
    group_id = EXCLUDED.group_id,
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

DROP FUNCTION IF EXISTS public.remove_fulfillment_mark(uuid, date);

CREATE OR REPLACE FUNCTION public.remove_fulfillment_mark(
  p_user_id uuid,
  p_record_date date,
  p_marker_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  marker_id uuid;
  deleted_count int;
BEGIN
  IF NOT public.is_admin_or_owner() THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  marker_id := COALESCE(
    p_marker_id,
    CASE WHEN auth.role() = 'service_role' THEN NULL ELSE auth.uid() END
  );

  DELETE FROM public.fulfillment_records
  WHERE user_id = p_user_id AND record_date = p_record_date;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  IF deleted_count > 0 AND marker_id IS NOT NULL THEN
    INSERT INTO public.audit_logs (user_id, action, target, detail)
    VALUES (
      marker_id,
      'remove_fulfillment_mark',
      p_user_id::text,
      jsonb_build_object('record_date', p_record_date)::text
    );
  END IF;

  RETURN jsonb_build_object('deleted', deleted_count > 0);
END;
$$;

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
    SELECT DISTINCT p.id, p.team_id, p.group_id
    FROM public.profiles p
    WHERE p.id = ANY(p_user_ids)
  ),
  upserted AS (
    INSERT INTO public.fulfillment_records (user_id, record_date, status, reason, marked_by, team_id, group_id)
    SELECT id, p_record_date, p_status, p_reason, marker_id, team_id, group_id
    FROM target_members
    ON CONFLICT (user_id, record_date)
    DO UPDATE SET
      status = EXCLUDED.status,
      reason = EXCLUDED.reason,
      marked_by = EXCLUDED.marked_by,
      team_id = EXCLUDED.team_id,
      group_id = EXCLUDED.group_id,
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

GRANT EXECUTE ON FUNCTION public.get_fulfillment_range(date, date, uuid[], uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_fulfillment_status(uuid, date, text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_fulfillment_mark(uuid, date, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_fulfillment_status_batch(uuid[], date, text, text, uuid) TO authenticated, service_role;
