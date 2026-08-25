-- 20260825220000: 渠道 Key 可用模型清单（模型顺位页同步与勾选）
-- ai_provider_keys 增加 available_models jsonb：存放从渠道 /v1/models 同步回来的原始模型名清单。
-- 勾选后的模型仍以 ai_provider_key_models 行为准（勾选=建行，取消=删行）。

alter table public.ai_provider_keys
  add column if not exists available_models jsonb not null default '[]'::jsonb;

comment on column public.ai_provider_keys.available_models is '从渠道 /v1/models 同步的原始模型 id 清单（jsonb string 数组），勾选结果存 ai_provider_key_models';
