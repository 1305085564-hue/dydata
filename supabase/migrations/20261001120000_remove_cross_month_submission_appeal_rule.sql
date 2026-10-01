-- 72 小时门禁只看真实发布时间到提交时间的自然小时差，跨月本身不再触发补交。
update public.notifications
set body = '作品日期按平台真实发布时间计算；超过 72 小时需要申请补交并等待管理审批。'
where source_type = 'video_submission_policy'
  and source_id = '2026-09-30-v1';
