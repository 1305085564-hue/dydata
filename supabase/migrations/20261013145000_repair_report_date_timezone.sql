-- Correct any legacy report_date values using the publication date in Shanghai.
-- This also repairs rows affected by the earlier double-timezone expression.
UPDATE public.daily_reports
SET report_date = (published_at AT TIME ZONE 'Asia/Shanghai')::date
WHERE published_at IS NOT NULL
  AND report_date <> (published_at AT TIME ZONE 'Asia/Shanghai')::date;
