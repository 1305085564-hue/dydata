-- ============================================================
-- 073: 案例库 inbox RPC v2
-- 修复 missing_data 引用废字段 scene_description（提交流瘦身后已删）
-- 改判规则：违规向缺截图或缺平台通知；转化向缺截图。按 purpose 分桶。
-- ============================================================

CREATE OR REPLACE FUNCTION public.case_library_inbox(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scope RECORD;
BEGIN
  SELECT *
  INTO v_scope
  FROM public.case_library_actor_scope(p_user_id);

  IF NOT COALESCE(v_scope.can_manage, false) THEN
    RETURN jsonb_build_object(
      'pending_review', '[]'::jsonb,
      'pending_review_violation', '[]'::jsonb,
      'pending_review_conversion', '[]'::jsonb,
      'missing_data', '[]'::jsonb,
      'high_risk_pending', '[]'::jsonb,
      'promotion_candidates', '[]'::jsonb
    );
  END IF;

  RETURN jsonb_build_object(
    'pending_review',
    COALESCE((
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT
          vc.id,
          vc.script_text,
          vc.purpose,
          COALESCE(p.name, '未命名成员') AS submitted_by_name,
          vc.created_at,
          vc.risk_level
        FROM public.violation_cases vc
        LEFT JOIN public.profiles p ON p.id = vc.submitted_by
        WHERE vc.is_deleted = false
          AND vc.status = 'submitted'
          AND vc.submitted_by = ANY(v_scope.visible_user_ids)
        ORDER BY vc.created_at DESC
        LIMIT 20
      ) t
    ), '[]'::jsonb),
    'pending_review_violation',
    COALESCE((
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT
          vc.id,
          vc.script_text,
          COALESCE(p.name, '未命名成员') AS submitted_by_name,
          vc.created_at,
          vc.risk_level
        FROM public.violation_cases vc
        LEFT JOIN public.profiles p ON p.id = vc.submitted_by
        WHERE vc.is_deleted = false
          AND vc.status = 'submitted'
          AND vc.purpose = 'violation'
          AND vc.submitted_by = ANY(v_scope.visible_user_ids)
        ORDER BY vc.created_at DESC
        LIMIT 20
      ) t
    ), '[]'::jsonb),
    'pending_review_conversion',
    COALESCE((
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT
          vc.id,
          vc.script_text,
          COALESCE(p.name, '未命名成员') AS submitted_by_name,
          vc.created_at
        FROM public.violation_cases vc
        LEFT JOIN public.profiles p ON p.id = vc.submitted_by
        WHERE vc.is_deleted = false
          AND vc.status = 'submitted'
          AND vc.purpose = 'conversion'
          AND vc.submitted_by = ANY(v_scope.visible_user_ids)
        ORDER BY vc.created_at DESC
        LIMIT 20
      ) t
    ), '[]'::jsonb),
    'missing_data',
    COALESCE((
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT
          vc.id,
          vc.script_text,
          vc.purpose,
          COALESCE(p.name, '未命名成员') AS submitted_by_name,
          vc.created_at,
          vc.risk_level,
          array_remove(ARRAY[
            CASE WHEN COALESCE(array_length(vc.screenshot_paths, 1), 0) = 0 THEN 'screenshot' END,
            CASE
              WHEN vc.purpose = 'violation'
                AND NOT EXISTS (
                  SELECT 1 FROM public.violation_events ve
                  WHERE ve.case_id = vc.id
                    AND ve.platform_notice IS NOT NULL
                    AND btrim(ve.platform_notice) <> ''
                )
              THEN 'platform_notice'
            END
          ], NULL) AS missing_fields
        FROM public.violation_cases vc
        LEFT JOIN public.profiles p ON p.id = vc.submitted_by
        WHERE vc.is_deleted = false
          AND vc.status = 'submitted'
          AND vc.submitted_by = ANY(v_scope.visible_user_ids)
          AND (
            COALESCE(array_length(vc.screenshot_paths, 1), 0) = 0
            OR (
              vc.purpose = 'violation'
              AND NOT EXISTS (
                SELECT 1 FROM public.violation_events ve
                WHERE ve.case_id = vc.id
                  AND ve.platform_notice IS NOT NULL
                  AND btrim(ve.platform_notice) <> ''
              )
            )
          )
        ORDER BY vc.created_at DESC
        LIMIT 20
      ) t
    ), '[]'::jsonb),
    'high_risk_pending',
    COALESCE((
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT
          vc.id,
          vc.script_text,
          COALESCE(p.name, '未命名成员') AS submitted_by_name,
          vc.created_at,
          vc.risk_level
        FROM public.violation_cases vc
        LEFT JOIN public.profiles p ON p.id = vc.submitted_by
        WHERE vc.is_deleted = false
          AND vc.status = 'submitted'
          AND vc.risk_level = 'high'
          AND vc.submitted_by = ANY(v_scope.visible_user_ids)
        ORDER BY vc.created_at DESC
        LIMIT 20
      ) t
    ), '[]'::jsonb),
    'promotion_candidates',
    COALESCE((
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT
          vc.id,
          vc.script_text,
          COALESCE(p.name, '未命名成员') AS submitted_by_name,
          vc.created_at,
          vc.total_views,
          vc.weighted_conversion_rate,
          vc.usage_count,
          vc.promotion_level
        FROM public.violation_cases vc
        LEFT JOIN public.profiles p ON p.id = vc.submitted_by
        WHERE vc.is_deleted = false
          AND vc.submitted_by = ANY(v_scope.visible_user_ids)
          AND vc.usage_count >= 5
          AND COALESCE(vc.weighted_conversion_rate, 0) >= 0.05
          AND vc.promotion_level = 'normal'
        ORDER BY vc.created_at DESC
        LIMIT 20
      ) t
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.case_library_inbox_counts(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scope RECORD;
  v_pending_review int := 0;
  v_pending_review_violation int := 0;
  v_pending_review_conversion int := 0;
  v_missing_data int := 0;
  v_high_risk_pending int := 0;
  v_promotion_candidates int := 0;
BEGIN
  SELECT *
  INTO v_scope
  FROM public.case_library_actor_scope(p_user_id);

  IF NOT COALESCE(v_scope.can_manage, false) THEN
    RETURN jsonb_build_object(
      'pending_review', 0,
      'pending_review_violation', 0,
      'pending_review_conversion', 0,
      'missing_data', 0,
      'high_risk_pending', 0,
      'promotion_candidates', 0
    );
  END IF;

  SELECT count(*)::int
  INTO v_pending_review
  FROM public.violation_cases vc
  WHERE vc.is_deleted = false
    AND vc.status = 'submitted'
    AND vc.submitted_by = ANY(v_scope.visible_user_ids);

  SELECT count(*)::int
  INTO v_pending_review_violation
  FROM public.violation_cases vc
  WHERE vc.is_deleted = false
    AND vc.status = 'submitted'
    AND vc.purpose = 'violation'
    AND vc.submitted_by = ANY(v_scope.visible_user_ids);

  SELECT count(*)::int
  INTO v_pending_review_conversion
  FROM public.violation_cases vc
  WHERE vc.is_deleted = false
    AND vc.status = 'submitted'
    AND vc.purpose = 'conversion'
    AND vc.submitted_by = ANY(v_scope.visible_user_ids);

  SELECT count(*)::int
  INTO v_missing_data
  FROM public.violation_cases vc
  WHERE vc.is_deleted = false
    AND vc.status = 'submitted'
    AND vc.submitted_by = ANY(v_scope.visible_user_ids)
    AND (
      COALESCE(array_length(vc.screenshot_paths, 1), 0) = 0
      OR (
        vc.purpose = 'violation'
        AND NOT EXISTS (
          SELECT 1 FROM public.violation_events ve
          WHERE ve.case_id = vc.id
            AND ve.platform_notice IS NOT NULL
            AND btrim(ve.platform_notice) <> ''
        )
      )
    );

  SELECT count(*)::int
  INTO v_high_risk_pending
  FROM public.violation_cases vc
  WHERE vc.is_deleted = false
    AND vc.status = 'submitted'
    AND vc.risk_level = 'high'
    AND vc.submitted_by = ANY(v_scope.visible_user_ids);

  SELECT count(*)::int
  INTO v_promotion_candidates
  FROM public.violation_cases vc
  WHERE vc.is_deleted = false
    AND vc.submitted_by = ANY(v_scope.visible_user_ids)
    AND vc.usage_count >= 5
    AND COALESCE(vc.weighted_conversion_rate, 0) >= 0.05
    AND vc.promotion_level = 'normal';

  RETURN jsonb_build_object(
    'pending_review', v_pending_review,
    'pending_review_violation', v_pending_review_violation,
    'pending_review_conversion', v_pending_review_conversion,
    'missing_data', v_missing_data,
    'high_risk_pending', v_high_risk_pending,
    'promotion_candidates', v_promotion_candidates
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.case_library_inbox(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.case_library_inbox_counts(uuid) TO authenticated;

-- rollback reference: 重新执行 072_case_library_inbox_rpc.sql 即可回到旧版
