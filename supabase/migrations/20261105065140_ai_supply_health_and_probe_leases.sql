-- 第二批；仅在本地验证，正式发布先应用后迁移。无破坏性字段删除。
begin;
alter table public.ai_provider_keys add column if not exists recovery_token uuid, add column if not exists recovery_until timestamptz;
alter table public.ai_provider_key_models add column if not exists recovery_token uuid, add column if not exists recovery_until timestamptz, add column if not exists last_failure_kind text;
update public.ai_provider_keys set manual_sleep_until = null where manual_sleep_until is not null;
-- 解除旧“超过24小时”造成的临时故障永久封禁；明确凭据/不存在错误继续保留。
update public.ai_provider_keys set invalidated_at = null where invalidated_at is not null
  and coalesce(last_error_message,'') !~* '(401|invalid.{0,8}(key|credential)|unauthori[sz]ed|model.?not.?found|no such model|unknown.?model|unsupported.?model)';
update public.ai_provider_key_models set invalidated_at = null where invalidated_at is not null
  and coalesce(last_error_message,'') !~* '(401|invalid.{0,8}(key|credential)|unauthori[sz]ed|model.?not.?found|no such model|unknown.?model|unsupported.?model)';

create or replace function public.bump_provider_key_failure(key_id uuid, error_message text default null, permanent_failure boolean default false)
returns void language plpgsql security invoker set search_path = public as $$
begin
  update public.ai_provider_keys k set consecutive_failures = coalesce(k.consecutive_failures,0)+1,
    first_failure_at = coalesce(k.first_failure_at,now()),
    invalidated_at = case when permanent_failure then coalesce(k.invalidated_at,now()) else k.invalidated_at end,
    unhealthy_until = now() + (array[1,5,30,60])[least(coalesce(k.consecutive_failures,0)+1,4)] * interval '1 minute',
    last_failure_at = now(), last_error_message = left(coalesce(error_message,''),500), updated_at = now()
  where id = key_id;
end $$;
create or replace function public.bump_provider_key_model_failure(key_model_id uuid, error_message text default null, failure_scope text default 'unknown', permanent_failure boolean default false)
returns void language plpgsql security invoker set search_path = public as $$
begin
  update public.ai_provider_key_models m set consecutive_failures = coalesce(m.consecutive_failures,0)+1,
    first_failure_at = coalesce(m.first_failure_at,now()),
    invalidated_at = case when permanent_failure then coalesce(m.invalidated_at,now()) else m.invalidated_at end,
    unhealthy_until = now() + (array[1,5,30,60])[least(coalesce(m.consecutive_failures,0)+1,4)] * interval '1 minute',
    last_failure_at = now(), last_error_message = left(coalesce(error_message,''),500),
    last_failure_scope = case when failure_scope in ('model','unknown') then failure_scope else 'unknown' end
  where id = key_model_id;
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
    perform public.bump_provider_key_failure(target_key,error_message,permanent_failure);
    return;
  end if;
  perform public.bump_provider_key_model_failure(supply_id,error_message,failure_scope,permanent_failure);
  update public.ai_provider_key_models set last_failure_kind = failure_kind where id = supply_id;
  if failure_kind not in ('timeout','service') or permanent_failure then return; end if;
  select count(distinct lower(replace(m.model_id,'-','.'))) into affected_count
  from public.ai_provider_key_models m join public.ai_provider_keys k on k.id = m.key_id
  where m.key_id = target_key and m.last_failure_kind = failure_kind
    and m.last_failure_at >= now() - make_interval(secs => window_seconds)
    and (m.last_success_at is null or m.last_failure_at > m.last_success_at)
    and (k.last_success_at is null or m.last_failure_at > k.last_success_at);
  if affected_count >= distinct_models then
    update public.ai_provider_keys set unhealthy_until = now() + make_interval(secs => pause_seconds),
      consecutive_failures = greatest(consecutive_failures,1), first_failure_at = coalesce(first_failure_at,now()),
      last_failure_at = now(), last_error_message = left(error_message,500), updated_at = now()
    where id = target_key;
  end if;
end $$;

create or replace function public.claim_ai_supply_recovery(supply_id uuid, lease_seconds integer)
returns uuid language plpgsql security invoker set search_path = public as $$
declare k public.ai_provider_keys; m public.ai_provider_key_models; token uuid := gen_random_uuid();
begin
  select * into k from public.ai_provider_keys where id = (select key_id from public.ai_provider_key_models where id = supply_id) for update;
  select * into m from public.ai_provider_key_models where id = supply_id for update;
  if m.id is null or not m.is_enabled or not k.is_enabled or not exists(select 1 from public.ai_providers where id=k.provider_id and is_enabled)
    or k.invalidated_at is not null or m.invalidated_at is not null
    or k.unhealthy_until > now() or m.unhealthy_until > now()
    or k.recovery_until > now() or m.recovery_until > now() then return null; end if;
  if coalesce(k.consecutive_failures,0) = 0 and coalesce(m.consecutive_failures,0) = 0 then return null; end if;
  update public.ai_provider_key_models set recovery_token=token,recovery_until=now()+make_interval(secs=>lease_seconds) where id=supply_id;
  if coalesce(k.consecutive_failures,0)>0 then
    update public.ai_provider_keys set recovery_token=token,recovery_until=now()+make_interval(secs=>lease_seconds) where id=k.id;
  end if;
  return token;
end $$;
create or replace function public.release_ai_supply_recovery(supply_id uuid, lease_token uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  -- 与获取锁、故障记录保持相同锁顺序：Key 后模型。
  update public.ai_provider_keys set recovery_token=null,recovery_until=null
    where id=(select key_id from public.ai_provider_key_models where id=supply_id) and recovery_token=lease_token;
  update public.ai_provider_key_models set recovery_token=null,recovery_until=null where id=supply_id and recovery_token=lease_token;
end $$;
revoke all on function public.bump_provider_key_failure(uuid,text,boolean), public.bump_provider_key_model_failure(uuid,text,text,boolean),
 public.record_ai_supply_failure(uuid,text,text,boolean,text,integer,integer,integer), public.claim_ai_supply_recovery(uuid,integer), public.release_ai_supply_recovery(uuid,uuid) from public,anon,authenticated;
grant execute on function public.bump_provider_key_failure(uuid,text,boolean), public.bump_provider_key_model_failure(uuid,text,text,boolean),
 public.record_ai_supply_failure(uuid,text,text,boolean,text,integer,integer,integer), public.claim_ai_supply_recovery(uuid,integer), public.release_ai_supply_recovery(uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
