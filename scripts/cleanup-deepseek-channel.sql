-- 清理 DeepSeek 渠道的脏数据
-- 问题：DeepSeek 渠道挂载了所有全站模型，应该只保留 deepseek 相关模型

-- 步骤 1：查看当前状态（只读，安全）
SELECT
  k.id as key_id,
  k.label as channel_name,
  COUNT(*) as total_models,
  COUNT(CASE WHEN km.model_id ILIKE '%deepseek%' THEN 1 END) as deepseek_models,
  COUNT(CASE WHEN km.model_id NOT ILIKE '%deepseek%' THEN 1 END) as other_models
FROM ai_provider_keys k
JOIN ai_provider_key_models km ON km.key_id = k.id
WHERE k.label ILIKE '%deepseek%'
GROUP BY k.id, k.label;

-- 步骤 2：列出需要删除的模型（只读，确认）
SELECT
  km.id,
  k.label as channel_name,
  km.model_id,
  km.display_name,
  km.is_enabled
FROM ai_provider_keys k
JOIN ai_provider_key_models km ON km.key_id = k.id
WHERE k.label ILIKE '%deepseek%'
  AND km.model_id NOT ILIKE '%deepseek%'
ORDER BY k.label, km.model_id;

-- 步骤 3：删除不属于 DeepSeek 渠道的模型（危险操作，需要确认）
-- 取消下面的注释来执行删除
/*
DELETE FROM ai_provider_key_models
WHERE id IN (
  SELECT km.id
  FROM ai_provider_keys k
  JOIN ai_provider_key_models km ON km.key_id = k.id
  WHERE k.label ILIKE '%deepseek%'
    AND km.model_id NOT ILIKE '%deepseek%'
);
*/

-- 步骤 4：验证清理结果（只读）
SELECT
  k.id as key_id,
  k.label as channel_name,
  km.model_id,
  km.display_name,
  km.is_enabled,
  km.global_is_enabled
FROM ai_provider_keys k
JOIN ai_provider_key_models km ON km.key_id = k.id
WHERE k.label ILIKE '%deepseek%'
ORDER BY k.label, km.model_id;
