-- Cleanup Deprecated Tables (Migration 051)
-- 彻底删除历史遗留的僵尸表和已弃用的半成品表

-- 1. 变体功能表
DROP TABLE IF EXISTS "rewrite_variants" CASCADE;

-- 2. SOP 六维度评估分表
DROP TABLE IF EXISTS "sop_review_scores" CASCADE;

-- 3. V1 固定润色模式配置表
DROP TABLE IF EXISTS "rewrite_fixed_modes" CASCADE;

-- 4. 长度字数预设配置表
DROP TABLE IF EXISTS "rewrite_length_presets" CASCADE;

-- 5. V1 流水线步骤配置表
DROP TABLE IF EXISTS "rewrite_workflow_steps" CASCADE;

-- 6. V1 流水线主表
DROP TABLE IF EXISTS "rewrite_workflows" CASCADE;
