-- Supabase batch A only. Apply with the guarded transactional builder.
-- Uses existing active/fixed-role helpers; no CloudBase Auth or batch B changes.
CREATE OR REPLACE FUNCTION public.count_remind_logs_for_user(p_user_id uuid, p_target_date date, p_days integer DEFAULT 7)
 RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
begin
  if (auth.jwt() ->> 'role') is distinct from 'service_role' then
    if auth.uid() is null or p_user_id is distinct from auth.uid()
      or not exists (select 1 from public.profiles p where p.id = auth.uid() and p.membership_status = 'active') then
      raise exception using errcode = '42501', message = 'permission denied';
    end if;
  end if;
  return (select count(*)::int from public.remind_logs
    where user_id = p_user_id and target_date <= p_target_date
      and target_date > (p_target_date - (p_days || ' days')::interval));
end;
$function$;

CREATE OR REPLACE FUNCTION public.review_team_join_request(p_request_id uuid, p_action text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_reviewer uuid := auth.uid();
  v_request public.team_join_requests;
  v_affected integer;
  v_actor public.profiles%rowtype;
  v_applicant public.profiles%rowtype;
begin
  if v_reviewer is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  end if;

  if public.has_permission('manage_members') is not true then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  if p_action is null or p_action not in ('approve', 'reject') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_action');
  end if;

  select * into v_request
  from public.team_join_requests
  where id = p_request_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select * into v_actor from public.profiles where id = v_reviewer;
  if v_actor.team_id is null
    or v_request.target_team_id is distinct from v_actor.team_id
    or v_request.applicant_user_id = v_reviewer then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  select * into v_applicant from public.profiles
  where id = v_request.applicant_user_id for update;
  if not found or v_applicant.membership_status is distinct from 'active'
    or v_applicant.team_id is not null
    or coalesce(v_applicant.company_role,
        case when v_applicant.role = 'owner' then 'company_owner' else v_applicant.role end) is distinct from 'member' then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  if v_request.status <> 'pending' then
    return jsonb_build_object('ok', false, 'reason', 'already_reviewed');
  end if;

  if p_action = 'approve' then
    update public.profiles
      set team_id = v_request.target_team_id
      where id = v_request.applicant_user_id;

    update public.team_join_requests
      set status = 'approved',
          reviewed_by = v_reviewer,
          reviewed_at = now(),
          review_note = p_note
      where id = p_request_id
        and status = 'pending';

    get diagnostics v_affected = row_count;
    if v_affected = 0 then
      return jsonb_build_object('ok', false, 'reason', 'already_reviewed');
    end if;

    return jsonb_build_object('ok', true, 'status', 'approved');
  end if;

  -- reject
  update public.team_join_requests
    set status = 'rejected',
        reviewed_by = v_reviewer,
        reviewed_at = now(),
        review_note = p_note
    where id = p_request_id
      and status = 'pending';

  get diagnostics v_affected = row_count;
  if v_affected = 0 then
    return jsonb_build_object('ok', false, 'reason', 'already_reviewed');
  end if;

  return jsonb_build_object('ok', true, 'status', 'rejected');
end;
$function$;

CREATE OR REPLACE FUNCTION public.manage_ai_feature_lifecycle(p_feature_key text, p_label text, p_action text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_binding public.ai_feature_bindings%rowtype;
  v_legacy public.ai_feature_config%rowtype;
  v_binding_snapshot jsonb;
  v_legacy_snapshot jsonb;
  v_reason text := '管理员从 AI 总控停止使用';
  v_enabled boolean;
begin
  if p_action is null or p_action not in ('archive', 'restore') then
    raise exception '不支持的功能状态操作';
  end if;

  if p_feature_key is null or p_feature_key not in (
    'content_tools', 'period_insight', 'next_day_review', 'content_analysis',
    'content_segment', 'member_ai_suggestion',
    'sample_quality_check', 'ocr_screenshot', 'ocr_screenshot_structure'
  ) then
    raise exception '该功能不支持在业务总控中调整';
  end if;

  if nullif(trim(p_label), '') is null then
    raise exception '功能名称不能为空';
  end if;

  if (auth.jwt() ->> 'role') is distinct from 'service_role' and public.is_owner() is not true then
    raise exception '仅 owner 可操作 AI 渠道' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_feature_key));

  select * into v_binding
  from public.ai_feature_bindings
  where feature_key = p_feature_key
  for update;

  select * into v_legacy
  from public.ai_feature_config
  where feature_key = p_feature_key
  for update;

  if p_action = 'archive' then
    if v_binding.feature_key is not null and v_binding.lifecycle_state <> 'archived' then
      insert into public.ai_feature_config_archives (feature_key, source_table, snapshot, archived_reason)
      values (p_feature_key, 'ai_feature_bindings', to_jsonb(v_binding), v_reason);
    end if;

    if v_legacy.feature_key is not null and v_legacy.lifecycle_state <> 'archived' then
      insert into public.ai_feature_config_archives (feature_key, source_table, snapshot, archived_reason)
      values (p_feature_key, 'ai_feature_config', to_jsonb(v_legacy), v_reason);
    end if;

    insert into public.ai_feature_bindings (
      feature_key, label, is_enabled, lifecycle_state, archived_at, archived_reason
    )
    values (p_feature_key, trim(p_label), false, 'archived', timezone('utc'::text, now()), v_reason)
    on conflict (feature_key) do update set
      lifecycle_state = 'archived',
      is_enabled = false,
      archived_at = timezone('utc'::text, now()),
      archived_reason = v_reason;

    update public.ai_feature_config
    set
      lifecycle_state = 'archived',
      is_enabled = false,
      archived_at = timezone('utc'::text, now()),
      archived_reason = v_reason
    where feature_key = p_feature_key;
    return;
  end if;

  select snapshot into v_binding_snapshot
  from public.ai_feature_config_archives
  where feature_key = p_feature_key and source_table = 'ai_feature_bindings'
  order by archived_at desc, id desc
  limit 1;

  select snapshot into v_legacy_snapshot
  from public.ai_feature_config_archives
  where feature_key = p_feature_key and source_table = 'ai_feature_config'
  order by archived_at desc, id desc
  limit 1;

  v_enabled := coalesce((v_binding_snapshot ->> 'is_enabled')::boolean, true);
  update public.ai_feature_bindings
  set
    lifecycle_state = 'active',
    is_enabled = v_enabled,
    archived_at = null,
    archived_reason = null
  where feature_key = p_feature_key;

  v_enabled := coalesce((v_legacy_snapshot ->> 'is_enabled')::boolean, true);
  update public.ai_feature_config
  set
    lifecycle_state = 'active',
    is_enabled = v_enabled,
    archived_at = null,
    archived_reason = null
  where feature_key = p_feature_key;
end;
$function$;

CREATE OR REPLACE FUNCTION public.has_violation_permission()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT coalesce(public.has_permission('review_violations'), false);
$function$;
