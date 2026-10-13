-- 验证张超本月的 videos 和 daily_reports

SELECT
  v.id AS video_id,
  v.video_title,
  v.published_at,
  v.uploaded_at AS video_uploaded_at,
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
WHERE p.name = '张超'
  AND v.published_at >= '2026-10-01'
ORDER BY v.published_at DESC;
