CREATE INDEX IF NOT EXISTS idx_videos_account_published_desc
  ON public.videos(account_id, published_at DESC);
