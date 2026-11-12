-- Restore caller checks inside the three existing SECURITY DEFINER RPCs.
-- Function ACLs are managed separately by target-permissions.sql.

CREATE OR REPLACE FUNCTION public.count_remind_logs_for_user(
  p_user_id uuid,
  p_target_date date,
  p_days integer DEFAULT 7
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF auth.role() IS DISTINCT FROM 'authenticated' THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'permission denied';
    END IF;

    BEGIN
      v_actor_id := ((auth.uid())::uuid);
    EXCEPTION
      WHEN invalid_text_representation THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'permission denied';
    END;

    IF v_actor_id IS NULL
      OR v_actor_id IS DISTINCT FROM p_user_id
      OR NOT EXISTS (
        SELECT 1
        FROM public.profiles AS actor
        WHERE actor.id = v_actor_id
          AND actor.membership_status = 'active'
      ) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'permission denied';
    END IF;
  END IF;

  RETURN (
    SELECT count(*)::int
    FROM public.remind_logs
    WHERE user_id = p_user_id
      AND target_date <= p_target_date
      AND target_date > (p_target_date - (p_days || ' days')::interval)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.has_violation_permission()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = ((auth.uid())::uuid)
      AND membership_status = 'active'
      AND (
        role = 'owner'
        OR (role = 'admin' AND (permissions->>'manage_violations')::boolean = true)
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.manage_ai_feature_lifecycle(p_feature_key text, p_label text, p_action text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $function$
declare
  v_binding public.ai_feature_bindings%rowtype;
  v_legacy public.ai_feature_config%rowtype;
  v_binding_snapshot jsonb;
  v_legacy_snapshot jsonb;
  v_reason text := '管理员从 AI 总控停止使用';
  v_enabled boolean;
begin
  IF auth.role() IS DISTINCT FROM 'service_role'
    AND (
      auth.role() IS DISTINCT FROM 'authenticated'
      OR public.is_owner() IS NOT TRUE
    ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'permission denied';
  END IF;

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

  if auth.role() is distinct from 'service_role' and not exists (
    select 1 from public.profiles where id = ((auth.uid())::uuid) and role = 'owner'
  ) then
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
