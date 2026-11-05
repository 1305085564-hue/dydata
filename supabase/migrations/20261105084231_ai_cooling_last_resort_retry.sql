-- 正常供应全部失败后允许越过冷却期补试；保留同一供应/渠道单请求租约。
begin;
create or replace function public.claim_ai_supply_recovery(supply_id uuid, lease_seconds integer, allow_cooling boolean)
returns uuid language plpgsql security invoker set search_path = public as $$
declare k public.ai_provider_keys; m public.ai_provider_key_models; token uuid := gen_random_uuid();
begin
  select * into k from public.ai_provider_keys where id = (select key_id from public.ai_provider_key_models where id = supply_id) for update;
  select * into m from public.ai_provider_key_models where id = supply_id for update;
  if m.id is null or not m.is_enabled or not k.is_enabled or not exists(select 1 from public.ai_providers where id=k.provider_id and is_enabled)
    or k.invalidated_at is not null or m.invalidated_at is not null
    or (not allow_cooling and (k.unhealthy_until > now() or m.unhealthy_until > now()))
    or k.recovery_until > now() or m.recovery_until > now() then return null; end if;
  if not ((allow_cooling and (coalesce(k.unhealthy_until > now(),false) or coalesce(m.unhealthy_until > now(),false)))
    or coalesce(k.consecutive_failures,0)>0 or coalesce(m.consecutive_failures,0)>0
    or coalesce(k.last_failure_at > coalesce(k.last_success_at,'-infinity'::timestamptz),false)
    or coalesce(m.last_failure_at > coalesce(m.last_success_at,'-infinity'::timestamptz),false)) then return null; end if;
  update public.ai_provider_key_models set recovery_token=token,recovery_until=now()+make_interval(secs=>lease_seconds) where id=supply_id;
  if (allow_cooling and coalesce(k.unhealthy_until > now(),false))
    or coalesce(k.consecutive_failures,0)>0 or coalesce(k.last_failure_at > coalesce(k.last_success_at,'-infinity'::timestamptz),false) then
    update public.ai_provider_keys set recovery_token=token,recovery_until=now()+make_interval(secs=>lease_seconds) where id=k.id;
  end if;
  return token;
end $$;

-- 旧调用仍须冷却到期；新调用显式传 allow_cooling，兼容旧应用。
create or replace function public.claim_ai_supply_recovery(supply_id uuid, lease_seconds integer)
returns uuid language sql security invoker set search_path = public as $$
  select public.claim_ai_supply_recovery(supply_id, lease_seconds, false);
$$;
revoke all on function public.claim_ai_supply_recovery(uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.claim_ai_supply_recovery(uuid,integer,boolean) to service_role;
notify pgrst, 'reload schema';
commit;
