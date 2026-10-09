-- 回滚 20261009112826_ai_model_global_state_and_removal_audit.sql
-- 仅移除新增的全站状态列与索引，不触碰渠道级 is_enabled 历史数据。
begin;
drop index if exists public.idx_ai_provider_key_models_global_state;
alter table public.ai_provider_key_models
  drop column if exists global_is_enabled;
commit;
