-- 允许同一账号在同一天发布多篇不同作品，解除 (account_id, report_date) 唯一索引限制
-- 保持 public.daily_reports_video_id_key 唯一索引（每个有效视频只能绑定一篇有效日报），杜绝刷量与重复录入。

DROP INDEX IF EXISTS public.daily_reports_account_id_report_date_active_key;

-- 补建非唯一复合索引，确保基于 account_id + report_date 的查询依然维持高效 B-Tree 性能
CREATE INDEX IF NOT EXISTS idx_daily_reports_account_id_report_date 
ON public.daily_reports USING btree (account_id, report_date);
