-- 退役管理中心系统设置后的数据库残留清理。
-- system_settings 表本身仍由履约提醒和选题库使用。
BEGIN;

DELETE FROM public.system_settings
WHERE key = 'video_review_thresholds';

DROP FUNCTION IF EXISTS public.get_daily_quota(date);
DROP TABLE IF EXISTS public.daily_quota_config;

COMMIT;
