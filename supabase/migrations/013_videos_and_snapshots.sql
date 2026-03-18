-- 视频主表
CREATE TABLE IF NOT EXISTS public.videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  video_url text,
  video_title text,
  content text,
  published_at timestamptz,
  uploaded_at timestamptz DEFAULT now(),
  anomaly_status text DEFAULT '正常' CHECK (anomaly_status IN ('正常','删稿','限流','投流','活动干预','未满24h')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_videos_account ON public.videos(account_id);
CREATE INDEX idx_videos_user ON public.videos(user_id);
CREATE INDEX idx_videos_published ON public.videos(published_at);

ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "员工看自己的视频" ON public.videos
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "员工创建自己的视频" ON public.videos
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "员工更新自己的视频" ON public.videos
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "管理员看全部视频" ON public.videos
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','owner'))
  );

CREATE POLICY "管理员管理全部视频" ON public.videos
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','owner'))
  );

-- 视频指标快照表
CREATE TABLE IF NOT EXISTS public.video_metrics_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  snapshot_type text NOT NULL CHECK (snapshot_type IN ('24h','72h')),
  play_count bigint DEFAULT 0,
  likes int DEFAULT 0,
  comments int DEFAULT 0,
  shares int DEFAULT 0,
  favorites int DEFAULT 0,
  follower_gain int DEFAULT 0,
  follower_loss int DEFAULT 0,
  fan_play_ratio numeric,
  homepage_visits int DEFAULT 0,
  follower_convert int DEFAULT 0,
  cover_click_rate numeric,
  avg_play_duration numeric,
  completion_rate numeric,
  bounce_rate_2s numeric,
  completion_rate_5s numeric,
  avg_play_ratio numeric,
  vs_previous jsonb,
  screenshot_urls text[],
  curve_screenshot_url text,
  retention_screenshot_url text,
  captured_at timestamptz DEFAULT now()
);

CREATE INDEX idx_snapshots_video ON public.video_metrics_snapshots(video_id);

ALTER TABLE public.video_metrics_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "通过视频继承读权限" ON public.video_metrics_snapshots
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.videos WHERE id = video_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','owner'))
  );

CREATE POLICY "员工创建自己视频的快照" ON public.video_metrics_snapshots
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.videos WHERE id = video_id AND user_id = auth.uid())
  );

CREATE POLICY "员工更新自己视频的快照" ON public.video_metrics_snapshots
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.videos WHERE id = video_id AND user_id = auth.uid())
  );

CREATE POLICY "管理员管理全部快照" ON public.video_metrics_snapshots
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','owner'))
  );
