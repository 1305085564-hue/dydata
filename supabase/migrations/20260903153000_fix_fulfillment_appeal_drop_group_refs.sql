-- 20260903: 修复 handle_fulfillment_appeal approve 分支仍读取已删除 profiles.group_id 的问题。
-- fulfillment_records.group_id 保留历史字段，但新写入统一为 NULL。

CREATE OR REPLACE FUNCTION public.handle_fulfillment_appeal(
  p_appeal_id uuid,
  p_decision text,
  p_handler_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  appeal_record public.fulfillment_appeals%ROWTYPE;
  resolved_handler_id uuid;
  member_team_id uuid;
  has_daily_report boolean;
  resolved_status text;
BEGIN
  IF NOT public.is_admin_or_owner() THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'invalid decision: %', p_decision;
  END IF;

  resolved_handler_id := COALESCE(
    p_handler_id,
    CASE WHEN auth.role() = 'service_role' THEN NULL ELSE auth.uid() END
  );

  SELECT *
  INTO appeal_record
  FROM public.fulfillment_appeals
  WHERE id = p_appeal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'appeal not found';
  END IF;

  IF appeal_record.status <> 'pending' THEN
    RAISE EXCEPTION 'appeal already handled';
  END IF;

  IF p_decision = 'approve' THEN
    SELECT team_id
    INTO member_team_id
    FROM public.profiles
    WHERE id = appeal_record.user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'member not found';
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.daily_reports dr
      WHERE dr.user_id = appeal_record.user_id
        AND dr.report_date = appeal_record.record_date
    )
    INTO has_daily_report;

    IF has_daily_report THEN
      DELETE FROM public.fulfillment_records
      WHERE user_id = appeal_record.user_id
        AND record_date = appeal_record.record_date
        AND status = 'absent';
    ELSE
      INSERT INTO public.fulfillment_records (
        user_id,
        record_date,
        status,
        reason,
        marked_by,
        team_id,
        group_id
      )
      VALUES (
        appeal_record.user_id,
        appeal_record.record_date,
        'confirmed_published',
        LEFT('申诉通过：' || appeal_record.reason, 1000),
        resolved_handler_id,
        member_team_id,
        NULL
      )
      ON CONFLICT (user_id, record_date)
      DO UPDATE SET
        status = 'confirmed_published',
        reason = EXCLUDED.reason,
        marked_by = EXCLUDED.marked_by,
        team_id = EXCLUDED.team_id,
        group_id = NULL,
        marked_at = now();
    END IF;

    resolved_status := 'approved';
  ELSE
    resolved_status := 'rejected';
  END IF;

  UPDATE public.fulfillment_appeals
  SET
    status = resolved_status,
    handler_id = resolved_handler_id,
    handled_at = now()
  WHERE id = appeal_record.id;

  IF resolved_handler_id IS NOT NULL THEN
    INSERT INTO public.audit_logs (user_id, action, target, detail)
    VALUES (
      resolved_handler_id,
      'handle_fulfillment_appeal',
      appeal_record.user_id::text,
      jsonb_build_object(
        'appeal_id', appeal_record.id,
        'record_date', appeal_record.record_date,
        'decision', resolved_status
      )::text
    );
  END IF;

  RETURN jsonb_build_object(
    'id', appeal_record.id,
    'status', resolved_status,
    'record_date', appeal_record.record_date,
    'user_id', appeal_record.user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.handle_fulfillment_appeal(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.handle_fulfillment_appeal(uuid, text, uuid) TO authenticated, service_role;
