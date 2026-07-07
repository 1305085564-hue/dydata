-- ============================================================
-- 视频审核与产量对账：配额、作品提交、产量看板、截图私有桶
-- ============================================================

CREATE TABLE IF NOT EXISTS public.daily_quota_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  effective_date date NOT NULL UNIQUE,
  daily_target int NOT NULL CHECK (daily_target BETWEEN 1 AND 50),
  created_by uuid REFERENCES public.profiles(id),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_quota_config ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.daily_quota_config TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.daily_quota_config TO authenticated, service_role;

DROP POLICY IF EXISTS "成员读取每日产量目标" ON public.daily_quota_config;
DROP POLICY IF EXISTS "仅管理员写入每日产量目标" ON public.daily_quota_config;

CREATE POLICY "成员读取每日产量目标"
  ON public.daily_quota_config
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "仅管理员写入每日产量目标"
  ON public.daily_quota_config
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

INSERT INTO public.daily_quota_config (effective_date, daily_target, note)
VALUES
  ('2026-07-07', 4, '初始产量目标'),
  ('2026-07-14', 6, '产量目标调整')
ON CONFLICT (effective_date) DO UPDATE
SET
  daily_target = EXCLUDED.daily_target,
  note = EXCLUDED.note;

CREATE TABLE IF NOT EXISTS public.work_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id),
  group_id uuid REFERENCES public.groups(id),
  submit_date date NOT NULL DEFAULT CURRENT_DATE,
  content_text text,
  screenshot_urls text[] NOT NULL DEFAULT '{}'::text[],
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.work_submissions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_submissions TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_work_submissions_user_date
  ON public.work_submissions (user_id, submit_date);

CREATE INDEX IF NOT EXISTS idx_work_submissions_submit_date
  ON public.work_submissions (submit_date);

DROP POLICY IF EXISTS "成员读取自己的作品提交" ON public.work_submissions;
DROP POLICY IF EXISTS "成员提交自己的作品" ON public.work_submissions;
DROP POLICY IF EXISTS "成员更新自己的作品提交" ON public.work_submissions;
DROP POLICY IF EXISTS "成员删除自己的作品提交" ON public.work_submissions;

CREATE POLICY "成员读取自己的作品提交"
  ON public.work_submissions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "成员提交自己的作品"
  ON public.work_submissions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "成员更新自己的作品提交"
  ON public.work_submissions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "成员删除自己的作品提交"
  ON public.work_submissions
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "成员读取自己的豁免申请" ON public.exemption_request;
DROP POLICY IF EXISTS "成员提交自己的豁免申请" ON public.exemption_request;
DROP POLICY IF EXISTS "仅管理员审核豁免申请" ON public.exemption_request;

CREATE POLICY "成员读取自己的豁免申请"
  ON public.exemption_request
  FOR SELECT
  TO authenticated
  USING (applicant_user_id = auth.uid() OR public.is_admin());

CREATE POLICY "成员提交自己的豁免申请"
  ON public.exemption_request
  FOR INSERT
  TO authenticated
  WITH CHECK (applicant_user_id = auth.uid() OR public.is_admin());

CREATE POLICY "仅管理员审核豁免申请"
  ON public.exemption_request
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'work-screenshots',
  'work-screenshots',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "成员上传自己的作品截图" ON storage.objects;
DROP POLICY IF EXISTS "成员读取自己的作品截图或管理员读取全部" ON storage.objects;

CREATE POLICY "成员上传自己的作品截图"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'work-screenshots'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "成员读取自己的作品截图或管理员读取全部"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'work-screenshots'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
    )
  );

CREATE OR REPLACE FUNCTION public.get_daily_quota(p_date date)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT daily_target
      FROM public.daily_quota_config
      WHERE effective_date <= p_date
      ORDER BY effective_date DESC
      LIMIT 1
    ),
    4
  )::int;
$$;

CREATE OR REPLACE FUNCTION public.get_production_dashboard(
  p_date date,
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
  daily_target int,
  submitted_count int,
  gap int,
  exemption_status text,
  alert_level text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_or_owner() THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  RETURN QUERY
  WITH
  quota AS (
    SELECT public.get_daily_quota(p_date) AS target
  ),
  eligible_members AS (
    SELECT
      p.id AS uid,
      p.name AS uname,
      p.team_id AS tid,
      t.name AS tname,
      p.group_id AS gid,
      g.name AS gname
    FROM public.profiles p
    LEFT JOIN public.teams t ON t.id = p.team_id
    LEFT JOIN public.groups g ON g.id = p.group_id
    WHERE COALESCE(p.status, 'active') = 'active'
      AND COALESCE(p.exempt_type, '') <> 'permanent'
      AND (p_team_id IS NULL OR p.team_id = p_team_id)
      AND (p_group_id IS NULL OR p.group_id = p_group_id)
  ),
  submission_counts AS (
    SELECT ws.user_id AS uid, count(*)::int AS cnt
    FROM public.work_submissions ws
    WHERE ws.submit_date = p_date
    GROUP BY ws.user_id
  ),
  request_status AS (
    SELECT
      er.applicant_user_id AS uid,
      CASE
        WHEN bool_or(er.request_status = 'approved') THEN 'approved'
        WHEN bool_or(er.request_status = 'pending') THEN 'pending'
        WHEN bool_or(er.request_status = 'rejected') THEN 'rejected'
        ELSE 'none'
      END AS status
    FROM public.exemption_request er
    WHERE er.start_date <= p_date
      AND (er.end_date IS NULL OR er.end_date >= p_date)
    GROUP BY er.applicant_user_id
  ),
  fulfillment_marks AS (
    SELECT fr.user_id AS uid, bool_or(fr.status IN ('leave', 'waived')) AS is_excused
    FROM public.fulfillment_records fr
    WHERE fr.record_date = p_date
    GROUP BY fr.user_id
  ),
  computed AS (
    SELECT
      em.uid,
      em.uname,
      em.tid,
      em.tname,
      em.gid,
      em.gname,
      q.target::int AS daily_target,
      COALESCE(sc.cnt, 0)::int AS submitted_count,
      GREATEST(q.target - COALESCE(sc.cnt, 0), 0)::int AS gap,
      COALESCE(rs.status, 'none') AS exemption_status,
      COALESCE(fm.is_excused, false) AS is_excused
    FROM eligible_members em
    CROSS JOIN quota q
    LEFT JOIN submission_counts sc ON sc.uid = em.uid
    LEFT JOIN request_status rs ON rs.uid = em.uid
    LEFT JOIN fulfillment_marks fm ON fm.uid = em.uid
  )
  SELECT
    c.uid,
    c.uname,
    c.tid,
    c.tname,
    c.gid,
    c.gname,
    c.daily_target,
    c.submitted_count,
    c.gap,
    c.exemption_status,
    CASE
      WHEN c.submitted_count >= c.daily_target OR c.exemption_status = 'approved' OR c.is_excused THEN 'green'
      WHEN c.exemption_status = 'pending' THEN 'yellow'
      ELSE 'red'
    END AS alert_level
  FROM computed c
  ORDER BY
    CASE
      WHEN (c.submitted_count >= c.daily_target OR c.exemption_status = 'approved' OR c.is_excused) THEN 3
      WHEN c.exemption_status = 'pending' THEN 2
      ELSE 1
    END,
    c.tname NULLS LAST,
    c.gname NULLS LAST,
    c.uname NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_daily_quota(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_production_dashboard(date, uuid, uuid) TO authenticated, service_role;
