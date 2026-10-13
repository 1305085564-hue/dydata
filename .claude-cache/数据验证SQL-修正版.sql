-- ============================================================
-- 数据上传架构问题验证 SQL（修正版）
-- 2026-10-13
-- ============================================================

-- 第一步：检查表结构
-- ============================================================

-- 1. 检查关键表是否存在
SELECT
  table_name,
  table_type,
  table_schema
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('content_items', 'content_item', 'videos', 'daily_reports')
ORDER BY table_name;

-- 2. 如果 content_items 是视图，查看其定义
SELECT
  schemaname,
  viewname,
  definition
FROM pg_views
WHERE schemaname = 'public'
  AND viewname IN ('content_items', 'content_item');


-- 第二步：查看何静和张超的实际数据
-- ============================================================

-- 3. 何静和张超的用户 ID
SELECT
  id,
  name,
  team_id,
  created_at,
  status,
  membership_status
FROM profiles
WHERE name IN ('何静', '张超')
ORDER BY name;

-- 4. 他们的 videos 记录（最近30天）
SELECT
  v.id,
  v.user_id,
  p.name AS user_name,
  v.video_title,
  v.published_at::date AS published_date,
  v.uploaded_at,
  v.lifecycle_state,
  v.created_at
FROM videos v
JOIN profiles p ON p.id = v.user_id
WHERE p.name IN ('何静', '张超')
  AND v.uploaded_at >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY p.name, v.uploaded_at DESC;

-- 5. 他们的 daily_reports 记录（最近30天）
SELECT
  dr.id,
  dr.user_id,
  p.name AS user_name,
  dr.report_date,
  dr.title,
  dr.is_void,
  dr.data_source,
  dr.uploaded_at,
  dr.created_at
FROM daily_reports dr
JOIN profiles p ON p.id = dr.user_id
WHERE p.name IN ('何静', '张超')
  AND dr.uploaded_at >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY p.name, dr.uploaded_at DESC;


-- 第三步：对比分析 - 找出缺失的记录
-- ============================================================

-- 6. 核心诊断：videos 有但 daily_reports 没有的记录
WITH user_filter AS (
  SELECT id, name
  FROM profiles
  WHERE name IN ('何静', '张超')
)
SELECT
  v.id AS video_id,
  v.user_id,
  uf.name AS user_name,
  v.video_title,
  v.published_at::date AS published_date,
  v.uploaded_at::date AS uploaded_date,
  v.lifecycle_state,
  CASE
    WHEN dr.id IS NULL THEN '❌ daily_reports 完全缺失'
    WHEN dr.is_void = true THEN '⚠️ daily_reports 被标记无效 (is_void=true)'
    ELSE '✅ daily_reports 正常'
  END AS daily_report_status,
  dr.id AS daily_report_id,
  dr.is_void AS dr_is_void,
  dr.data_source AS dr_data_source
FROM videos v
JOIN user_filter uf ON uf.id = v.user_id
LEFT JOIN daily_reports dr
  ON dr.video_id = v.id
  AND dr.user_id = v.user_id
WHERE v.uploaded_at >= CURRENT_DATE - INTERVAL '30 days'
  AND v.lifecycle_state = 'active'
ORDER BY uf.name, v.uploaded_at DESC;

-- 7. 统计：每个用户的数据完整性情况
WITH user_filter AS (
  SELECT id, name
  FROM profiles
  WHERE name IN ('何静', '张超')
),
video_stats AS (
  SELECT
    uf.name AS user_name,
    COUNT(*) AS total_videos,
    COUNT(dr.id) AS has_daily_report,
    COUNT(*) - COUNT(dr.id) AS missing_daily_report,
    COUNT(CASE WHEN dr.is_void = true THEN 1 END) AS void_daily_reports
  FROM videos v
  JOIN user_filter uf ON uf.id = v.user_id
  LEFT JOIN daily_reports dr
    ON dr.video_id = v.id
    AND dr.user_id = v.user_id
  WHERE v.uploaded_at >= CURRENT_DATE - INTERVAL '30 days'
    AND v.lifecycle_state = 'active'
  GROUP BY uf.name
)
SELECT
  user_name,
  total_videos AS "上传视频总数",
  has_daily_report AS "有日报记录",
  missing_daily_report AS "缺失日报记录",
  void_daily_reports AS "无效日报记录",
  CASE
    WHEN total_videos = 0 THEN '无数据'
    WHEN missing_daily_report = 0 AND void_daily_reports = 0 THEN '✅ 数据完整'
    WHEN missing_daily_report > 0 THEN '❌ 严重：有缺失记录'
    WHEN void_daily_reports > 0 THEN '⚠️ 警告：有无效记录'
  END AS 数据状态
FROM video_stats
ORDER BY user_name;


-- 第四步：检查 content_items 表的实际情况
-- ============================================================

-- 8. 尝试直接查询 content_items 表（如果存在）
-- 注意：如果这个查询失败（表不存在），说明 content_items 是错误的表名
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'content_items'
  ) THEN
    RAISE NOTICE '✅ content_items 表存在';

    -- 查询何静和张超在 content_items 的记录
    PERFORM * FROM (
      SELECT
        ci.id,
        ci.user_id,
        p.name AS user_name,
        ci.published_date,
        ci.created_at
      FROM content_items ci
      JOIN profiles p ON p.id = ci.user_id
      WHERE p.name IN ('何静', '张超')
        AND ci.published_date >= CURRENT_DATE - INTERVAL '30 days'
      ORDER BY p.name, ci.published_date DESC
      LIMIT 10
    ) AS content_items_data;
  ELSE
    RAISE NOTICE '❌ content_items 表不存在';
  END IF;
END $$;

-- 9. 检查是否有 content_items 的视图或物化视图
SELECT
  schemaname AS schema_name,
  viewname AS view_name,
  viewowner AS owner,
  definition AS view_definition
FROM pg_views
WHERE schemaname = 'public'
  AND viewname = 'content_items';

-- 如果是物化视图
SELECT
  schemaname AS schema_name,
  matviewname AS materialized_view_name,
  matviewowner AS owner,
  definition AS view_definition
FROM pg_matviews
WHERE schemaname = 'public'
  AND matviewname = 'content_items';


-- 第五步：检查发布履约 RPC 的实际行为
-- ============================================================

-- 10. 测试发布履约 RPC（仅查看最近7天）
-- 注意：这会实际执行 RPC，看是否报错
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
ORDER BY user_name, record_date DESC
LIMIT 20;


-- 第六步：找出所有缺失 daily_reports 的 videos
-- ============================================================

-- 11. 全局扫描：所有用户中缺失 daily_reports 的 videos
SELECT
  COUNT(*) AS 缺失记录总数,
  COUNT(DISTINCT v.user_id) AS 受影响用户数,
  MIN(v.uploaded_at::date) AS 最早缺失日期,
  MAX(v.uploaded_at::date) AS 最近缺失日期
FROM videos v
LEFT JOIN daily_reports dr
  ON dr.video_id = v.id
  AND dr.user_id = v.user_id
WHERE v.lifecycle_state = 'active'
  AND v.published_at IS NOT NULL
  AND v.uploaded_at >= CURRENT_DATE - INTERVAL '90 days'
  AND dr.id IS NULL;

-- 12. 按日期统计缺失情况（看是否集中在某个时间段）
SELECT
  v.uploaded_at::date AS upload_date,
  COUNT(*) AS missing_count,
  COUNT(DISTINCT v.user_id) AS affected_users
FROM videos v
LEFT JOIN daily_reports dr
  ON dr.video_id = v.id
  AND dr.user_id = v.user_id
WHERE v.lifecycle_state = 'active'
  AND v.published_at IS NOT NULL
  AND v.uploaded_at >= CURRENT_DATE - INTERVAL '30 days'
  AND dr.id IS NULL
GROUP BY v.uploaded_at::date
ORDER BY v.uploaded_at::date DESC;
