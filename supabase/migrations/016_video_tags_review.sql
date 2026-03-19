ALTER TABLE public.video_tags
  ADD COLUMN IF NOT EXISTS reason text;

ALTER TABLE public.video_tags
  ADD CONSTRAINT video_tags_video_dimension_key UNIQUE (video_id, tag_dimension);

ALTER TABLE public.video_tags
  DROP CONSTRAINT IF EXISTS video_tags_confidence_check;

ALTER TABLE public.video_tags
  ADD CONSTRAINT video_tags_confidence_check CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));

DROP POLICY IF EXISTS "员工更新自己视频的标签" ON public.video_tags;
CREATE POLICY "员工更新自己视频的标签" ON public.video_tags
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.videos WHERE id = video_id AND user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.videos WHERE id = video_id AND user_id = auth.uid())
  );
