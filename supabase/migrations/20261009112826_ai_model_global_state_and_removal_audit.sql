-- AI 模型全站状态与渠道级供应状态拆开。
-- global_is_enabled = NULL 表示历史未表态/无法推断；迁移绝不把全关历史猜成某种意图。
begin;

alter table public.ai_provider_key_models
  add column if not exists global_is_enabled boolean;

-- 只有存在至少一条当前供给线的模型才能安全推断为全站启用。
-- 全部关闭的存量保持 NULL，后续全站动作不会据此自动点亮渠道。
update public.ai_provider_key_models target
set global_is_enabled = true
where target.global_is_enabled is null
  and exists (
    select 1
    from public.ai_provider_key_models active
    where active.model_id = target.model_id
      and active.is_enabled = true
  );

comment on column public.ai_provider_key_models.global_is_enabled is
  '模型全站级是否允许业务使用；NULL 表示历史未表态/无法推断。与本行渠道级 is_enabled 分离。';

create index if not exists idx_ai_provider_key_models_global_state
  on public.ai_provider_key_models(model_id, global_is_enabled, is_enabled);

commit;
