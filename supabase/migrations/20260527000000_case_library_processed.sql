-- ============================================================
-- case_library_processed: 管理闭环已处理列表
-- ============================================================

CREATE OR REPLACE FUNCTION public.case_library_processed(p_user_id uuid)
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
    RETURN jsonb_build_object('processed', '[]'::jsonb);
  END IF;

  RETURN jsonb_build_object(
    'processed',
    COALESCE((
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT
          vc.id,
          vc.script_text,
          vc.purpose,
          vc.screenshot_paths,
          COALESCE(submitter.name, '未命名成员') AS submitted_by_name,
          vc.created_at,
          vc.reviewed_at,
          reviewer.name AS reviewed_by_name,
          vc.status,
          vc.admin_conclusion,
          vc.risk_level
        FROM public.violation_cases vc
        LEFT JOIN public.profiles submitter ON submitter.id = vc.submitted_by
        LEFT JOIN public.profiles reviewer ON reviewer.id = vc.reviewed_by
        WHERE vc.is_deleted = false
          AND vc.status IN ('verified', 'rejected', 'archived')
          AND vc.submitted_by = ANY(v_scope.visible_user_ids)
        ORDER BY vc.reviewed_at DESC NULLS LAST, vc.created_at DESC
        LIMIT 50
      ) t
    ), '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.case_library_processed(uuid) TO authenticated;
