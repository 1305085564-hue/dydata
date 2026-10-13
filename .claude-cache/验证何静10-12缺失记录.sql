-- 验证何静 10-12 的 videos 和 daily_reports 是否一一对应

-- 查询何静 10-12 的 videos，左连接 daily_reports
SELECT
  v.id AS video_id,
  v.video_title,
  v.published_at,
  v.uploaded_at AS video_uploaded_at,
  v.lifecycle_state,
  dr.id AS daily_report_id,
  dr.title AS report_title,
  dr.report_date,
  dr.uploaded_at AS report_uploaded_at,
  CASE
    WHEN dr.id IS NULL THEN '❌ daily_reports 缺失'
    WHEN dr.is_void = true THEN '⚠️ is_void = true'
    ELSE '✅ 正常'
  END AS status
FROM videos v
JOIN profiles p ON p.id = v.user_id
LEFT JOIN daily_reports dr
  ON dr.video_id = v.id
WHERE p.name = '何静'
  AND v.published_at::date = '2026-10-12'
ORDER BY v.uploaded_at;
