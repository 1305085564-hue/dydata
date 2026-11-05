-- 第四批：渠道接入、模型选择、改名和审计删除都在单事务内完成。
begin;
create or replace function public.create_ai_config_channel(
  p_provider_id uuid, p_base_url text, p_provider_name text, p_label text, p_api_key text,
  p_available_models text[], p_models jsonb, p_enabled boolean
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare provider_id uuid := p_provider_id; key_id uuid := gen_random_uuid(); item jsonb; selected_count integer := 0;
begin
  if provider_id is null then
    select p.id into provider_id from public.ai_providers p where rtrim(p.base_url,'/')=p_base_url order by p.id limit 1;
    if provider_id is null then
      insert into public.ai_providers(name,base_url) values(p_provider_name,p_base_url) returning id into provider_id;
    end if;
  end if;
  insert into public.ai_provider_keys(id,provider_id,label,api_key,available_models,is_enabled)
    values(key_id,provider_id,p_label,p_api_key,to_jsonb(p_available_models),p_enabled);
  for item in select value from jsonb_array_elements(p_models) loop
    insert into public.ai_provider_key_models(key_id,model_id,display_name,is_enabled)
      values(key_id,item->>'model_id',item->>'display_name',(item->>'is_enabled')::boolean);
    if (item->>'is_enabled')::boolean then selected_count:=selected_count+1; end if;
  end loop;
  return jsonb_build_object('keyId',key_id,'providerId',provider_id,'affectedCount',selected_count);
end $$;

create or replace function public.set_ai_channel_model_selection(p_key_id uuid,p_model_ids text[],p_display_names jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare created_count integer; disabled_count integer;
begin
  insert into public.ai_provider_key_models(key_id,model_id,display_name,is_enabled)
    select p_key_id,chosen,coalesce(p_display_names->>chosen,chosen),true from unnest(p_model_ids) chosen
    where not exists(select 1 from public.ai_provider_key_models where key_id=p_key_id and model_id=chosen);
  get diagnostics created_count=row_count;
  update public.ai_provider_key_models set is_enabled=false,disabled_by_model=false where key_id=p_key_id and not(model_id=any(p_model_ids));
  get diagnostics disabled_count=row_count;
  update public.ai_provider_key_models set is_enabled=true,disabled_by_model=false where key_id=p_key_id and model_id=any(p_model_ids);
  return jsonb_build_object('created',created_count,'disabled',disabled_count,'removed',0);
end $$;

create or replace function public.update_ai_config_model(p_supply_id uuid,p_patch jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare model text; affected_count integer;
begin
  select model_id into model from public.ai_provider_key_models where id=p_supply_id;
  if model is null then raise exception '模型供应不存在'; end if;
  update public.ai_provider_key_models m set
    display_name=case when p_patch ? 'display_name' then p_patch->>'display_name' else m.display_name end,
    is_enabled=case when m.id=p_supply_id and p_patch ? 'is_enabled' then (p_patch->>'is_enabled')::boolean else m.is_enabled end,
    disabled_by_model=case when m.id=p_supply_id and p_patch ? 'is_enabled' then false else m.disabled_by_model end,
    key_id=case when m.id=p_supply_id and p_patch ? 'key_id' then (p_patch->>'key_id')::uuid else m.key_id end
  where m.id=p_supply_id or (p_patch ? 'display_name' and m.model_id=model);
  get diagnostics affected_count=row_count;
  return jsonb_build_object('affectedCount',affected_count);
end $$;

create or replace function public.update_ai_config_key(p_key_id uuid,p_patch jsonb,p_base_url text)
returns void language plpgsql security invoker set search_path=public as $$
declare target_provider uuid;
begin
  select provider_id into target_provider from public.ai_provider_keys where id=p_key_id;
  if target_provider is null then raise exception '渠道不存在'; end if;
  if p_base_url is not null then update public.ai_providers set base_url=p_base_url,updated_at=now() where id=target_provider; end if;
  update public.ai_provider_keys k set
    label=case when p_patch ? 'label' then p_patch->>'label' else k.label end,
    api_key=case when p_patch ? 'api_key' then p_patch->>'api_key' else k.api_key end,
    is_enabled=case when p_patch ? 'is_enabled' then (p_patch->>'is_enabled')::boolean else k.is_enabled end,
    consecutive_failures=case when p_patch ? 'api_key' then 0 else k.consecutive_failures end,
    unhealthy_until=case when p_patch ? 'api_key' then null else k.unhealthy_until end,
    invalidated_at=case when p_patch ? 'api_key' then null else k.invalidated_at end,
    first_failure_at=case when p_patch ? 'api_key' then null else k.first_failure_at end,
    last_error_message=case when p_patch ? 'api_key' then null else k.last_error_message end,
    updated_at=now()
  where id=p_key_id;
end $$;

create or replace function public.remove_ai_config_supply_with_audit(p_supply_id uuid,p_actor_id uuid,p_audit_detail text)
returns void language plpgsql security invoker set search_path=public as $$
begin
  delete from public.ai_provider_key_models where id=p_supply_id;
  if not found then raise exception '模型供应不存在'; end if;
  insert into public.audit_logs(user_id,action,target,detail) values(p_actor_id,'ai_provider_model_remove',p_supply_id::text,p_audit_detail);
end $$;

create or replace function public.enable_ai_config_supply(p_key_id uuid,p_model_id text,p_display_name text)
returns uuid language plpgsql security invoker set search_path=public as $$
declare supply_id uuid;
begin
  insert into public.ai_provider_key_models as m(key_id,model_id,display_name,is_enabled)
    values(p_key_id,p_model_id,p_display_name,true)
    on conflict(key_id,model_id) do update set is_enabled=true
    returning id into supply_id;
  update public.ai_provider_keys set consecutive_failures=0,unhealthy_until=null,invalidated_at=null,first_failure_at=null,
    manual_sleep_until=null,last_error_message=null,last_success_at=now(),updated_at=now() where id=p_key_id;
  update public.ai_provider_key_models set consecutive_failures=0,unhealthy_until=null,invalidated_at=null,first_failure_at=null,
    disabled_by_model=false,last_error_message=null,last_failure_scope=null,last_failure_kind=null,last_success_at=now() where id=supply_id;
  return supply_id;
end $$;

-- 地址改变后允许重新试用；不是成功证明，不清零计数、不伪造成功时间。
create or replace function public.retry_ai_group_after_address_change()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if new.base_url is distinct from old.base_url then
    update public.ai_provider_keys set invalidated_at=null,unhealthy_until=null where provider_id=new.id;
    update public.ai_provider_key_models set invalidated_at=null,unhealthy_until=null
      where key_id in(select id from public.ai_provider_keys where provider_id=new.id);
  end if;
  return new;
end $$;
drop trigger if exists retry_ai_group_after_address_change on public.ai_providers;
create trigger retry_ai_group_after_address_change after update of base_url on public.ai_providers
  for each row execute function public.retry_ai_group_after_address_change();
revoke all on function public.create_ai_config_channel(uuid,text,text,text,text,text[],jsonb,boolean),
 public.set_ai_channel_model_selection(uuid,text[],jsonb),public.update_ai_config_model(uuid,jsonb),public.update_ai_config_key(uuid,jsonb,text),
 public.remove_ai_config_supply_with_audit(uuid,uuid,text),public.enable_ai_config_supply(uuid,text,text),public.retry_ai_group_after_address_change() from public,anon,authenticated;
grant execute on function public.create_ai_config_channel(uuid,text,text,text,text,text[],jsonb,boolean),
 public.set_ai_channel_model_selection(uuid,text[],jsonb),public.update_ai_config_model(uuid,jsonb),public.update_ai_config_key(uuid,jsonb,text),
 public.remove_ai_config_supply_with_audit(uuid,uuid,text),public.enable_ai_config_supply(uuid,text,text),public.retry_ai_group_after_address_change() to service_role;
notify pgrst,'reload schema';
commit;
