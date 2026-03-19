CREATE TABLE IF NOT EXISTS public.video_content_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  segment_type text NOT NULL CHECK (segment_type IN ('封面标题','开头钩子','背景铺垫','核心观点','展开论证','操作建议','CTA')),
  segment_text text NOT NULL,
  segment_order int NOT NULL,
  estimated_start_sec numeric(10,2) NOT NULL,
  estimated_end_sec numeric(10,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_content_segments_video_id
  ON public.video_content_segments(video_id, segment_order);

ALTER TABLE public.video_content_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "通过视频继承读取切段权限" ON public.video_content_segments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.videos
      WHERE videos.id = video_content_segments.video_id
      AND videos.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin','owner')
    )
  );

CREATE POLICY "通过视频继承写入切段权限" ON public.video_content_segments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.videos
      WHERE videos.id = video_content_segments.video_id
      AND videos.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin','owner')
    )
  );

CREATE POLICY "通过视频继承更新切段权限" ON public.video_content_segments
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.videos
      WHERE videos.id = video_content_segments.video_id
      AND videos.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin','owner')
    )
  );

CREATE POLICY "通过视频继承删除切段权限" ON public.video_content_segments
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.videos
      WHERE videos.id = video_content_segments.video_id
      AND videos.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin','owner')
    )
  );
