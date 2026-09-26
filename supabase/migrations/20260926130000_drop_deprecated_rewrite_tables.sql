-- ============================================================================
-- 20260926130000: 补齐「废弃表清理」到线上，并让 ai_unified_config_view 不再依赖它们
-- ============================================================================
-- 背景（2026-09-26 只读核对结论）：
--   本地 051_cleanup_deprecated_tables.sql（2026-07-03 新增）占用了**线上已被占用的
--   版本号 051**（线上 051 = leader_daily_reports，2026-05-06 已推送）。因此该清理
--   按版本号永远不会被 push 到线上，但会在空库/新环境按序执行 → 「线上有表、空库无表」
--   漂移，进而使 062 与 20260629000000 的空库重放失败。
--   本迁移用未被占用的版本号把这份清理补到线上（不动 051 文件，不新增其它前向变更）。
--
-- 线上核对证据（psql 只读会话，凭据未落盘）：
--   * to_regclass：下列六张废弃表在线上均存在（051 的完整清理清单）
--   * 数据与休眠：
--       rewrite_fixed_modes 2 行 / rewrite_length_presets 3 行 / rewrite_workflows 1 行 /
--       rewrite_workflow_steps 2 行 / sop_review_scores 4 行（2026-05-11 后再无写入）/
--       rewrite_variants 0 行（空表）。上述表创建后均无更新与删除。
--   * 依赖①视图：唯一引用它们的视图是 public.ai_unified_config_view
--   * 依赖②外键（线上 pg_depend 实测 4 条，全部落在历史遗留列上）：
--       rewrite_conversations.selected_fixed_mode_id    → rewrite_fixed_modes
--       rewrite_conversations.selected_length_preset_id → rewrite_length_presets
--       rewrite_fixed_modes.length_preset_id            → rewrite_length_presets
--       rewrite_workflow_steps.workflow_id              → rewrite_workflows
--     其中 rewrite_conversations 仅被 scripts/_archived 里的旧脚本引用；rewrite_model_routes
--     的 4 行里 workflow_step_id 全为 NULL（挂 step 的行数 = 0/4），摘键不影响任何在用数据。
--   * 依赖③策略（重放实测到的真实阻塞点）：
--       rewrite_workflow_steps 上的 RLS 策略 rewrite_workflow_steps_read_enabled 的 USING
--       表达式 EXISTS 引用 rewrite_workflows → 直接删 rewrite_workflows 会报
--       `cannot drop table ... because other objects depend on it`。
--     处理方式：把同为废弃表的 rewrite_workflow_steps 一起删掉（051 同批列入、应用零引用、
--     数据休眠），策略随表消失；**不去改写或删除任何存活表上的安全策略**。
--     故 steps 必须排在工作流表之前。
--   * 其余两张（sop_review_scores / rewrite_variants）依赖自闭环：
--     pg_depend 穷尽核对显示它们的所有外键、CHECK、策略、索引都只落在自己身上，
--     没有任何视图 / 外键 / 策略 / 函数从外部引用它们，可直接删。
--   * 应用侧：src/ scripts/ tests/ 对这六张表零引用
--
-- 顺序要求：① 重建视图（去掉对废弃表的引用）→ ② 摘掉指向它们的外键 → ③ 按数组顺序删表
--   （rewrite_workflow_steps 必须先于 rewrite_workflows）。跳过①或②会因依赖报错；
--   用 CASCADE 则会把视图一起静默删掉（视图是 062 的交付物），故显式摘外键、不用 CASCADE。
--   被摘掉外键的列保留原值（只失去引用完整性，不删除列、不动数据）。
-- 注意：本文件的视图定义与 062 中的定义**必须保持一致**，改一处要同步另一处
--   （守卫见 src/lib/deprecated-rewrite-tables-migration.test.ts）。
-- 配套改动：20260629000000 里"重建 rewrite_variants 空表（含策略/授权）"的那段已删除——
--   否则空库重放会在 051 删表后又把它造回来，与本迁移删表后形成新的环境漂移。

CREATE OR REPLACE VIEW public.ai_unified_config_view AS
SELECT
  'feature'::text AS config_type,
  afc.id,
  afc.feature_key AS key,
  afc.label AS name,
  afc.system_prompt AS prompt,
  afc.channel_id,
  afc.model,
  NULL::uuid AS parent_id,
  NULL::jsonb AS metadata,
  afc.is_enabled,
  afc.created_at,
  afc.updated_at
FROM public.ai_feature_config afc
UNION ALL
SELECT
  'rewrite_model_view'::text AS config_type,
  rmv.id,
  rmv.key,
  rmv.label AS name,
  rmv.description AS prompt,
  NULL::uuid AS channel_id,
  NULL::text AS model,
  NULL::uuid AS parent_id,
  jsonb_build_object('sort_order', rmv.sort_order, 'is_default', rmv.is_default) AS metadata,
  rmv.is_enabled,
  rmv.created_at,
  rmv.updated_at
FROM public.rewrite_model_views rmv
UNION ALL
SELECT
  'rewrite_mode'::text AS config_type,
  rm.id,
  rm.key,
  rm.name,
  rm.mode_prompt AS prompt,
  NULL::uuid AS channel_id,
  NULL::text AS model,
  NULL::uuid AS parent_id,
  jsonb_build_object('description', rm.description, 'sort_order', rm.sort_order, 'is_default', rm.is_default) AS metadata,
  rm.is_enabled,
  rm.created_at,
  rm.updated_at
FROM public.rewrite_modes rm;

GRANT SELECT ON public.ai_unified_config_view TO authenticated, service_role;

-- 视图已不再引用这些废弃表；接着摘掉指向它们的外键，然后按序删除。
-- 外键运行时动态查找：空库重放（051 已删过表）时整体是 no-op，保持幂等。
DO $$
DECLARE
  target text;
  ref record;
BEGIN
  -- 顺序有意义：rewrite_workflow_steps 必须先于 rewrite_workflows（后者被前者的 RLS 策略引用）
  FOREACH target IN ARRAY ARRAY['rewrite_workflow_steps', 'rewrite_workflows', 'rewrite_fixed_modes', 'rewrite_length_presets', 'sop_review_scores', 'rewrite_variants'] LOOP
    IF to_regclass('public.' || target) IS NULL THEN
      CONTINUE;
    END IF;

    FOR ref IN
      SELECT conrelid::regclass AS tbl, conname
      FROM pg_constraint
      WHERE contype = 'f'
        AND confrelid = to_regclass('public.' || target)
    LOOP
      EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', ref.tbl, ref.conname);
    END LOOP;

    EXECUTE format('DROP TABLE public.%I', target);
  END LOOP;
END $$;

-- ============================================================================
-- ROLLBACK（需要时手工执行；表定义来源见括号内的历史迁移）
-- ----------------------------------------------------------------------------
-- 1) 重建被删的表（按建表来源）：
--    044_rewrite_workspace.sql    → rewrite_workflow_steps / rewrite_workflows / rewrite_length_presets
--    046_rewrite_fixed_modes.sql  → rewrite_fixed_modes，以及
--                                   `alter table rewrite_conversations add column selected_fixed_mode_id`
--    050_sop_team_management.sql  → sop_review_scores（含其 CHECK 约束与唯一索引）
--    20260629000000_rewrite_skills_and_documents.sql → rewrite_variants（含两条策略与 grant，
--                                   该表的 create table / policy / grant 段本次已从该迁移中移除，
--                                   回滚时需一并找回）
-- 2) 回灌删除前的整份数据快照（2026-09-26 只读快照，共 14 行）：
--    rewrite_variants：删除前 0 行，无需回灌。
--    insert into public.rewrite_workflow_steps (id, workflow_id, step_key, name, description, step_prompt, model_view_id, sort_order, is_enabled)
--    values ('0461262c-a2b5-4321-a34e-86cb05b3151e','370ca520-4876-4e0d-88ff-1167cd6cbc1a','structure','框架改写','先调结构、信息排序和节奏','你现在只做第一步：框架/结构改写。重点是重排信息顺序、优化开头、压缩废话、增强节奏和层次，不要在这一步过度追求情绪词。','408e4d33-76f6-44d3-97ac-e6db13c51b55',10,true),
--           ('de22ea25-3b34-40e1-b756-65e77b1ce8c8','370ca520-4876-4e0d-88ff-1167cd6cbc1a','polish','语感润色','在结构稿基础上再润色情绪和语感','你现在只做第二步：情绪/语感润色。基于已有结构稿，把表达变得更顺口、更有情绪张力、更适合发布，但不要改掉核心观点和事实边界。','0c1327e3-f2f8-4c90-889e-d76ff9f2683e',20,true);
--    insert into public.rewrite_workflows (id, key, name, description, sort_order, is_default, is_enabled)
--    values ('370ca520-4876-4e0d-88ff-1167cd6cbc1a','default_auto_rewrite','默认自动改写','固定双阶段：先框架/结构改写，再做情绪/语感润色',10,true,true);
--    insert into public.rewrite_fixed_modes (id, key, name, description, fixed_prompt, model_view_id, length_preset_id, sort_order, is_enabled)
--    values ('43d483cc-5e12-436b-9946-34bc9b739eeb','strong_framework','强框架模式','优先拉齐结构、信息排序、开头抓力和整体节奏。','你现在执行的是“强框架模式”。优先重做结构框架、信息顺序、开头抓力、层次推进和节奏感。先让内容站得住、顺得下、抓得住，再考虑文采。不要堆花哨情绪词，不要把稿子写散，不要改动事实边界。','0c1327e3-f2f8-4c90-889e-d76ff9f2683e','177945ae-21b3-4425-ba8b-5c62b02e9059',10,true),
--           ('487a1784-71e9-4370-827c-4b5b59e911dd','strong_tone','强语感模式','优先提升口播顺滑度、情绪张力和真人表达感。','你现在执行的是“强语感模式”。优先强化语感、口播顺滑度、情绪张力和人话表达，让稿子更像成熟作者直接说出来的话。可以增强感染力和发布感，但不要低俗、不要失真、不要突破事实边界。','408e4d33-76f6-44d3-97ac-e6db13c51b55','177945ae-21b3-4425-ba8b-5c62b02e9059',20,true);
--    insert into public.rewrite_length_presets (id, key, name, description, length_prompt, sort_order, is_default, is_enabled)
--    values ('bbcfc5fb-3e3d-4b38-a341-3929bfa11e08','concise','精简','更短，更利落，适合快节奏发布','控制整体长度，优先保留最核心信息。表达尽量短、准、狠，减少重复和铺垫。',10,false,true),
--           ('177945ae-21b3-4425-ba8b-5c62b02e9059','standard','标准','信息完整，适合大多数场景','保持信息完整和节奏平衡，不刻意压缩，也不要无意义展开。',20,true,true),
--           ('c6997ebc-e696-4de1-ba51-48aeb6f61ea4','expanded','展开','适当补足解释，更完整','在不跑题的前提下适度展开，把逻辑和过渡补清楚，适合需要多一点解释的场景。',30,false,true);
--    insert into public.sop_review_scores (id, submission_id, reviewer_user_id, hook_score, viewpoint_score, cta_score, compliance_score, performance_hook_score, yesterday_review_score, total_score, is_passed, rejection_reason, created_at)
--    values ('01a834b9-4dc8-457b-9dcb-7239f32d9b60','23c733d3-1354-4c84-a7ba-4e860bb39697','a689874f-12f1-43e1-8e20-87e2195fe041',4,8,6,6,3,6,5.50,false,'请按组长反馈修改','2026-05-07T09:09:29.396031+00:00'),
--           ('f7467022-cfd6-4be8-b5a8-d9890a58e4b1','618ac1ee-3da6-46c3-bba7-5454132f58d0','5d4466d8-66b1-4dd9-b9c8-c33ca101184e',8,8,8,8,8,8,8.00,true,null,'2026-05-08T07:12:50.238527+00:00'),
--           ('1c841406-dfea-4f3a-9bca-9f5dbf09e15b','ea68de42-544c-4337-b6de-d3cea82affa6','0d19b99d-06bd-4854-85d5-caaa1730ecd0',8,8,8,8,8,8,8.00,true,null,'2026-05-11T11:35:35.489661+00:00'),
--           ('f2c234d0-b7ed-403d-a9c2-acf12d1ef8f3','ea68de42-544c-4337-b6de-d3cea82affa6','0d19b99d-06bd-4854-85d5-caaa1730ecd0',8,8,8,8,8,8,8.00,true,null,'2026-05-11T11:41:23.818467+00:00');
-- 3) 若要恢复视图的废弃分支与被摘掉的外键，需回退 062、20260629000000 与本迁移的改动
--    （见 git 历史）；外键定义在 044/046 的 create table 段里。
-- ============================================================================
