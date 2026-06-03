-- ============================================================
-- 发布履约模块：fulfillment_records 表 + 日历查询 RPC + 标记 RPC
-- ============================================================

-- 1. 履约记录表（只记管理者的标记动作，系统判断不落库）
CREATE TABLE IF NOT EXISTS public.fulfillment_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  record_date date NOT NULL,
  status text NOT NULL CHECK (status IN (
    'leave',               -- 请假
    'waived',              -- 豁免
    'absent',              -- 缺勤
    'confirmed_published'  -- 系统漏识别，管理者确认已发
  )),
  reason text,
  marked_by uuid REFERENCES auth.users(id),
  marked_at timestamptz DEFAULT now(),
  team_id uuid REFERENCES public.teams(id),
  group_id uuid REFERENCES public.groups(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, record_date)
);

ALTER TABLE public.fulfillment_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on fulfillment_records" ON public.fulfillment_records;

CREATE POLICY "Service role full access on fulfillment_records"
  ON public.fulfillment_records
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_fulfillment_records_user_date
  ON public.fulfillment_records (user_id, record_date);

CREATE INDEX IF NOT EXISTS idx_fulfillment_records_date_user
  ON public.fulfillment_records (record_date, user_id);

-- 2. 月度履约日历 RPC
-- 返回指定月份每个应发成员每天的履约状态
CREATE OR REPLACE FUNCTION public.get_fulfillment_calendar(
  target_year int,
  target_month int,
  p_visible_user_ids uuid[] DEFAULT NULL
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
  month_start date;
  month_end date;
BEGIN
  IF NOT public.is_admin_or_owner() THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  month_start := make_date(target_year, target_month, 1);
  month_end := LEAST(
    (month_start + INTERVAL '1 month' - INTERVAL '1 day')::date,
    current_date
  );

  RETURN QUERY
  WITH
  -- 应发成员（active 且非永久豁免）
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
      AND (p_visible_user_ids IS NULL OR p.id = ANY(p_visible_user_ids))
  ),
  -- 日期序列
  dates AS (
    SELECT d::date AS dt
    FROM generate_series(month_start, month_end, '1 day'::interval) d
  ),
  -- 笛卡尔积：每人 × 每天
  member_dates AS (
    SELECT em.uid, em.uname, em.tid, em.tname, em.gid, em.gname, em.joined_date,
           em.exempt_type, em.exempt_start_date, em.exempt_end_date,
           d.dt
    FROM eligible_members em
    CROSS JOIN dates d
  ),
  -- 每人每天的日报数
  daily_counts AS (
    SELECT dr.user_id AS uid, dr.report_date AS dt, count(*)::int AS cnt
    FROM public.daily_reports dr
    WHERE dr.report_date BETWEEN month_start AND month_end
    GROUP BY dr.user_id, dr.report_date
  ),
  -- 管理者标记记录
  marks AS (
    SELECT fr.user_id AS uid, fr.record_date AS dt,
           fr.status AS mark_status, fr.reason AS mark_reason,
           mp.name AS marker_name
    FROM public.fulfillment_records fr
    LEFT JOIN public.profiles mp ON mp.id = fr.marked_by
    WHERE fr.record_date BETWEEN month_start AND month_end
  ),
  -- 豁免记录
  grants AS (
    SELECT eg.user_id AS uid, eg.start_date, eg.end_date
    FROM public.exemption_grant eg
    WHERE eg.status = 'active'
      AND eg.start_date IS NOT NULL
      AND eg.start_date <= month_end
      AND (eg.end_date IS NULL OR eg.end_date >= month_start)
  ),
  -- 计算每人每天状态
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
      COALESCE(m.marker_name, '') AS computed_marker,
      COALESCE(dc.cnt, 0) AS pub_count
    FROM member_dates md
    LEFT JOIN daily_counts dc ON dc.uid = md.uid AND dc.dt = md.dt
    LEFT JOIN marks m ON m.uid = md.uid AND m.dt = md.dt
  ),
  -- 计算连续未发天数（从今天往前数）
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
    c.computed_marker,
    c.pub_count,
    COALESCE(con.consec, 0)::int
  FROM computed c
  LEFT JOIN consecutive con ON con.uid = c.uid
  ORDER BY c.uname, c.dt;
END;
$$;

-- 3. 标记/更新履约状态 RPC
CREATE OR REPLACE FUNCTION public.mark_fulfillment_status(
  p_user_id uuid,
  p_record_date date,
  p_status text,
  p_reason text DEFAULT NULL
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

  -- 获取操作者 ID
  marker_id := CASE
    WHEN auth.role() = 'service_role' THEN NULL
    ELSE auth.uid()
  END;

  -- 获取成员的 team/group
  SELECT team_id, group_id INTO member_team_id, member_group_id
  FROM public.profiles
  WHERE id = p_user_id;

  -- upsert
  INSERT INTO public.fulfillment_records (user_id, record_date, status, reason, marked_by, team_id, group_id)
  VALUES (p_user_id, p_record_date, p_status, p_reason, marker_id, member_team_id, member_group_id)
  ON CONFLICT (user_id, record_date)
  DO UPDATE SET
    status = EXCLUDED.status,
    reason = EXCLUDED.reason,
    marked_by = EXCLUDED.marked_by,
    marked_at = now()
  RETURNING id INTO result_id;

  -- 审计日志
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

  RETURN jsonb_build_object('id', result_id, 'status', p_status);
END;
$$;

-- 4. 删除履约标记 RPC（恢复为系统自动判断）
CREATE OR REPLACE FUNCTION public.remove_fulfillment_mark(
  p_user_id uuid,
  p_record_date date
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

  marker_id := CASE
    WHEN auth.role() = 'service_role' THEN NULL
    ELSE auth.uid()
  END;

  DELETE FROM public.fulfillment_records
  WHERE user_id = p_user_id AND record_date = p_record_date;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  IF deleted_count > 0 THEN
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

GRANT EXECUTE ON FUNCTION public.get_fulfillment_calendar(int, int, uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_fulfillment_status(uuid, date, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_fulfillment_mark(uuid, date) TO authenticated, service_role;

-- rollback: DROP TABLE public.fulfillment_records; DROP FUNCTION public.get_fulfillment_calendar(int, int, uuid[]); DROP FUNCTION public.mark_fulfillment_status(uuid, date, text, text); DROP FUNCTION public.remove_fulfillment_mark(uuid, date);
