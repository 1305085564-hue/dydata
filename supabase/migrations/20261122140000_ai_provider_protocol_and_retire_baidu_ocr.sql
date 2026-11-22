-- 算力池协议级统一纳管 Cloudflare Clairic 与下线百度 OCR
-- 1. ai_providers 增加显式 protocol 字段（默认 openai_compatible）
-- 2. create_ai_config_channel 升级为 9 参（增加 p_protocol，按 base_url + protocol 匹配/新建接入点）
-- 3. ocr_recognition_logs 增加可空 fallback_detail jsonb
-- 4. 清理旧百度 OCR 绑定元数据（ocr_screenshot_structure / channel_settings）

begin;

alter table public.ai_providers
  add column if not exists protocol text not null default 'openai_compatible';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ai_providers_protocol_check'
      and conrelid = 'public.ai_providers'::regclass
  ) then
    alter table public.ai_providers
      add constraint ai_providers_protocol_check
      check (protocol in ('openai_compatible', 'cloudflare_clairic'));
  end if;
end $$;

drop function if exists public.create_ai_config_channel(uuid,text,text,text,text,text[],jsonb,boolean);

create or replace function public.create_ai_config_channel(
  p_provider_id uuid, p_base_url text, p_provider_name text, p_label text, p_api_key text,
  p_available_models text[], p_models jsonb, p_enabled boolean,
  p_protocol text default 'openai_compatible'
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare
  provider_id uuid := p_provider_id;
  new_key_id uuid := gen_random_uuid();
  item jsonb;
  effective_protocol text := coalesce(nullif(trim(p_protocol), ''), 'openai_compatible');
begin
  if effective_protocol not in ('openai_compatible', 'cloudflare_clairic') then
    raise exception '不支持的接入协议: %', effective_protocol;
  end if;
  if provider_id is null then
    select p.id into provider_id from public.ai_providers p
    where rtrim(p.base_url, '/') = p_base_url and p.protocol = effective_protocol
    order by p.id limit 1;
    if provider_id is null then
      insert into public.ai_providers(name, base_url, protocol)
      values(p_provider_name, p_base_url, effective_protocol)
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

revoke all on function public.create_ai_config_channel(uuid,text,text,text,text,text[],jsonb,boolean,text)
  from public, anon, authenticated;
grant execute on function public.create_ai_config_channel(uuid,text,text,text,text,text[],jsonb,boolean,text)
  to service_role;

alter table public.ocr_recognition_logs
  add column if not exists fallback_detail jsonb default null;

delete from public.ai_feature_bindings
where feature_key = 'ocr_screenshot_structure';

update public.ai_feature_bindings
set label = '截图识别',
    channel_settings = '{}'::jsonb
where feature_key = 'ocr_screenshot';

notify pgrst, 'reload schema';
commit;
