-- 006: 新增文案内容和发布时间字段
ALTER TABLE public.daily_reports ADD COLUMN IF NOT EXISTS content text;
ALTER TABLE public.daily_reports ADD COLUMN IF NOT EXISTS published_at timestamptz;

-- 发布时间索引（仅非空行）
CREATE INDEX IF NOT EXISTS daily_reports_published_at_idx
  ON public.daily_reports (published_at) WHERE published_at IS NOT NULL;
