-- 重新验证：查看何静 10-12 的具体记录

-- 1. 何静在 10-12 的 videos 记录
SELECT
  v.id,
  v.video_title,
  v.published_at,
  v.uploaded_at,
  v.lifecycle_state,
  v.created_at
FROM videos v
JOIN profiles p ON p.id = v.user_id
WHERE p.name = '何静'
  AND v.published_at::date = '2026-10-12'
ORDER BY v.published_at;

-- 2. 何静在 10-12 的 daily_reports 记录
SELECT
  dr.id,
  dr.title,
  dr.report_date,
  dr.is_void,
  dr.uploaded_at,
  dr.video_id,
  dr.created_at
FROM daily_reports dr
JOIN profiles p ON p.id = dr.user_id
WHERE p.name = '何静'
  AND dr.report_date = '2026-10-12'
ORDER BY dr.uploaded_at;

-- 3. 对比：何静 10-12 的 videos 和 daily_reports
SELECT
  v.id AS video_id,
  v.video_title,
  v.published_at,
  v.uploaded_at AS video_uploaded_at,
  dr.id AS daily_report_id,
  dr.title AS report_title,
  dr.uploaded_at AS report_uploaded_at,
  dr.is_void,
  CASE
    WHEN dr.id IS NULL THEN '❌ daily_reports 缺失'
    WHEN dr.is_void = true THEN '⚠️ daily_reports 被标记无效'
    ELSE '✅ daily_reports 正常'
  END AS status
FROM videos v
JOIN profiles p ON p.id = v.user_id
LEFT JOIN daily_reports dr
  ON dr.video_id = v.id
  AND dr.user_id = v.user_id
WHERE p.name = '何静'
  AND v.published_at::date = '2026-10-12'
ORDER BY v.published_at;

-- 4. 张超最近的所有上传记录（最近30天）
SELECT
  v.id AS video_id,
  v.video_title,
  v.published_at::date AS published_date,
  v.uploaded_at::date AS uploaded_date,
  dr.id AS daily_report_id,
  CASE
    WHEN dr.id IS NULL THEN '❌ daily_reports 缺失'
    WHEN dr.is_void = true THEN '⚠️ daily_reports 被标记无效'
    ELSE '✅ daily_reports 正常'
  END AS status
FROM videos v
JOIN profiles p ON p.id = v.user_id
LEFT JOIN daily_reports dr
  ON dr.video_id = v.id
  AND dr.user_id = v.user_id
WHERE p.name = '张超'
  AND v.uploaded_at >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY v.uploaded_at DESC;

-- 5. 关键：检查 account_id 是否匹配
-- 历史手稿查询的是 account_id，而不是 user_id
SELECT
  p.id AS user_id,
  p.name AS user_name,
  a.id AS account_id,
  a.name AS account_name,
  COUNT(dr.id) AS daily_reports_count
FROM profiles p
LEFT JOIN accounts a ON a.profile_id = p.id
LEFT JOIN daily_reports dr ON dr.account_id = a.id
WHERE p.name IN ('何静', '张超')
  AND dr.report_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY p.id, p.name, a.id, a.name
ORDER BY p.name, a.name;
