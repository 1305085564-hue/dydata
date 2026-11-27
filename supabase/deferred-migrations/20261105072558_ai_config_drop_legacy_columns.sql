-- ============================================================================
-- 暂缓迁移（B3）：物理删除 AI 配置 4 个已废弃旧列
--   1. public.ai_provider_key_models.global_is_enabled
--   2. public.ai_feature_bindings.provider_key_model_id
--   3. public.ai_provider_keys.priority
--   4. public.ai_providers.priority
--
-- 安全约束：
--   - 保留在 supabase/deferred-migrations/，不放入 supabase/migrations/，禁止随常规代码上线自动执行。
--   - 执行前必须满足：
--       (a) 应用侧（src/）已完成对上述 4 列的零业务引用上线并稳定观察 ≥ 3 天；
--       (b) 架构师（CC）执行完下方【前置核查 SQL】且全部返回 0 行；
--       (c) 生产库已完成快照/表备份，并获阿禅明确授权执行窗口。
--
-- 【前置核查 SQL】（执行前务必在生产库只读运行，全部应返回 0 行）：
--   -- 1) 核查无视图 / RLS 策略 / 触发器依赖这 4 列（仅允许列自身索引、默认值和外键）：
--   SELECT c.relname AS table_name, a.attname AS column_name,
--          pg_describe_object(d.classid, d.objid, d.objsubid) AS dependent
--   FROM pg_depend d
--   JOIN pg_class c ON c.oid = d.refobjid
--   JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
--   JOIN pg_class dc ON dc.oid = d.classid
--   WHERE c.relnamespace = 'public'::regnamespace
--     AND dc.relname NOT IN ('pg_attrdef', 'pg_constraint', 'pg_class')
--     AND ((c.relname = 'ai_provider_key_models' AND a.attname = 'global_is_enabled')
--       OR (c.relname = 'ai_feature_bindings' AND a.attname = 'provider_key_model_id')
--       OR (c.relname = 'ai_provider_keys' AND a.attname = 'priority')
--       OR (c.relname = 'ai_providers' AND a.attname = 'priority'));
--
--   -- 2) 核查无数据库函数/RPC 正文仍在读写这 4 列：
--   SELECT proname, pg_get_function_identity_arguments(oid) AS args
--   FROM pg_proc
--   WHERE pronamespace = 'public'::regnamespace
--     AND (pg_get_functiondef(oid) ~* '\b(global_is_enabled|provider_key_model_id)\b'
--       OR (pg_get_functiondef(oid) ~* 'ai_provider_keys|ai_providers'
--           AND pg_get_functiondef(oid) ~* '\bpriority\b'));
--
-- 【回滚预案 SQL】（若执行后需要恢复列结构，按原定义补回可空/默认列并重载 PostgREST 缓存；
--   历史列值如需恢复，请从执行前快照表回填）：
--   begin;
--   alter table public.ai_provider_key_models add column if not exists global_is_enabled boolean;
--   alter table public.ai_feature_bindings add column if not exists provider_key_model_id uuid references public.ai_provider_key_models(id) on delete set null;
--   alter table public.ai_provider_keys add column if not exists priority integer not null default 100;
--   alter table public.ai_providers add column if not exists priority integer not null default 100;
--   create index if not exists idx_ai_provider_key_models_global_state on public.ai_provider_key_models(model_id, global_is_enabled);
--   create index if not exists idx_ai_feature_bindings_provider_key_model on public.ai_feature_bindings(provider_key_model_id);
--   create index if not exists idx_ai_provider_keys_provider_enabled on public.ai_provider_keys(provider_id, is_enabled, priority);
--   create index if not exists idx_ai_providers_enabled_priority on public.ai_providers(is_enabled, priority);
--   notify pgrst, 'reload schema';
--   commit;
-- ============================================================================

begin;

alter table public.ai_provider_key_models drop column if exists global_is_enabled;
alter table public.ai_feature_bindings drop column if exists provider_key_model_id;
alter table public.ai_provider_keys drop column if exists priority;
alter table public.ai_providers drop column if exists priority;

create index if not exists idx_ai_provider_keys_provider_enabled_v2
  on public.ai_provider_keys(provider_id, is_enabled);
create index if not exists idx_ai_providers_enabled_v2
  on public.ai_providers(is_enabled);

notify pgrst, 'reload schema';

commit;
