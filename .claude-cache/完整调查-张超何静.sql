-- 完整调查：张超和何静的数据问题

-- 1. 张超最近 60 天的所有上传记录
SELECT
  '张超最近60天上传' AS 查询,
  v.id AS video_id,
  v.video_title,
  v.published_at,
  v.uploaded_at,
  dr.report_date,
  dr.id AS daily_report_id,
  CASE
    WHEN dr.id IS NULL THEN '❌ daily_reports 缺失'
    WHEN dr.is_void = true THEN '⚠️ is_void = true'
    ELSE '✅ 正常'
  END AS status
FROM videos v
JOIN profiles p ON p.id = v.user_id
LEFT JOIN daily_reports dr ON dr.video_id = v.id
WHERE p.name = '张超'
  AND v.uploaded_at >= CURRENT_DATE - INTERVAL '60 days'
ORDER BY v.uploaded_at DESC;

-- 2. 何静 10-12 的记录详情（检查 report_date 是否正确）
SELECT
  '何静10-12记录详情' AS 查询,
  v.id AS video_id,
  v.video_title,
  v.published_at,
  v.uploaded_at,
  dr.report_date,
  dr.uploaded_at AS report_uploaded_at,
  CASE
    WHEN dr.report_date::date = v.published_at::date THEN '✅ report_date 正确'
    ELSE '❌ report_date 错误'
  END AS report_date_check
FROM videos v
JOIN profiles p ON p.id = v.user_id
JOIN daily_reports dr ON dr.video_id = v.id
WHERE p.name = '何静'
  AND v.published_at::date = '2026-10-12'
ORDER BY v.published_at;

-- 3. 历史手稿查询逻辑验证（何静的前 30 条）
WITH he_jing_accounts AS (
  SELECT id FROM accounts WHERE profile_id = (
    SELECT id FROM profiles WHERE name = '何静'
  )
)
SELECT
  '何静历史手稿前30条' AS 查询,
  id,
  title,
  report_date,
  published_at,
  uploaded_at,
  ROW_NUMBER() OVER (
    ORDER BY published_at DESC NULLS LAST, uploaded_at DESC
  ) AS row_num
FROM daily_reports
WHERE account_id IN (SELECT id FROM he_jing_accounts)
  AND is_void = false
ORDER BY published_at DESC NULLS LAST, uploaded_at DESC
LIMIT 30;

-- 4. 检查 10-12 的记录在历史手稿中的排名
WITH he_jing_accounts AS (
  SELECT id FROM accounts WHERE profile_id = (
    SELECT id FROM profiles WHERE name = '何静'
  )
),
ranked AS (
  SELECT
    id,
    title,
    report_date,
    published_at::date AS pub_date,
    uploaded_at::date AS upload_date,
    ROW_NUMBER() OVER (
      ORDER BY published_at DESC NULLS LAST, uploaded_at DESC
    ) AS row_num
  FROM daily_reports
  WHERE account_id IN (SELECT id FROM he_jing_accounts)
    AND is_void = false
)
SELECT
  '何静10-12在历史手稿中的位置' AS 查询,
  *
FROM ranked
WHERE pub_date = '2026-10-12'
ORDER BY row_num;
