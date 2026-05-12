-- ============================================================
-- 060: Conversion hub unified RPCs
-- ============================================================

CREATE OR REPLACE FUNCTION public.conversion_hub_pipeline_counts(week_start date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  scripts_total_count int;
  violations_pending_count int;
  weekly_queue_count int;
  advice_pending_count int;
  week_end date := week_start + 7;
BEGIN
  IF NOT public.is_admin_or_owner() THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT count(*)::int
  INTO scripts_total_count
  FROM public.violation_cases vc
  WHERE vc.purpose = 'conversion'
    AND vc.is_deleted = false;

  SELECT count(*)::int
  INTO violations_pending_count
  FROM public.violation_cases vc
  WHERE vc.status = 'submitted'
    AND vc.is_deleted = false
    AND vc.created_at >= week_start::timestamptz
    AND vc.created_at < week_end::timestamptz;

  SELECT count(*)::int
  INTO weekly_queue_count
  FROM public.violation_cases vc
  WHERE vc.purpose = 'conversion'
    AND vc.is_deleted = false
    AND vc.status <> 'archived'
    AND vc.usage_count >= 1
    AND EXISTS (
      SELECT 1
      FROM public.script_usage_records sur
      WHERE sur.case_id = vc.id
        AND sur.used_at >= week_start
        AND sur.used_at < week_end
    );

  SELECT count(*)::int
  INTO advice_pending_count
  FROM public.violation_cases vc
  WHERE vc.is_deleted = false
    AND vc.status = 'verified'
    AND NULLIF(btrim(COALESCE(vc.suggested_action, '')), '') IS NOT NULL;

  RETURN jsonb_build_object(
    'scripts_total', scripts_total_count,
    'violations_pending', violations_pending_count,
    'weekly_queue', weekly_queue_count,
    'advice_pending', advice_pending_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.conversion_hub_weekly_items(
  week_start date,
  p_bucket text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  script_text text,
  script_format text,
  bucket text,
  metrics jsonb,
  reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_bucket text := NULLIF(btrim(p_bucket), '');
  week_end date := week_start + 7;
BEGIN
  IF NOT public.is_admin_or_owner() THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF normalized_bucket IS NOT NULL
    AND normalized_bucket NOT IN ('promote', 'test', 'deprecate', 'ban')
  THEN
    RAISE EXCEPTION 'invalid bucket';
  END IF;

  RETURN QUERY
  WITH weekly_usage AS (
    SELECT
      sur.case_id,
      count(*)::int AS weekly_usage_count,
      COALESCE(sum(sur.views), 0)::bigint AS weekly_views,
      COALESCE(sum(sur.follows), 0)::int AS weekly_follows
    FROM public.script_usage_records sur
    WHERE sur.used_at >= week_start
      AND sur.used_at < week_end
    GROUP BY sur.case_id
  ),
  candidates AS (
    SELECT
      vc.id,
      vc.script_text,
      vc.script_format,
      vc.total_views,
      vc.total_follows,
      vc.usage_count,
      vc.weighted_conversion_rate,
      wu.weekly_usage_count,
      wu.weekly_views,
      wu.weekly_follows,
      CASE
        WHEN COALESCE(vc.admin_conclusion, '') ILIKE '%封%'
          OR COALESCE(vc.admin_conclusion, '') ILIKE '%禁%'
          OR COALESCE(vc.suggested_action, '') ILIKE '%封禁%'
          THEN 'ban'
        WHEN vc.usage_count >= 3
          AND vc.total_views >= 1000
          AND COALESCE(vc.weighted_conversion_rate, 0) >= 0.03
          THEN 'promote'
        WHEN vc.usage_count >= 3
          AND vc.total_views >= 1000
          AND COALESCE(vc.weighted_conversion_rate, 0) < 0.01
          THEN 'deprecate'
        ELSE 'test'
      END AS computed_bucket
    FROM public.violation_cases vc
    LEFT JOIN weekly_usage wu ON wu.case_id = vc.id
    WHERE vc.purpose = 'conversion'
      AND vc.is_deleted = false
      AND vc.status <> 'archived'
      AND (
        wu.case_id IS NOT NULL
        OR vc.created_at >= week_start::timestamptz
      )
  )
  SELECT
    c.id,
    c.script_text,
    c.script_format,
    c.computed_bucket AS bucket,
    jsonb_build_object(
      'total_views', c.total_views,
      'total_follows', c.total_follows,
      'usage_count', c.usage_count,
      'weighted_conversion_rate', c.weighted_conversion_rate,
      'weekly_usage_count', COALESCE(c.weekly_usage_count, 0),
      'weekly_views', COALESCE(c.weekly_views, 0),
      'weekly_follows', COALESCE(c.weekly_follows, 0)
    ) AS metrics,
    CASE c.computed_bucket
      WHEN 'promote' THEN '转化率和样本量达到推广阈值'
      WHEN 'deprecate' THEN '样本量已够但转化偏低'
      WHEN 'ban' THEN '复核结论或建议动作包含封禁'
      ELSE '样本仍需继续测试'
    END AS reason
  FROM candidates c
  WHERE normalized_bucket IS NULL
    OR c.computed_bucket = normalized_bucket
  ORDER BY
    CASE c.computed_bucket
      WHEN 'promote' THEN 1
      WHEN 'test' THEN 2
      WHEN 'deprecate' THEN 3
      WHEN 'ban' THEN 4
      ELSE 5
    END,
    c.weighted_conversion_rate DESC NULLS LAST,
    c.total_views DESC
  LIMIT 100;
END;
$$;

CREATE OR REPLACE FUNCTION public.conversion_hub_advice_list(limit_rows int DEFAULT 50)
RETURNS TABLE (
  id uuid,
  case_id uuid,
  script_text text,
  category text,
  risk_level text,
  admin_conclusion text,
  suggested_action text,
  reviewed_at timestamptz,
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
    vc.id AS case_id,
    vc.script_text,
    vc.category,
    vc.risk_level,
    vc.admin_conclusion,
    vc.suggested_action,
    vc.reviewed_at,
    COALESCE(p.name, '未命名成员') AS submitted_by_name
  FROM public.violation_cases vc
  LEFT JOIN public.profiles p ON p.id = vc.submitted_by
  WHERE vc.is_deleted = false
    AND vc.status = 'verified'
    AND NULLIF(btrim(COALESCE(vc.suggested_action, '')), '') IS NOT NULL
  ORDER BY vc.reviewed_at DESC NULLS LAST, vc.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(limit_rows, 50), 100));
END;
$$;

GRANT EXECUTE ON FUNCTION public.conversion_hub_pipeline_counts(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conversion_hub_weekly_items(date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conversion_hub_advice_list(int) TO authenticated, service_role;

-- rollback: DROP FUNCTION public.conversion_hub_advice_list(int); DROP FUNCTION public.conversion_hub_weekly_items(date, text); DROP FUNCTION public.conversion_hub_pipeline_counts(date);
