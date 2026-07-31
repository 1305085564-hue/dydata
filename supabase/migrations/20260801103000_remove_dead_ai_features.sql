-- Remove confirmed dead AI routes and configs. Current business features with similar names are unaffected.

begin;

delete from public.ai_insight_result
where prompt_version in ('single-video-v1', 'growth-insight-v2');

delete from public.ai_feature_config_archives
where feature_key in (
  'single_video', 'growth_insight', 'report_insight', 'ai_insight',
  'smart_alert', 'growth_advice', 'video_diagnose', 'admin_assistant',
  'feishu_fulfillment_reminder'
);

delete from public.ai_feature_config
where feature_key in (
  'single_video', 'growth_insight', 'report_insight', 'ai_insight',
  'smart_alert', 'growth_advice', 'video_diagnose', 'admin_assistant',
  'feishu_fulfillment_reminder'
);

delete from public.ai_feature_bindings
where feature_key in (
  'single_video', 'growth_insight', 'report_insight', 'ai_insight',
  'smart_alert', 'growth_advice', 'video_diagnose', 'admin_assistant',
  'feishu_fulfillment_reminder'
);

create or replace function public.manage_ai_feature_lifecycle(
  p_feature_key text,
  p_label text,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
    'video_tag', 'content_segment', 'member_ai_suggestion',
    'sample_quality_check', 'ocr_screenshot'
  ) then
    raise exception '该功能不支持在业务总控中调整';
  end if;

  if nullif(trim(p_label), '') is null then
    raise exception '功能名称不能为空';
  end if;

  if auth.role() is distinct from 'service_role' and not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'owner'
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
$$;

revoke all on function public.manage_ai_feature_lifecycle(text, text, text) from public;
grant execute on function public.manage_ai_feature_lifecycle(text, text, text) to authenticated, service_role;

commit;
