-- 验证修复效果
-- 测试发布履约 RPC 是否能正常工作

-- 1. 测试何静和张超的数据（最近7天）
SELECT
  user_name,
  record_date,
  status,
  published_count,
  consecutive_missing
FROM get_fulfillment_range(
  (CURRENT_DATE - INTERVAL '7 days')::date,
  CURRENT_DATE::date,
  (SELECT ARRAY_AGG(id) FROM profiles WHERE name IN ('何静', '张超')),
  NULL,
  NULL
)
WHERE user_name IN ('何静', '张超')
ORDER BY user_name, record_date DESC;

-- 2. 测试全局统计（今天）
SELECT
  status,
  COUNT(*) AS count
FROM get_fulfillment_range(
  CURRENT_DATE::date,
  CURRENT_DATE::date,
  NULL,
  NULL,
  NULL
)
GROUP BY status
ORDER BY count DESC;
