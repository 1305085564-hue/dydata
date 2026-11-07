-- 2026-11-07：货架如实对齐 + 手动测试失败当场写健康。
-- 1) 同步时以上游清单为准，清单里没有的挂载记录在同一事务内撤下。
-- 2) 管理员手动测试失败立即进入冷却：第一次 5 分钟、第二次 1 小时、第三次起每次 24 小时。
begin;

-- 同步清单允许重新试用，不把“上游列出模型”当作一次生成成功。
-- 只有服务端真实取回的非空清单（p_verified=true）才会撤下清单外的旧记录；
-- 客户端传入的清单（p_verified=false）保持只增不删，避免误删。
create or replace function public.sync_ai_config_models(p_key_id uuid,p_available_models text[],p_models jsonb,p_verified boolean)
returns void language plpgsql security invoker set search_path=public as $$
declare item jsonb;
begin
  for item in select value from jsonb_array_elements(p_models) loop
    insert into public.ai_provider_key_models as m(key_id,model_id,display_name,is_enabled)
      values(p_key_id,item->>'model_id',item->>'display_name',false)
      on conflict(key_id,model_id) do update set display_name=case when m.display_name=m.model_id then excluded.display_name else m.display_name end;
  end loop;
  update public.ai_provider_keys set available_models=to_jsonb(p_available_models) where id=p_key_id;
  if p_verified then
    -- 先写清单内模型，再撤下清单外旧记录，保证旧应用传入并集时也不会把旧账重新插回来。
    if coalesce(array_length(p_available_models,1),0) > 0 then
      delete from public.ai_provider_key_models
        where key_id=p_key_id and not (model_id=any(p_available_models));
    end if;
    update public.ai_provider_keys set invalidated_at=null,unhealthy_until=null where id=p_key_id;
    update public.ai_provider_key_models set invalidated_at=null,unhealthy_until=null where key_id=p_key_id and model_id=any(p_available_models);
  end if;
end $$;

-- 手动测试失败是管理员主动确认的“现在不通”，与真实请求失败的冷却阶梯分开：
-- 第一次 5 分钟，第二次 1 小时，第三次起每次 24 小时。
-- 只有 key 级明确鉴权失败才永久失效；模型级失败只休息，不撤记录、不关开关。
create or replace function public.record_ai_manual_supply_failure(
  supply_id uuid, failure_scope text, permanent_failure boolean, error_message text
) returns void language plpgsql security invoker set search_path=public as $$
declare target_key uuid;
begin
  select key_id into target_key from public.ai_provider_key_models where id=supply_id;
  if target_key is null then return; end if;

  if failure_scope = 'key' then
    update public.ai_provider_keys k set
      consecutive_failures = coalesce(k.consecutive_failures,0)+1,
      first_failure_at = coalesce(k.first_failure_at,now()),
      invalidated_at = case when permanent_failure then coalesce(k.invalidated_at,now()) else k.invalidated_at end,
      unhealthy_until = now() + case
        when coalesce(k.consecutive_failures,0)=0 then interval '5 minutes'
        when coalesce(k.consecutive_failures,0)=1 then interval '1 hour'
        else interval '24 hours' end,
      last_failure_at = now(),
      last_error_message = left(coalesce(error_message,''),500),
      updated_at = now()
    where k.id = target_key;
    return;
  end if;

  update public.ai_provider_key_models m set
    consecutive_failures = coalesce(m.consecutive_failures,0)+1,
    first_failure_at = coalesce(m.first_failure_at,now()),
    invalidated_at = case when permanent_failure then coalesce(m.invalidated_at,now()) else m.invalidated_at end,
    unhealthy_until = now() + case
      when coalesce(m.consecutive_failures,0)=0 then interval '5 minutes'
      when coalesce(m.consecutive_failures,0)=1 then interval '1 hour'
      else interval '24 hours' end,
    last_failure_at = now(),
    last_error_message = left(coalesce(error_message,''),500),
    last_failure_scope = case when failure_scope in ('model','unknown') then failure_scope else 'unknown' end
  where m.id = supply_id;
end $$;

revoke all on function public.sync_ai_config_models(uuid,text[],jsonb,boolean),
  public.record_ai_manual_supply_failure(uuid,text,boolean,text) from public,anon,authenticated;
grant execute on function public.sync_ai_config_models(uuid,text[],jsonb,boolean),
  public.record_ai_manual_supply_failure(uuid,text,boolean,text) to service_role;

commit;
