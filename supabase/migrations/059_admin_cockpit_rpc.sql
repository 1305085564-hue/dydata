-- ============================================================
-- 059: Admin cockpit work queue RPCs
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_admin_or_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'owner')
    );
$$;

CREATE OR REPLACE FUNCTION public.admin_cockpit_summary(target_date date DEFAULT current_date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pending_videos_count int;
  pending_violations_count int;
  pending_submissions_count int;
  pending_exemptions_count int;
BEGIN
  IF NOT public.is_admin_or_owner() THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT count(*)::int
  INTO pending_videos_count
  FROM public.videos v
  WHERE v.created_at::date = target_date
    AND (
      v.anomaly_status <> '正常'
      OR NOT EXISTS (
        SELECT 1
        FROM public.video_tags vt
        WHERE vt.video_id = v.id
      )
    );

  SELECT count(*)::int
  INTO pending_violations_count
  FROM public.violation_cases vc
  WHERE vc.status = 'submitted'
    AND vc.is_deleted = false;

  SELECT count(*)::int
  INTO pending_submissions_count
  FROM public.profiles p
  WHERE COALESCE(p.status, 'active') = 'active'
    AND NOT (
      COALESCE(p.exempt_type, '') = 'permanent'
      OR (
        p.exempt_type = 'temporary'
        AND p.exempt_start_date IS NOT NULL
        AND p.exempt_end_date IS NOT NULL
        AND target_date BETWEEN p.exempt_start_date AND p.exempt_end_date
      )
      OR EXISTS (
        SELECT 1
        FROM public.exemption_grant eg
        WHERE eg.user_id = p.id
          AND eg.status = 'active'
          AND eg.start_date IS NOT NULL
          AND target_date >= eg.start_date
          AND (eg.end_date IS NULL OR target_date <= eg.end_date)
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.daily_reports dr
      WHERE dr.user_id = p.id
        AND dr.report_date = target_date
    );

  SELECT count(*)::int
  INTO pending_exemptions_count
  FROM public.exemption_request er
  WHERE er.request_status = 'pending';

  RETURN jsonb_build_object(
    'pending_videos', pending_videos_count,
    'pending_violations', pending_violations_count,
    'pending_submissions', pending_submissions_count,
    'pending_exemptions', pending_exemptions_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_pending_videos_today(
  target_date date DEFAULT current_date,
  limit_rows int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  account_name text,
  report_date date,
  has_tags boolean,
  anomaly_flag boolean,
  submitted_by uuid,
  submitted_by_name text
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
  SELECT
    v.id,
    COALESCE(a.name, '未命名账号') AS account_name,
    COALESCE(dr.report_date, v.created_at::date) AS report_date,
    EXISTS (
      SELECT 1
      FROM public.video_tags vt
      WHERE vt.video_id = v.id
    ) AS has_tags,
    (v.anomaly_status <> '正常') AS anomaly_flag,
    v.user_id AS submitted_by,
    COALESCE(p.name, '未命名成员') AS submitted_by_name
  FROM public.videos v
  LEFT JOIN public.daily_reports dr ON dr.id = v.id
  LEFT JOIN public.accounts a ON a.id = v.account_id
  LEFT JOIN public.profiles p ON p.id = v.user_id
  WHERE COALESCE(dr.report_date, v.created_at::date) = target_date
    AND (
      v.anomaly_status <> '正常'
      OR NOT EXISTS (
        SELECT 1
        FROM public.video_tags vt
        WHERE vt.video_id = v.id
      )
    )
  ORDER BY
    (v.anomaly_status <> '正常') DESC,
    (NOT EXISTS (
      SELECT 1
      FROM public.video_tags vt
      WHERE vt.video_id = v.id
    )) DESC,
    v.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(limit_rows, 20), 100));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_pending_violations(limit_rows int DEFAULT 20)
RETURNS TABLE (
  id uuid,
  script_text text,
  category text,
  risk_level text,
  created_at timestamptz,
  submitted_by_name text
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
  SELECT
    vc.id,
    CASE
      WHEN char_length(vc.script_text) > 80 THEN left(vc.script_text, 80)
      ELSE vc.script_text
    END AS script_text,
    vc.category,
    vc.risk_level,
    vc.created_at,
    COALESCE(p.name, '未命名成员') AS submitted_by_name
  FROM public.violation_cases vc
  LEFT JOIN public.profiles p ON p.id = vc.submitted_by
  WHERE vc.status = 'submitted'
    AND vc.is_deleted = false
  ORDER BY
    CASE vc.risk_level
      WHEN 'high' THEN 3
      WHEN 'medium' THEN 2
      WHEN 'low' THEN 1
      ELSE 0
    END DESC,
    vc.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(limit_rows, 20), 100));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_pending_submissions_today(target_date date DEFAULT current_date)
RETURNS TABLE (
  profile_id uuid,
  name text,
  team_id uuid,
  team_name text,
  last_report_date date
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
  SELECT
    p.id AS profile_id,
    p.name,
    p.team_id,
    t.name AS team_name,
    (
      SELECT max(dr_last.report_date)
      FROM public.daily_reports dr_last
      WHERE dr_last.user_id = p.id
        AND dr_last.report_date < target_date
    ) AS last_report_date
  FROM public.profiles p
  LEFT JOIN public.teams t ON t.id = p.team_id
  WHERE COALESCE(p.status, 'active') = 'active'
    AND NOT (
      COALESCE(p.exempt_type, '') = 'permanent'
      OR (
        p.exempt_type = 'temporary'
        AND p.exempt_start_date IS NOT NULL
        AND p.exempt_end_date IS NOT NULL
        AND target_date BETWEEN p.exempt_start_date AND p.exempt_end_date
      )
      OR EXISTS (
        SELECT 1
        FROM public.exemption_grant eg
        WHERE eg.user_id = p.id
          AND eg.status = 'active'
          AND eg.start_date IS NOT NULL
          AND target_date >= eg.start_date
          AND (eg.end_date IS NULL OR target_date <= eg.end_date)
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.daily_reports dr
      WHERE dr.user_id = p.id
        AND dr.report_date = target_date
    )
  ORDER BY t.name NULLS LAST, p.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_cockpit_summary(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_pending_videos_today(date, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_pending_violations(int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_pending_submissions_today(date) TO authenticated, service_role;

-- rollback: DROP FUNCTION public.admin_pending_submissions_today(date); DROP FUNCTION public.admin_pending_violations(int); DROP FUNCTION public.admin_pending_videos_today(date, int); DROP FUNCTION public.admin_cockpit_summary(date); DROP FUNCTION public.is_admin_or_owner();
