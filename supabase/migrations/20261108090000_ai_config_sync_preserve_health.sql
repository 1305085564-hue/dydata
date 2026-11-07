-- 2026-11-08 R2：同步清单只负责货架对齐，不解除调用健康。
-- 保留同一事务的清单更新、清单外挂载删除、新增默认关闭；
-- 不清 invalidated_at / unhealthy_until / 失败计数 / 最后错误；恢复由真实调用成功或复测成功负责。
begin;

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
  end if;
end $$;

revoke all on function public.sync_ai_config_models(uuid,text[],jsonb,boolean) from public,anon,authenticated;
grant execute on function public.sync_ai_config_models(uuid,text[],jsonb,boolean) to service_role;

notify pgrst,'reload schema';
commit;
