-- 20260731193000: AI 功能总控。保留历史映射，并将无调用场景转为可审计归档。

alter table public.ai_feature_bindings
  add column if not exists lifecycle_state text not null default 'active'
  check (lifecycle_state in ('active', 'archived')),
  add column if not exists archived_at timestamptz,
  add column if not exists archived_reason text;

alter table public.ai_feature_config
  add column if not exists lifecycle_state text not null default 'active'
  check (lifecycle_state in ('active', 'archived')),
  add column if not exists archived_at timestamptz,
  add column if not exists archived_reason text;

create table if not exists public.ai_feature_config_archives (
  id uuid primary key default gen_random_uuid(),
  feature_key text not null,
  source_table text not null check (source_table in ('ai_feature_bindings', 'ai_feature_config')),
  snapshot jsonb not null,
  archived_reason text not null,
  archived_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_ai_feature_config_archives_feature_key
  on public.ai_feature_config_archives(feature_key, archived_at desc);

alter table public.ai_feature_config_archives enable row level security;

drop policy if exists "ai_feature_config_archives_owner_read" on public.ai_feature_config_archives;
drop policy if exists "ai_feature_config_archives_service_role_full" on public.ai_feature_config_archives;

create policy "ai_feature_config_archives_owner_read"
  on public.ai_feature_config_archives
  for select
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'owner'
    )
  );

create policy "ai_feature_config_archives_service_role_full"
  on public.ai_feature_config_archives
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant select on public.ai_feature_config_archives to authenticated;
grant select, insert on public.ai_feature_config_archives to service_role;

-- Snapshot first. The rows remain in their original tables so recovery preserves model mappings.
insert into public.ai_feature_config_archives (feature_key, source_table, snapshot, archived_reason)
select
  binding.feature_key,
  'ai_feature_bindings',
  to_jsonb(binding),
  '无代码调用入口，迁入 AI 功能总控归档区'
from public.ai_feature_bindings binding
where binding.feature_key in ('smart_alert', 'growth_advice', 'video_diagnose', 'admin_assistant', 'feishu_fulfillment_reminder')
  and binding.lifecycle_state <> 'archived';

insert into public.ai_feature_config_archives (feature_key, source_table, snapshot, archived_reason)
select
  config.feature_key,
  'ai_feature_config',
  to_jsonb(config),
  '无代码调用入口，迁入 AI 功能总控归档区'
from public.ai_feature_config config
where config.feature_key in ('smart_alert', 'growth_advice', 'video_diagnose', 'admin_assistant', 'feishu_fulfillment_reminder')
  and config.lifecycle_state <> 'archived';

update public.ai_feature_bindings
set
  lifecycle_state = 'archived',
  is_enabled = false,
  archived_at = coalesce(archived_at, timezone('utc'::text, now())),
  archived_reason = coalesce(archived_reason, '无代码调用入口，迁入 AI 功能总控归档区')
where feature_key in ('smart_alert', 'growth_advice', 'video_diagnose', 'admin_assistant', 'feishu_fulfillment_reminder');

update public.ai_feature_config
set
  lifecycle_state = 'archived',
  is_enabled = false,
  archived_at = coalesce(archived_at, timezone('utc'::text, now())),
  archived_reason = coalesce(archived_reason, '无代码调用入口，迁入 AI 功能总控归档区')
where feature_key in ('smart_alert', 'growth_advice', 'video_diagnose', 'admin_assistant', 'feishu_fulfillment_reminder');

comment on table public.ai_feature_config_archives is
  'AI 功能归档前的完整配置快照。归档不删除原配置，供恢复和审计使用。';

-- One transaction keeps the snapshot, binding state, and legacy state consistent.
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
    'content_tools', 'single_video', 'period_insight', 'growth_insight',
    'next_day_review', 'content_analysis', 'video_tag', 'content_segment',
    'member_ai_suggestion', 'sample_quality_check'
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
