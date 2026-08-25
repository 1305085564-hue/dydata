-- 20260825200000: 模型为主、渠道为辅（场景绑定与全局默认改为绑定模型）
-- 设计：场景路由指定的是"模型"而非"渠道×模型组合"。选定模型后，
-- 系统按 Key/供应商优先级自动排出该模型在所有渠道上的顺位，
-- 同一模型跨渠道自动切换（1 号渠道挂了找 2、3、4 号渠道的同一模型）。
-- 「全局默认」（feature_key='default'）同样绑定模型，优先级最低：场景未指定时走它。
-- 解析层兼容：model_id 为空的旧数据仍可用 provider_key_model_id 推导出模型。

alter table public.ai_feature_bindings
  add column if not exists model_id text;

-- 回填：已有组合绑定的行，把该组合的 model_id 冗余到新列
update public.ai_feature_bindings b
set model_id = m.model_id
from public.ai_provider_key_models m
where b.provider_key_model_id = m.id
  and b.model_id is null;

comment on column public.ai_feature_bindings.model_id is '场景绑定的模型（模型为主，跨渠道顺位切换）；为空时解析层回退 provider_key_model_id 推导，再退全局默认';
