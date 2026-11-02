-- CloudBase target permissions and initial-team assignment boundaries.
-- Run after public schema objects are loaded. The batch runner owns transactions.
-- Target provisioning is responsible for default PUBLIC EXECUTE privileges; this
-- file closes the exact 31 audited SECURITY DEFINER functions without changing
-- function owners or importing source anon grants.

DO $function_acl$
DECLARE
  r record;
  v_function regprocedure;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('public.admin_analytics_first_screen(uuid[], uuid, text, text, date, date, boolean, date, date)', 'S'),
      ('public.admin_anomaly_videos_today(uuid[], date, integer)', 'S'),
      ('public.admin_content_first_screen(uuid[], text, integer, integer)', 'S'),
      ('public.admin_first_screen_perf_regressions(text, integer, integer)', 'S'),
      ('public.admin_pending_violations(integer)', 'S'),
      ('public.admin_videos_first_screen(uuid[], text, integer, integer)', 'S'),
      ('public.bump_ai_channel_failure(uuid, text)', 'S'),
      ('public.case_library_actor_scope(uuid)', 'R'),
      ('public.case_library_inbox(uuid)', 'R'),
      ('public.case_library_inbox_counts(uuid)', 'R'),
      ('public.case_library_processed(uuid)', 'R'),
      ('public.cleanup_expired_notifications()', 'S'),
      ('public.conversion_hub_advice_list(integer)', 'S'),
      ('public.conversion_hub_pipeline_counts(date)', 'S'),
      ('public.conversion_hub_weekly_items(date, text)', 'S'),
      ('public.count_remind_logs_for_user(uuid, date, integer)', 'R'),
      ('public.get_fulfillment_calendar(integer, integer, uuid[])', 'S'),
      ('public.get_fulfillment_range(date, date, uuid[], uuid, uuid)', 'S'),
      -- The scoped server route filters results using the authenticated actor's visible users.
      ('public.get_leaderboard_rows(date)', 'S'),
      ('public.get_production_dashboard(date, uuid, uuid)', 'S'),
      ('public.get_today_submission_status()', 'O'),
      ('public.has_violation_permission()', 'R'),
      ('public.manage_ai_feature_lifecycle(text, text, text)', 'R'),
      ('public.publish_draft_actor_scope(uuid)', 'R'),
      ('public.publish_drafts_approved_list(integer, uuid, text)', 'S'),
      ('public.publish_drafts_review_queue(uuid)', 'R'),
      ('public.recalculate_script_usage_aggregate(uuid)', 'O'),
      ('public.review_team_join_request(uuid, text, text)', 'R'),
      ('public.touch_rewrite_conversation_last_message()', 'O'),
      ('public.update_script_usage_aggregate()', 'O'),
      ('public.validate_invite_code(text)', 'O')
    ) AS expected(signature, access_class)
  LOOP
    v_function := to_regprocedure(r.signature);
    IF v_function IS NULL THEN
      RAISE EXCEPTION 'Required audited function is missing: %', r.signature;
    END IF;

    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role',
      v_function
    );
    EXECUTE format(
      'ALTER FUNCTION %s SET search_path TO pg_catalog, public, pg_temp',
      v_function
    );

    IF r.access_class = 'R' THEN
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role',
        v_function
      );
    ELSIF r.access_class = 'S' THEN
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION %s TO service_role',
        v_function
      );
    END IF;
    -- O keeps implicit owner access and internal trigger execution only.
  END LOOP;
END;
$function_acl$;

-- This is the only member-group assignment entry point. The authenticated
-- caller is checked from auth.uid() and trusted profile fields; p_source tags
-- are deliberately absent. work_groups has no status column in the source
-- model, so existence, company, and kind are the available target checks.
CREATE OR REPLACE FUNCTION public.reassign_member_work_group(
  p_member_id uuid,
  p_slot text,
  p_group_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := ((auth.uid())::uuid);
  v_actor public.profiles%ROWTYPE;
  v_member public.profiles%ROWTYPE;
  v_group public.work_groups%ROWTYPE;
  v_previous_group_id uuid;
  v_group_kind text;
  v_affected integer;
BEGIN
  IF v_actor_id IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  IF p_member_id IS NULL OR p_slot IS NULL OR p_slot NOT IN ('peer', 'operator') THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_assignment');
  END IF;

  SELECT p.* INTO v_actor
  FROM public.profiles AS p
  WHERE p.id = v_actor_id
  FOR SHARE;

  IF NOT FOUND
    OR v_actor.membership_status IS DISTINCT FROM 'active'
    OR v_actor.team_id IS NULL
    OR (v_actor.company_role IS DISTINCT FROM 'admin'
        AND v_actor.company_role IS DISTINCT FROM 'company_owner')
    OR public.has_permission('manage_members') IS NOT TRUE THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  IF p_member_id = v_actor_id THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  SELECT p.* INTO v_member
  FROM public.profiles AS p
  WHERE p.id = p_member_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_member.membership_status IS DISTINCT FROM 'active'
    OR v_member.team_id IS DISTINCT FROM v_actor.team_id
    OR (v_actor.company_role = 'admin'
        AND v_member.company_role IS DISTINCT FROM 'member')
    OR (v_actor.company_role = 'company_owner'
        AND v_member.company_role IS DISTINCT FROM 'member'
        AND v_member.company_role IS DISTINCT FROM 'admin') THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'member_not_assignable');
  END IF;

  IF p_slot = 'peer' THEN
    v_previous_group_id := v_member.work_peer_group_id;
  ELSE
    v_previous_group_id := v_member.work_operator_group_id;
  END IF;

  IF p_group_id IS NOT NULL THEN
    SELECT g.* INTO v_group
    FROM public.work_groups AS g
    WHERE g.id = p_group_id
    FOR SHARE;

    IF NOT FOUND OR v_group.team_id IS DISTINCT FROM v_actor.team_id THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'group_not_assignable');
    END IF;

    IF (p_slot = 'peer' AND v_group.kind NOT IN ('writer', 'talent'))
      OR (p_slot = 'operator' AND v_group.kind IS DISTINCT FROM 'operator') THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'group_kind_mismatch');
    END IF;
    v_group_kind := v_group.kind;
  END IF;

  IF v_previous_group_id IS NOT DISTINCT FROM p_group_id THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', true,
      'changed', false,
      'slot', p_slot,
      'previous_group_id', v_previous_group_id,
      'group_id', p_group_id
    );
  END IF;

  -- Transaction-local marker is accepted only while this exact SECURITY
  -- DEFINER function is current_user and the actor still matches auth.uid().
  PERFORM pg_catalog.set_config(
    'dydata.internal_work_group_assignment',
    pg_catalog.concat(
      v_actor_id::text, '|', p_member_id::text, '|', p_slot, '|',
      COALESCE(p_group_id::text, '')
    ),
    true
  );

  IF p_slot = 'peer' THEN
    UPDATE public.profiles
    SET work_peer_group_id = p_group_id
    WHERE id = p_member_id
      AND team_id = v_actor.team_id
      AND membership_status = 'active'
      AND (
        company_role = 'member'
        OR (v_actor.company_role = 'company_owner' AND company_role = 'admin')
      );
  ELSE
    UPDATE public.profiles
    SET work_operator_group_id = p_group_id
    WHERE id = p_member_id
      AND team_id = v_actor.team_id
      AND membership_status = 'active'
      AND (
        company_role = 'member'
        OR (v_actor.company_role = 'company_owner' AND company_role = 'admin')
      );
  END IF;

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  PERFORM pg_catalog.set_config('dydata.internal_work_group_assignment', '', true);
  IF v_affected <> 1 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'member_not_assignable');
  END IF;

  INSERT INTO public.audit_logs (user_id, action, target, detail)
  VALUES (
    v_actor_id,
    CASE WHEN p_group_id IS NULL THEN 'unassign_work_group' ELSE 'assign_work_group' END,
    p_member_id::text,
    pg_catalog.jsonb_build_object(
      'slot', p_slot,
      'team_id', v_actor.team_id,
      'previous_group_id', v_previous_group_id,
      'group_id', p_group_id,
      'kind', v_group_kind
    )::text
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'changed', true,
    'slot', p_slot,
    'previous_group_id', v_previous_group_id,
    'group_id', p_group_id
  );
END;
$function$;

REVOKE ALL PRIVILEGES ON FUNCTION public.reassign_member_work_group(uuid, text, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reassign_member_work_group(uuid, text, uuid)
  TO authenticated;

-- This invoker trigger blocks both slot columns from direct API updates. The
-- RPC marker is insufficient on its own: current_user must equal that RPC's
-- actual owner and the marker's actor must equal the real auth.uid(). Trusted
-- service-role maintenance may clear slots only; schema owner/migration work
-- remains possible. This leaves FK ON DELETE SET NULL and archive cleanup intact.
CREATE OR REPLACE FUNCTION public.guard_profile_work_group_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_service_role boolean;
  v_profiles_owner oid;
  v_reassign_owner oid;
  v_marker text;
  v_slot text;
  v_group_id uuid;
BEGIN
  IF NEW.work_peer_group_id IS NOT DISTINCT FROM OLD.work_peer_group_id
    AND NEW.work_operator_group_id IS NOT DISTINCT FROM OLD.work_operator_group_id THEN
    RETURN NEW;
  END IF;

  v_service_role := current_user = 'service_role' OR auth.role() = 'service_role';
  IF v_service_role THEN
    IF (NEW.work_peer_group_id IS DISTINCT FROM OLD.work_peer_group_id
        AND NEW.work_peer_group_id IS NOT NULL)
      OR (NEW.work_operator_group_id IS DISTINCT FROM OLD.work_operator_group_id
          AND NEW.work_operator_group_id IS NOT NULL) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'work-group assignment requires the authenticated member-management RPC';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.work_peer_group_id IS DISTINCT FROM OLD.work_peer_group_id
    AND NEW.work_operator_group_id IS DISTINCT FROM OLD.work_operator_group_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'only one work-group slot may change at a time';
  ELSIF NEW.work_peer_group_id IS DISTINCT FROM OLD.work_peer_group_id THEN
    v_slot := 'peer';
    v_group_id := NEW.work_peer_group_id;
  ELSE
    v_slot := 'operator';
    v_group_id := NEW.work_operator_group_id;
  END IF;

  SELECT p.proowner INTO v_reassign_owner
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'public.reassign_member_work_group(uuid, text, uuid)'::pg_catalog.regprocedure;

  v_marker := pg_catalog.current_setting('dydata.internal_work_group_assignment', true);
  IF v_reassign_owner IS NOT NULL
    AND current_user = pg_catalog.pg_get_userbyid(v_reassign_owner)
    AND auth.uid() IS NOT NULL
    AND v_marker IS NOT DISTINCT FROM pg_catalog.concat(
      ((auth.uid())::uuid)::text, '|', NEW.id::text, '|', v_slot, '|',
      COALESCE(v_group_id::text, '')
    ) THEN
    RETURN NEW;
  END IF;

  SELECT c.relowner INTO v_profiles_owner
  FROM pg_catalog.pg_class AS c
  WHERE c.oid = 'public.profiles'::pg_catalog.regclass;

  IF v_profiles_owner IS NOT NULL
    AND auth.uid() IS NULL
    AND pg_catalog.pg_has_role(current_user, v_profiles_owner, 'USAGE') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'work-group assignment is restricted to active same-company administrators';
END;
$function$;

REVOKE ALL PRIVILEGES ON FUNCTION public.guard_profile_work_group_assignment()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS guard_profile_work_group_assignment ON public.profiles;
CREATE TRIGGER guard_profile_work_group_assignment
  BEFORE UPDATE OF work_peer_group_id, work_operator_group_id
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profile_work_group_assignment();

-- A member may request an initial company assignment only while active and
-- unassigned. Existing members cannot turn this request path into team transfer.
DROP POLICY IF EXISTS "申请人仅可创建自己的 pending 申请" ON public.team_join_requests;
CREATE POLICY "申请人仅可创建自己的 pending 申请"
  ON public.team_join_requests
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    applicant_user_id = ((auth.uid())::uuid)
    AND status = 'pending'
    AND EXISTS (
      SELECT 1
      FROM public.profiles AS actor
      WHERE actor.id = ((auth.uid())::uuid)
        AND actor.membership_status = 'active'
        AND actor.team_id IS NULL
    )
  );

-- Keep the existing restrictive guard aligned with the permissive policy so
-- another permissive policy cannot grant an active member a transfer path.
DROP POLICY IF EXISTS b3_team_join_requests_insert_active ON public.team_join_requests;
CREATE POLICY b3_team_join_requests_insert_active
  ON public.team_join_requests
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    applicant_user_id = ((auth.uid())::uuid)
    AND status = 'pending'
    AND EXISTS (
      SELECT 1
      FROM public.profiles AS actor
      WHERE actor.id = ((auth.uid())::uuid)
        AND actor.membership_status = 'active'
        AND actor.team_id IS NULL
    )
  );

-- Review remains an authenticated employee RPC. Authorization comes from the
-- trusted profile and permission checks below, never from a caller-supplied tag.
CREATE OR REPLACE FUNCTION public.review_team_join_request(
  p_request_id uuid,
  p_action text,
  p_note text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_reviewer uuid := ((auth.uid())::uuid);
  v_actor public.profiles%ROWTYPE;
  v_applicant public.profiles%ROWTYPE;
  v_request public.team_join_requests%ROWTYPE;
  v_affected integer;
BEGIN
  IF v_reviewer IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  IF p_action IS NULL OR p_action NOT IN ('approve', 'reject') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_action');
  END IF;

  SELECT p.* INTO v_actor
  FROM public.profiles AS p
  WHERE p.id = v_reviewer
  FOR SHARE;

  IF NOT FOUND
    OR v_actor.membership_status IS DISTINCT FROM 'active'
    OR v_actor.team_id IS NULL
    OR (v_actor.company_role IS DISTINCT FROM 'admin'
        AND v_actor.company_role IS DISTINCT FROM 'company_owner')
    OR public.has_permission('manage_members') IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  SELECT r.* INTO v_request
  FROM public.team_join_requests AS r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_request.status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_reviewed');
  END IF;

  IF v_request.target_team_id IS DISTINCT FROM v_actor.team_id
    OR v_request.applicant_user_id = v_reviewer THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  SELECT p.* INTO v_applicant
  FROM public.profiles AS p
  WHERE p.id = v_request.applicant_user_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_applicant.membership_status IS DISTINCT FROM 'active'
    OR v_applicant.team_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'applicant_not_assignable');
  END IF;

  IF v_actor.company_role = 'admin'
    AND v_applicant.company_role IS DISTINCT FROM 'member' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  IF p_action = 'approve' THEN
    UPDATE public.profiles
    SET team_id = v_request.target_team_id
    WHERE id = v_applicant.id
      AND membership_status = 'active'
      AND team_id IS NULL;

    GET DIAGNOSTICS v_affected = ROW_COUNT;
    IF v_affected <> 1 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'applicant_not_assignable');
    END IF;

    UPDATE public.team_join_requests
    SET status = 'approved',
        reviewed_by = v_reviewer,
        reviewed_at = now(),
        review_note = p_note
    WHERE id = v_request.id
      AND status = 'pending'
      AND target_team_id = v_actor.team_id;

    GET DIAGNOSTICS v_affected = ROW_COUNT;
    IF v_affected <> 1 THEN
      RAISE EXCEPTION 'Locked team join request changed during approval';
    END IF;

    RETURN jsonb_build_object('ok', true, 'status', 'approved');
  END IF;

  UPDATE public.team_join_requests
  SET status = 'rejected',
      reviewed_by = v_reviewer,
      reviewed_at = now(),
      review_note = p_note
  WHERE id = v_request.id
    AND status = 'pending'
    AND target_team_id = v_actor.team_id;

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_reviewed');
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', 'rejected');
END;
$function$;

-- Temporary migration ledgers have no RPC entry point. RLS plus no API-role
-- grants leaves implicit owner management intact; do not FORCE RLS or hardcode
-- the source database owner. Service-role access is intentionally absent.
DO $ledger_acl$
DECLARE
  v_table regclass;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    to_regclass('public.ai_provider_priority_migration_backup_20261009'),
    to_regclass('public.appeal_backfill_20261019_ledger'),
    to_regclass('public.report_date_fix_20261019_ledger')
  ]
  LOOP
    IF v_table IS NULL THEN
      RAISE EXCEPTION 'Required temporary ledger table is missing';
    END IF;
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE %s FROM PUBLIC, anon, authenticated, service_role',
      v_table
    );
  END LOOP;
END;
$ledger_acl$;
