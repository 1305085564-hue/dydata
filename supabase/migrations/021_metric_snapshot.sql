CREATE TABLE IF NOT EXISTS public.metric_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id uuid REFERENCES public.content_item(id) ON DELETE CASCADE,
  snapshot_type text DEFAULT '24h' CHECK (snapshot_type IN ('24h','72h')),
  play_count integer,
  follower_gain integer,
  lead_count integer,
  like_count integer,
  comment_count integer,
  share_count integer,
  favorite_count integer,
  avg_watch_sec numeric,
  bounce_2s_rate numeric,
  completion_5s_rate numeric,
  full_completion_rate numeric,
  ocr_confidence_avg numeric,
  manual_edit_count integer DEFAULT 0,
  data_quality_state text DEFAULT 'pending',
  source_completeness_score numeric,
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_metric_snapshot_content_item_id
  ON public.metric_snapshot(content_item_id);

CREATE INDEX IF NOT EXISTS idx_metric_snapshot_snapshot_type
  ON public.metric_snapshot(snapshot_type);

ALTER TABLE public.metric_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "通过内容项继承读取快照权限"
  ON public.metric_snapshot
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.content_item
      WHERE content_item.id = metric_snapshot.content_item_id
        AND (
          content_item.owner_user_id = auth.uid()
          OR public.is_admin()
          OR EXISTS (
            SELECT 1
            FROM public.submission_batch
            WHERE submission_batch.id = content_item.batch_id
              AND submission_batch.submitter_user_id = auth.uid()
          )
        )
    )
  );

CREATE POLICY "通过内容项继承写入快照权限"
  ON public.metric_snapshot
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.content_item
      WHERE content_item.id = metric_snapshot.content_item_id
        AND (
          content_item.owner_user_id = auth.uid()
          OR public.is_admin()
          OR EXISTS (
            SELECT 1
            FROM public.submission_batch
            WHERE submission_batch.id = content_item.batch_id
              AND submission_batch.submitter_user_id = auth.uid()
          )
        )
    )
  );

CREATE POLICY "通过内容项继承更新快照权限"
  ON public.metric_snapshot
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.content_item
      WHERE content_item.id = metric_snapshot.content_item_id
        AND (
          content_item.owner_user_id = auth.uid()
          OR public.is_admin()
          OR EXISTS (
            SELECT 1
            FROM public.submission_batch
            WHERE submission_batch.id = content_item.batch_id
              AND submission_batch.submitter_user_id = auth.uid()
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.content_item
      WHERE content_item.id = metric_snapshot.content_item_id
        AND (
          content_item.owner_user_id = auth.uid()
          OR public.is_admin()
          OR EXISTS (
            SELECT 1
            FROM public.submission_batch
            WHERE submission_batch.id = content_item.batch_id
              AND submission_batch.submitter_user_id = auth.uid()
          )
        )
    )
  );

CREATE POLICY "通过内容项继承删除快照权限"
  ON public.metric_snapshot
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.content_item
      WHERE content_item.id = metric_snapshot.content_item_id
        AND (
          content_item.owner_user_id = auth.uid()
          OR public.is_admin()
          OR EXISTS (
            SELECT 1
            FROM public.submission_batch
            WHERE submission_batch.id = content_item.batch_id
              AND submission_batch.submitter_user_id = auth.uid()
          )
        )
    )
  );
