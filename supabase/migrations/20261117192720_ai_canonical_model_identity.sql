begin;

create or replace function public.canonical_ai_model_id(p_model_id text)
returns text
language sql
immutable
strict
set search_path = public
as $$
  select regexp_replace(trim(p_model_id), '^.*/', '');
$$;

alter table public.ai_provider_key_models
  add column if not exists canonical_model_id text;

update public.ai_provider_key_models
set canonical_model_id = public.canonical_ai_model_id(model_id)
where canonical_model_id is null;

do $$
declare
  duplicate_group record;
  survivor_id uuid;
  merge_state record;
  latest_failure record;
  chosen_display_name text;
  moved_bindings jsonb;
  moved_routes jsonb;
  moved_runs jsonb;
begin
  create table if not exists public.ai_provider_key_model_merge_audit (
    id uuid primary key default gen_random_uuid(),
    key_id uuid not null references public.ai_provider_keys(id) on delete cascade,
    canonical_model_id text not null,
    survivor_id uuid not null,
    discarded_ids uuid[] not null,
    survivor_model_id text not null,
    discarded_model_ids text[] not null,
    original_rows jsonb not null,
    decision text not null,
    transferred_references jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  );

  for duplicate_group in
    select key_id, canonical_model_id
    from public.ai_provider_key_models
    group by key_id, canonical_model_id
    having count(*) > 1
  loop
    select m.id into survivor_id
    from public.ai_provider_key_models m
    where m.key_id = duplicate_group.key_id
      and m.canonical_model_id = duplicate_group.canonical_model_id
    order by (position('/' in m.model_id) > 0), m.sort_order, m.created_at, m.id
    limit 1;

    select
      bool_or(m.is_enabled) as any_enabled,
      bool_or(m.disabled_by_model) as any_disabled_by_model,
      max(coalesce(m.consecutive_failures, 0)) as max_failures,
      min(m.first_failure_at) filter (where m.first_failure_at is not null) as first_failure_at,
      max(m.last_failure_at) as last_failure_at,
      max(m.last_success_at) as last_success_at,
      max(m.unhealthy_until) as unhealthy_until,
      max(m.invalidated_at) as invalidated_at
    into merge_state
    from public.ai_provider_key_models m
    where m.key_id = duplicate_group.key_id
      and m.canonical_model_id = duplicate_group.canonical_model_id;

    select m.last_error_message, m.last_failure_scope, m.last_failure_kind
    into latest_failure
    from public.ai_provider_key_models m
    where m.key_id = duplicate_group.key_id
      and m.canonical_model_id = duplicate_group.canonical_model_id
      and m.last_failure_at is not null
    order by m.last_failure_at desc, m.id desc
    limit 1;

    select m.display_name into chosen_display_name
    from public.ai_provider_key_models m
    where m.key_id = duplicate_group.key_id
      and m.canonical_model_id = duplicate_group.canonical_model_id
      and nullif(trim(m.display_name), '') is not null
    order by
      (trim(m.display_name) = trim(m.model_id)),
      (position('/' in m.model_id) > 0),
      m.sort_order,
      m.id
    limit 1;

    -- 所有引用被删行的外键先转移到保留行，再删除；转移的行号记入审计表。
    with moved as (
      update public.ai_feature_bindings b
      set provider_key_model_id = survivor_id
      where b.provider_key_model_id in (
        select m.id from public.ai_provider_key_models m
        where m.key_id = duplicate_group.key_id
          and m.canonical_model_id = duplicate_group.canonical_model_id
          and m.id <> survivor_id
      )
      returning b.id
    )
    select coalesce(jsonb_agg(id order by id), '[]'::jsonb) into moved_bindings from moved;

    with moved as (
      update public.rewrite_model_routes r
      set provider_key_model_id = survivor_id
      where r.provider_key_model_id in (
        select m.id from public.ai_provider_key_models m
        where m.key_id = duplicate_group.key_id
          and m.canonical_model_id = duplicate_group.canonical_model_id
          and m.id <> survivor_id
      )
      returning r.id
    )
    select coalesce(jsonb_agg(id order by id), '[]'::jsonb) into moved_routes from moved;

    with moved as (
      update public.rewrite_generation_runs g
      set provider_key_model_id = survivor_id
      where g.provider_key_model_id in (
        select m.id from public.ai_provider_key_models m
        where m.key_id = duplicate_group.key_id
          and m.canonical_model_id = duplicate_group.canonical_model_id
          and m.id <> survivor_id
      )
      returning g.id
    )
    select coalesce(jsonb_agg(id order by id), '[]'::jsonb) into moved_runs from moved;

    insert into public.ai_provider_key_model_merge_audit (
      key_id, canonical_model_id, survivor_id, discarded_ids,
      survivor_model_id, discarded_model_ids, original_rows, decision, transferred_references
    )
    select
      duplicate_group.key_id,
      duplicate_group.canonical_model_id,
      survivor_id,
      array_agg(m.id order by m.id) filter (where m.id <> survivor_id),
      max(m.model_id) filter (where m.id = survivor_id),
      array_agg(m.model_id order by m.id) filter (where m.id <> survivor_id),
      jsonb_agg(to_jsonb(m) order by m.id),
      'same key and canonical model: keep unprefixed upstream model id when available',
      jsonb_build_object(
        'ai_feature_bindings', moved_bindings,
        'rewrite_model_routes', moved_routes,
        'rewrite_generation_runs', moved_runs
      )
    from public.ai_provider_key_models m
    where m.key_id = duplicate_group.key_id
      and m.canonical_model_id = duplicate_group.canonical_model_id;

    -- 成功时间单独先写：它会触发"成功后清空失败窗口"的触发器，
    -- 清空只作用在保留行上，随后第二条语句再写入合并后的失败状态，不被触发器抹掉。
    update public.ai_provider_key_models survivor
    set last_success_at = merge_state.last_success_at
    where survivor.id = survivor_id;

    update public.ai_provider_key_models survivor
    set display_name = coalesce(chosen_display_name, duplicate_group.canonical_model_id),
        is_enabled = case when merge_state.any_disabled_by_model then false else merge_state.any_enabled end,
        disabled_by_model = coalesce(merge_state.any_disabled_by_model, false),
        consecutive_failures = merge_state.max_failures,
        first_failure_at = merge_state.first_failure_at,
        last_failure_at = merge_state.last_failure_at,
        unhealthy_until = merge_state.unhealthy_until,
        invalidated_at = merge_state.invalidated_at,
        last_error_message = latest_failure.last_error_message,
        last_failure_scope = latest_failure.last_failure_scope,
        last_failure_kind = latest_failure.last_failure_kind,
        recovery_token = null,
        recovery_until = null
    where survivor.id = survivor_id;

    delete from public.ai_provider_key_models m
    where m.key_id = duplicate_group.key_id
      and m.canonical_model_id = duplicate_group.canonical_model_id
      and m.id <> survivor_id;
  end loop;
end $$;

alter table public.ai_provider_key_models
  drop constraint if exists ai_provider_key_models_key_id_model_id_key,
  drop constraint if exists ai_provider_key_models_model_order_unique;

create temp table _ai_canonical_model_order on commit drop as
select m.id,
  row_number() over (
    partition by m.canonical_model_id
    order by m.sort_order, k.priority, p.priority, k.id, m.id
  )::integer as next_sort_order
from public.ai_provider_key_models m
join public.ai_provider_keys k on k.id = m.key_id
join public.ai_providers p on p.id = k.provider_id;

update public.ai_provider_key_models m
set sort_order = o.next_sort_order
from _ai_canonical_model_order o
where o.id = m.id;

alter table public.ai_provider_key_models
  alter column canonical_model_id set not null,
  add constraint ai_provider_key_models_key_canonical_unique unique (key_id, canonical_model_id),
  add constraint ai_provider_key_models_canonical_order_unique
    unique (canonical_model_id, sort_order) deferrable initially deferred;

drop index if exists idx_ai_provider_key_models_global_state;
drop index if exists idx_ai_provider_key_models_health;
create index if not exists idx_ai_provider_key_models_global_state
  on public.ai_provider_key_models(canonical_model_id, global_is_enabled, is_enabled);
create index if not exists idx_ai_provider_key_models_health
  on public.ai_provider_key_models(canonical_model_id, is_enabled, consecutive_failures, unhealthy_until, last_failure_at);

update public.ai_feature_bindings
set model_id = public.canonical_ai_model_id(model_id)
where model_id is not null;

create or replace function public.set_ai_provider_key_model_canonical()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if nullif(trim(new.model_id), '') is null
    or nullif(public.canonical_ai_model_id(new.model_id), '') is null then
    raise exception '模型 ID 不能为空';
  end if;
  new.model_id := trim(new.model_id);
  new.canonical_model_id := public.canonical_ai_model_id(new.model_id);
  return new;
end $$;

drop trigger if exists set_ai_provider_key_model_canonical on public.ai_provider_key_models;
create trigger set_ai_provider_key_model_canonical
before insert or update of model_id on public.ai_provider_key_models
for each row execute function public.set_ai_provider_key_model_canonical();

create or replace function public.set_ai_feature_binding_canonical_model()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.model_id is not null then
    new.model_id := public.canonical_ai_model_id(new.model_id);
  end if;
  return new;
end $$;

drop trigger if exists set_ai_feature_binding_canonical_model on public.ai_feature_bindings;
create trigger set_ai_feature_binding_canonical_model
before insert or update of model_id on public.ai_feature_bindings
for each row execute function public.set_ai_feature_binding_canonical_model();

create or replace function public.assign_ai_channel_sort_order()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.sort_order is null then
    select coalesce(max(sort_order), 0) + 1
    into new.sort_order
    from public.ai_provider_key_models
    where canonical_model_id = public.canonical_ai_model_id(new.model_id);
  end if;
  return new;
end $$;

drop trigger if exists assign_ai_channel_sort_order on public.ai_provider_key_models;
create trigger assign_ai_channel_sort_order
before insert on public.ai_provider_key_models
for each row execute function public.assign_ai_channel_sort_order();

create or replace function public.create_ai_config_channel(
  p_provider_id uuid, p_base_url text, p_provider_name text, p_label text, p_api_key text,
  p_available_models text[], p_models jsonb, p_enabled boolean
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare provider_id uuid := p_provider_id; new_key_id uuid := gen_random_uuid(); item jsonb;
begin
  if provider_id is null then
    select p.id into provider_id from public.ai_providers p
    where rtrim(p.base_url, '/') = p_base_url order by p.id limit 1;
    if provider_id is null then
      insert into public.ai_providers(name, base_url) values(p_provider_name, p_base_url)
      returning id into provider_id;
    end if;
  end if;
  insert into public.ai_provider_keys(id, provider_id, label, api_key, available_models, is_enabled)
    values(new_key_id, provider_id, p_label, p_api_key, to_jsonb(p_available_models), p_enabled);
  for item in select value from jsonb_array_elements(coalesce(p_models, '[]'::jsonb)) loop
    insert into public.ai_provider_key_models(key_id, model_id, display_name, is_enabled)
      values(new_key_id, item->>'model_id', item->>'display_name', coalesce((item->>'is_enabled')::boolean, false))
    on conflict (key_id, canonical_model_id) do update set
      model_id = case
        when position('/' in public.ai_provider_key_models.model_id) > 0
          and position('/' in excluded.model_id) = 0 then excluded.model_id
        else public.ai_provider_key_models.model_id end,
      display_name = case
        when public.ai_provider_key_models.display_name = public.ai_provider_key_models.model_id
          then excluded.display_name
        else public.ai_provider_key_models.display_name end,
      is_enabled = public.ai_provider_key_models.is_enabled or excluded.is_enabled;
  end loop;
  return jsonb_build_object(
    'keyId', new_key_id,
    'providerId', provider_id,
    'affectedCount', (select count(*) from public.ai_provider_key_models m where m.key_id = new_key_id and m.is_enabled)
  );
end $$;

create or replace function public.set_ai_channel_model_selection(
  p_key_id uuid, p_model_ids text[], p_display_names jsonb
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare chosen text; canonical text; upstream_model_id text; display_name text; before_count integer;
begin
  select count(*) into before_count from public.ai_provider_key_models where key_id = p_key_id;
  for chosen in select distinct unnest(coalesce(p_model_ids, '{}'::text[])) loop
    canonical := public.canonical_ai_model_id(chosen);
    select m.model_id into upstream_model_id
    from public.ai_provider_key_models m
    where m.key_id = p_key_id and m.canonical_model_id = canonical
    order by (position('/' in m.model_id) > 0), m.sort_order, m.id limit 1;
    if upstream_model_id is null then
      select candidate into upstream_model_id
      from jsonb_array_elements_text(coalesce((select available_models from public.ai_provider_keys where id = p_key_id), '[]'::jsonb)) candidate
      where public.canonical_ai_model_id(candidate) = canonical
      order by (position('/' in candidate) > 0), candidate limit 1;
    end if;
    upstream_model_id := coalesce(upstream_model_id, chosen);
    display_name := coalesce(p_display_names->>canonical, p_display_names->>upstream_model_id, canonical);
    insert into public.ai_provider_key_models(key_id, model_id, display_name, is_enabled)
      values(p_key_id, upstream_model_id, display_name, true)
    on conflict (key_id, canonical_model_id) do update set
      model_id = case
        when position('/' in public.ai_provider_key_models.model_id) > 0
          and position('/' in excluded.model_id) = 0 then excluded.model_id
        else public.ai_provider_key_models.model_id end,
      is_enabled = true,
      disabled_by_model = false;
  end loop;
  update public.ai_provider_key_models m
  set is_enabled = false, disabled_by_model = false
  where m.key_id = p_key_id
    and not exists (
      select 1 from unnest(coalesce(p_model_ids, '{}'::text[])) selected_id
      where public.canonical_ai_model_id(selected_id) = m.canonical_model_id
    );
  return jsonb_build_object(
    'created', greatest(0, (select count(*) from public.ai_provider_key_models where key_id = p_key_id) - before_count),
    'disabled', (select count(*) from public.ai_provider_key_models where key_id = p_key_id and not is_enabled),
    'removed', 0
  );
end $$;

create or replace function public.update_ai_config_model(p_supply_id uuid, p_patch jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare model text; affected_count integer;
begin
  select canonical_model_id into model from public.ai_provider_key_models where id = p_supply_id;
  if model is null then raise exception '模型供应不存在'; end if;
  update public.ai_provider_key_models m set
    display_name = case when p_patch ? 'display_name' then p_patch->>'display_name' else m.display_name end,
    is_enabled = case when m.id = p_supply_id and p_patch ? 'is_enabled' then (p_patch->>'is_enabled')::boolean else m.is_enabled end,
    disabled_by_model = case when m.id = p_supply_id and p_patch ? 'is_enabled' then false else m.disabled_by_model end,
    key_id = case when m.id = p_supply_id and p_patch ? 'key_id' then (p_patch->>'key_id')::uuid else m.key_id end
  where m.id = p_supply_id or (p_patch ? 'display_name' and m.canonical_model_id = model);
  get diagnostics affected_count = row_count;
  return jsonb_build_object('affectedCount', affected_count);
end $$;

create or replace function public.enable_ai_config_supply(p_key_id uuid, p_model_id text, p_display_name text)
returns uuid language plpgsql security invoker set search_path=public as $$
declare supply_id uuid; upstream_model_id text; canonical text := public.canonical_ai_model_id(p_model_id);
begin
  select m.model_id into upstream_model_id
  from public.ai_provider_key_models m
  where m.key_id = p_key_id and m.canonical_model_id = canonical
  order by (position('/' in m.model_id) > 0), m.sort_order, m.id limit 1;
  if upstream_model_id is null then
    select candidate into upstream_model_id
    from jsonb_array_elements_text(coalesce((select available_models from public.ai_provider_keys where id = p_key_id), '[]'::jsonb)) candidate
    where public.canonical_ai_model_id(candidate) = canonical
    order by (position('/' in candidate) > 0), candidate limit 1;
  end if;
  upstream_model_id := coalesce(upstream_model_id, p_model_id);
  insert into public.ai_provider_key_models as m(key_id, model_id, display_name, is_enabled)
    values(p_key_id, upstream_model_id, coalesce(p_display_name, canonical), true)
    on conflict (key_id, canonical_model_id) do update set
      model_id = case
        when position('/' in m.model_id) > 0 and position('/' in excluded.model_id) = 0 then excluded.model_id
        else m.model_id end,
      is_enabled = true
    returning id into supply_id;
  update public.ai_provider_keys set consecutive_failures = 0, unhealthy_until = null,
    invalidated_at = null, first_failure_at = null, manual_sleep_until = null,
    last_error_message = null, last_success_at = now(), updated_at = now()
  where id = p_key_id;
  update public.ai_provider_key_models set consecutive_failures = 0, unhealthy_until = null,
    invalidated_at = null, first_failure_at = null, disabled_by_model = false,
    last_error_message = null, last_failure_scope = null, last_failure_kind = null,
    last_success_at = now()
  where id = supply_id;
  return supply_id;
end $$;

create or replace function public.sync_ai_config_models(
  p_key_id uuid, p_available_models text[], p_models jsonb, p_verified boolean
) returns void language plpgsql security invoker set search_path=public as $$
declare item jsonb; upstream_model_id text; canonical text;
begin
  for item in select value from jsonb_array_elements(coalesce(p_models, '[]'::jsonb)) loop
    upstream_model_id := nullif(trim(item->>'model_id'), '');
    if upstream_model_id is null then continue; end if;
    canonical := public.canonical_ai_model_id(upstream_model_id);
    insert into public.ai_provider_key_models as m(key_id, model_id, display_name, is_enabled)
      values(p_key_id, upstream_model_id, coalesce(item->>'display_name', canonical), false)
    on conflict (key_id, canonical_model_id) do update set
      -- 上游清单已核实时，调用名以上游现在的写法为准（上游改名后要跟着改）；
      -- 未核实（调用方自带清单）时只做保守升级：带前缀换成不带前缀。
      model_id = case
        when p_verified then excluded.model_id
        when position('/' in m.model_id) > 0 and position('/' in excluded.model_id) = 0 then excluded.model_id
        else m.model_id end,
      display_name = case when m.display_name = m.model_id then excluded.display_name else m.display_name end;
  end loop;
  update public.ai_provider_keys set available_models = to_jsonb(p_available_models) where id = p_key_id;
  if p_verified and coalesce(array_length(p_available_models, 1), 0) > 0 then
    delete from public.ai_provider_key_models m
    where m.key_id = p_key_id
      and not exists (
        select 1 from unnest(p_available_models) available_model
        where public.canonical_ai_model_id(available_model) = m.canonical_model_id
      );
  end if;
end $$;

create or replace function public.swap_provider_key_model_order(
  p_model_id text, p_key_model_id uuid, p_target_key_model_id uuid
) returns void language plpgsql security definer set search_path = public as $$
declare current_order integer; target_order integer; canonical text := public.canonical_ai_model_id(p_model_id);
begin
  perform id from public.ai_provider_key_models where canonical_model_id = canonical order by sort_order for update;
  select sort_order into current_order from public.ai_provider_key_models
    where id = p_key_model_id and canonical_model_id = canonical;
  select sort_order into target_order from public.ai_provider_key_models
    where id = p_target_key_model_id and canonical_model_id = canonical;
  if current_order is null or target_order is null or p_key_model_id = p_target_key_model_id then
    raise exception '渠道不存在或不属于同一模型';
  end if;
  update public.ai_provider_key_models set sort_order = case
    when id = p_key_model_id then target_order else current_order end
  where id in (p_key_model_id, p_target_key_model_id) and canonical_model_id = canonical;
end $$;

create or replace function public.record_ai_supply_failure(
  supply_id uuid, failure_scope text, failure_kind text, permanent_failure boolean,
  error_message text, window_seconds integer, distinct_models integer, pause_seconds integer
) returns void language plpgsql security invoker set search_path = public as $$
declare target_key uuid; affected_count integer;
begin
  select key_id into target_key from public.ai_provider_key_models where id = supply_id;
  if target_key is null then return; end if;
  perform id from public.ai_provider_keys where id = target_key for update;
  if failure_scope = 'key' then
    perform public.bump_provider_key_failure(target_key, error_message, permanent_failure);
    return;
  end if;
  perform public.bump_provider_key_model_failure(supply_id, error_message, failure_scope, permanent_failure);
  update public.ai_provider_key_models set last_failure_kind = failure_kind where id = supply_id;
  if failure_kind not in ('timeout', 'service') or permanent_failure then return; end if;
  select count(distinct m.canonical_model_id) into affected_count
  from public.ai_provider_key_models m
  join public.ai_provider_keys k on k.id = m.key_id
  where m.key_id = target_key and m.last_failure_kind = failure_kind
    and m.last_failure_at >= now() - make_interval(secs => window_seconds)
    and (m.last_success_at is null or m.last_failure_at > m.last_success_at)
    and (k.last_success_at is null or k.last_success_at < now() - make_interval(secs => window_seconds));
  if affected_count >= distinct_models then
    update public.ai_provider_keys set unhealthy_until = now() + make_interval(secs => pause_seconds),
      consecutive_failures = greatest(consecutive_failures, 1), first_failure_at = coalesce(first_failure_at, now()),
      last_failure_at = now(), last_error_message = left(error_message, 500), updated_at = now()
    where id = target_key;
  end if;
end $$;

revoke all on table public.ai_provider_key_model_merge_audit from public, anon, authenticated;
grant select, insert on table public.ai_provider_key_model_merge_audit to service_role;
notify pgrst, 'reload schema';
commit;
