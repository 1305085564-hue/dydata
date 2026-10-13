-- 验证历史手稿的查询逻辑问题

-- 1. 模拟历史手稿的查询（何静的前30条记录）
WITH he_jing_accounts AS (
  SELECT id FROM accounts WHERE profile_id = (
    SELECT id FROM profiles WHERE name = '何静'
  )
)
SELECT
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
LIMIT 40;

-- 2. 检查何静 10-12 的记录在排序中的位置
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
SELECT * FROM ranked
WHERE pub_date = '2026-10-12'
ORDER BY row_num;

-- 3. 张超的记录排序情况
WITH zhang_chao_accounts AS (
  SELECT id FROM accounts WHERE profile_id = (
    SELECT id FROM profiles WHERE name = '张超'
  )
)
SELECT
  id,
  title,
  report_date,
  published_at,
  uploaded_at,
  ROW_NUMBER() OVER (
    ORDER BY published_at DESC NULLS LAST, uploaded_at DESC
  ) AS row_num
FROM daily_reports
WHERE account_id IN (SELECT id FROM zhang_chao_accounts)
  AND is_void = false
ORDER BY published_at DESC NULLS LAST, uploaded_at DESC
LIMIT 40;
