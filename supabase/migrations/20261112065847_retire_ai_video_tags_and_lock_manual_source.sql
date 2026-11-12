-- Retire the AI-generated video-tag pipeline after the new application code is live.
-- The private archive keeps a recoverable copy while the public table remains manual-only.

begin;

create schema if not exists private;

create table if not exists private.video_tags_ai_archive_20261112
  (like public.video_tags including all);

alter table private.video_tags_ai_archive_20261112
  add column if not exists archived_at timestamptz not null default timezone('utc'::text, now()),
  add column if not exists archive_reason text not null default '日报 AI 标签功能下线';

insert into private.video_tags_ai_archive_20261112 (
  id,
  video_id,
  tag_dimension,
  tag_value,
  source,
  confidence,
  reviewed_by,
  created_at,
  reason
)
select
  id,
  video_id,
  tag_dimension,
  tag_value,
  source,
  confidence,
  reviewed_by,
  created_at,
  reason
from public.video_tags
where source = 'ai'
on conflict (id) do nothing;

do $$
declare
  active_count bigint;
  archive_count bigint;
begin
  select count(*) into active_count
  from public.video_tags
  where source = 'ai';

  select count(*) into archive_count
  from private.video_tags_ai_archive_20261112
  where source = 'ai';

  if active_count <> archive_count then
    raise exception 'AI 视频标签备份数量不一致：当前 %，备份 %', active_count, archive_count;
  end if;
end;
$$;

delete from public.video_tags
where source = 'ai';

alter table public.video_tags
  drop constraint if exists video_tags_source_check,
  drop constraint if exists video_tags_source_manual_check;

alter table public.video_tags
  alter column source set default 'manual',
  alter column source set not null,
  add constraint video_tags_source_manual_check check (source = 'manual');

delete from public.ai_feature_config_archives where feature_key = 'video_tag';
delete from public.ai_feature_config where feature_key = 'video_tag';
delete from public.ai_feature_bindings where feature_key = 'video_tag';

create or replace function public.manage_ai_feature_lifecycle(
  p_feature_key text,
  p_label text,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
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
    'content_segment', 'member_ai_suggestion', 'sample_quality_check',
    'ocr_screenshot', 'ocr_screenshot_structure'
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
$$;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;
revoke all on table private.video_tags_ai_archive_20261112 from public, anon, authenticated;
grant select on table private.video_tags_ai_archive_20261112 to service_role;

commit;
