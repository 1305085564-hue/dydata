-- 不在常规 migrations 目录；禁止随本次上线执行。
-- 执行条件：新版与 Antigravity 界面上线后观察至少3天；CC复核无读取点；阿禅再次确认。
-- 本任务只在本地事务中演练并回滚，未在任何持久环境执行。
begin;
alter table public.ai_provider_key_models drop column global_is_enabled;
alter table public.ai_feature_bindings drop column provider_key_model_id;
alter table public.ai_provider_keys drop column priority;
alter table public.ai_providers drop column priority;
create index if not exists idx_ai_provider_keys_provider_enabled_v2 on public.ai_provider_keys(provider_id,is_enabled);
create index if not exists idx_ai_providers_enabled_v2 on public.ai_providers(is_enabled);
notify pgrst,'reload schema';
commit;
