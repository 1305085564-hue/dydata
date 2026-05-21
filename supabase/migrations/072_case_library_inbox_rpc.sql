-- ============================================================
-- 072: 案例库管理待办 RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.case_library_actor_scope(p_user_id uuid)
RETURNS TABLE (
  can_manage boolean,
  business_role text,
  visible_user_ids uuid[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_led_group_ids uuid[] := ARRAY[]::uuid[];
  v_visible_user_ids uuid[] := ARRAY[]::uuid[];
  v_business_role text := 'member';
  v_manage_violations boolean := false;
BEGIN
  IF auth.role() <> 'service_role' AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT *
  INTO v_profile
  FROM public.profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'member'::text, ARRAY[]::uuid[];
    RETURN;
  END IF;

  SELECT COALESCE(array_agg(g.id), ARRAY[]::uuid[])
  INTO v_led_group_ids
  FROM public.groups g
  WHERE g.leader_user_id = p_user_id;

  IF v_profile.role = 'owner' THEN
    v_business_role := 'owner';
  ELSIF v_profile.role = 'admin' AND COALESCE((v_profile.permissions ->> 'manage_members')::boolean, false) = true THEN
    v_business_role := 'team_admin';
  ELSIF v_profile.role = 'admin' AND COALESCE(array_length(v_led_group_ids, 1), 0) > 0 THEN
    v_business_role := 'group_leader';
  ELSE
    v_business_role := 'member';
  END IF;

  v_manage_violations := CASE
    WHEN v_business_role = 'owner' THEN true
    WHEN v_business_role = 'team_admin' THEN COALESCE((v_profile.permissions ->> 'manage_violations')::boolean, true)
    WHEN v_business_role = 'group_leader' THEN COALESCE((v_profile.permissions ->> 'manage_violations')::boolean, false)
    ELSE COALESCE((v_profile.permissions ->> 'manage_violations')::boolean, false)
  END;

  IF NOT v_manage_violations OR v_business_role = 'member' THEN
    RETURN QUERY SELECT false, v_business_role, ARRAY[]::uuid[];
    RETURN;
  END IF;

  IF v_business_role = 'owner' THEN
    SELECT COALESCE(array_agg(p.id), ARRAY[]::uuid[])
    INTO v_visible_user_ids
    FROM public.profiles p;
  ELSIF v_business_role = 'team_admin' AND v_profile.team_id IS NOT NULL THEN
    SELECT COALESCE(array_agg(p.id), ARRAY[]::uuid[])
    INTO v_visible_user_ids
    FROM public.profiles p
    WHERE p.team_id = v_profile.team_id;
  ELSIF v_business_role = 'group_leader' THEN
    IF COALESCE(array_length(v_led_group_ids, 1), 0) > 0 THEN
      SELECT COALESCE(array_agg(p.id), ARRAY[]::uuid[])
      INTO v_visible_user_ids
      FROM public.profiles p
      WHERE p.group_id = ANY(v_led_group_ids);
    ELSIF v_profile.group_id IS NOT NULL THEN
      SELECT COALESCE(array_agg(p.id), ARRAY[]::uuid[])
      INTO v_visible_user_ids
      FROM public.profiles p
      WHERE p.group_id = v_profile.group_id;
    END IF;
  END IF;

  IF NOT (p_user_id = ANY(v_visible_user_ids)) THEN
    v_visible_user_ids := array_append(v_visible_user_ids, p_user_id);
  END IF;

  RETURN QUERY
  SELECT true, v_business_role, v_visible_user_ids;
END;
$$;

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
    'missing_data',
    COALESCE((
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT
          vc.id,
          vc.script_text,
          COALESCE(p.name, '未命名成员') AS submitted_by_name,
          vc.created_at,
          vc.risk_level,
          array_remove(ARRAY[
            CASE WHEN COALESCE(array_length(vc.screenshot_paths, 1), 0) = 0 THEN 'screenshot' END,
            CASE WHEN vc.scene_description IS NULL OR btrim(vc.scene_description) = '' THEN 'scene_description' END
          ], NULL) AS missing_fields
        FROM public.violation_cases vc
        LEFT JOIN public.profiles p ON p.id = vc.submitted_by
        WHERE vc.is_deleted = false
          AND vc.status = 'submitted'
          AND vc.submitted_by = ANY(v_scope.visible_user_ids)
          AND (
            COALESCE(array_length(vc.screenshot_paths, 1), 0) = 0
            OR vc.scene_description IS NULL
            OR btrim(vc.scene_description) = ''
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
  INTO v_missing_data
  FROM public.violation_cases vc
  WHERE vc.is_deleted = false
    AND vc.status = 'submitted'
    AND vc.submitted_by = ANY(v_scope.visible_user_ids)
    AND (
      COALESCE(array_length(vc.screenshot_paths, 1), 0) = 0
      OR vc.scene_description IS NULL
      OR btrim(vc.scene_description) = ''
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
    'missing_data', v_missing_data,
    'high_risk_pending', v_high_risk_pending,
    'promotion_candidates', v_promotion_candidates
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.case_library_inbox(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.case_library_inbox_counts(uuid) TO authenticated;

-- rollback reference:
-- DROP FUNCTION IF EXISTS public.case_library_inbox_counts(uuid);
-- DROP FUNCTION IF EXISTS public.case_library_inbox(uuid);
-- DROP FUNCTION IF EXISTS public.case_library_actor_scope(uuid);
