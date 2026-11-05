-- 第一批：先部署兼容应用，再在授权发布窗口执行。生产本轮不执行。
begin;
alter table public.ai_provider_key_models
  add column if not exists disabled_by_model boolean not null default false;

-- 只有原来实际打开的供应才应在“恢复模型”时重新打开。
update public.ai_provider_key_models
set is_enabled = false, disabled_by_model = true
where global_is_enabled = false and is_enabled = true;

-- 空模型继续跟随默认；不继承过去不可见的钉渠道。
update public.ai_feature_bindings set provider_key_model_id = null
where provider_key_model_id is not null;

notify pgrst, 'reload schema';
commit;
