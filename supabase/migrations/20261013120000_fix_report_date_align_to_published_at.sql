-- 修复历史数据：report_date 对齐到 published_at 的日期
-- 背景：之前 report_date 使用用户输入的 biz_date，导致今天上传历史数据时归属日期错误
-- 修复：将所有 report_date 对齐到 published_at 的上海时区日期

UPDATE daily_reports
SET report_date = (published_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Shanghai')::date
WHERE published_at IS NOT NULL
  AND report_date != (published_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Shanghai')::date;
