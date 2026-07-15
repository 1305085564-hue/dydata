-- 批次一：视频表承载异常/违规详情，保留旧中文状态兼容读取。
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS punish_type text,
  ADD COLUMN IF NOT EXISTS platform_notice text,
  ADD COLUMN IF NOT EXISTS appeal text;

ALTER TABLE public.videos
  DROP CONSTRAINT IF EXISTS videos_anomaly_status_check;

ALTER TABLE public.videos
  ADD CONSTRAINT videos_anomaly_status_check
  CHECK (anomaly_status IN ('normal','abnormal','正常','删稿','限流','投流','活动干预','未满24h'));

ALTER TABLE public.videos
  DROP CONSTRAINT IF EXISTS videos_punish_type_check;

ALTER TABLE public.videos
  ADD CONSTRAINT videos_punish_type_check
  CHECK (
    punish_type IS NULL OR
    punish_type IN ('limited','deleted','paid_boost','campaign_intervention','other')
  );

CREATE INDEX IF NOT EXISTS idx_videos_anomaly_status_uploaded
  ON public.videos(anomaly_status, uploaded_at DESC);
