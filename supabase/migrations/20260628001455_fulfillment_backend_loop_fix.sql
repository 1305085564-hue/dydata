-- ============================================================
-- 发布履约后端闭环补丁：补交解锁 + 申诉机制 + 系统开关
-- ============================================================

-- 1. 日报补交后自动撤销人工缺勤标记
CREATE OR REPLACE FUNCTION public.clear_fulfillment_absent_after_daily_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.fulfillment_records
  WHERE user_id = NEW.user_id
    AND record_date = NEW.report_date
    AND status = 'absent';

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_fulfillment_absent_after_daily_report() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_daily_reports_clear_fulfillment_absent ON public.daily_reports;

CREATE TRIGGER trg_daily_reports_clear_fulfillment_absent
AFTER INSERT OR UPDATE OF user_id, report_date
ON public.daily_reports
FOR EACH ROW
EXECUTE FUNCTION public.clear_fulfillment_absent_after_daily_report();

-- 2. 员工履约申诉表
CREATE TABLE IF NOT EXISTS public.fulfillment_appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  record_date date NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  handler_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  handled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fulfillment_appeals_user_date
  ON public.fulfillment_appeals (user_id, record_date DESC);

CREATE INDEX IF NOT EXISTS idx_fulfillment_appeals_status_created
  ON public.fulfillment_appeals (status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fulfillment_appeals_pending_unique
  ON public.fulfillment_appeals (user_id, record_date)
  WHERE status = 'pending';

ALTER TABLE public.fulfillment_appeals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on fulfillment_appeals" ON public.fulfillment_appeals;
CREATE POLICY "Service role full access on fulfillment_appeals"
  ON public.fulfillment_appeals
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Appeal owner select own" ON public.fulfillment_appeals;
CREATE POLICY "Appeal owner select own"
  ON public.fulfillment_appeals
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Appeal owner insert own" ON public.fulfillment_appeals;
CREATE POLICY "Appeal owner insert own"
  ON public.fulfillment_appeals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND status = 'pending'
    AND handler_id IS NULL
    AND handled_at IS NULL
  );

DROP POLICY IF EXISTS "Admins manage fulfillment appeals" ON public.fulfillment_appeals;
CREATE POLICY "Admins manage fulfillment appeals"
  ON public.fulfillment_appeals
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_owner())
  WITH CHECK (public.is_admin_or_owner());

GRANT SELECT, INSERT, UPDATE ON public.fulfillment_appeals TO authenticated;

-- 3. 管理员审批履约申诉 RPC
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
  member_group_id uuid;
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
    SELECT team_id, group_id
    INTO member_team_id, member_group_id
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
        member_group_id
      )
      ON CONFLICT (user_id, record_date)
      DO UPDATE SET
        status = 'confirmed_published',
        reason = EXCLUDED.reason,
        marked_by = EXCLUDED.marked_by,
        team_id = EXCLUDED.team_id,
        group_id = EXCLUDED.group_id,
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

-- 4. 系统配置表 + 飞书履约提醒开关
CREATE TABLE IF NOT EXISTS public.system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT 'null'::jsonb,
  description text,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on system_settings" ON public.system_settings;
CREATE POLICY "Service role full access on system_settings"
  ON public.system_settings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins manage system settings" ON public.system_settings;
CREATE POLICY "Admins manage system settings"
  ON public.system_settings
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_owner())
  WITH CHECK (public.is_admin_or_owner());

GRANT SELECT, INSERT, UPDATE ON public.system_settings TO authenticated;

INSERT INTO public.system_settings (key, value, description)
VALUES (
  'feishu_fulfillment_reminder_enabled',
  'false'::jsonb,
  '发布履约飞书自动催交总开关'
)
ON CONFLICT (key) DO NOTHING;
