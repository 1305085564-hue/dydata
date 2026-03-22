CREATE TABLE IF NOT EXISTS public.content_asset (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id uuid REFERENCES public.content_item(id) ON DELETE CASCADE,
  asset_role text NOT NULL
    CHECK (asset_role IN ('overview','traffic_curve','retention_curve','engagement_extra','other')),
  upload_order integer,
  sha256 text,
  phash text,
  width integer,
  height integer,
  file_size_bytes integer,
  storage_url text,
  thumbnail_url text,
  asset_status text DEFAULT 'pending'
    CHECK (asset_status IN ('pending','uploaded','parsing','parsed','failed','confirmed')),
  parse_status text,
  ocr_confidence numeric,
  ocr_result_json jsonb,
  is_current_version boolean DEFAULT true,
  version_number integer DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_asset_content_item_id
  ON public.content_asset(content_item_id);

CREATE INDEX IF NOT EXISTS idx_content_asset_asset_role
  ON public.content_asset(asset_role);

ALTER TABLE public.content_asset ENABLE ROW LEVEL SECURITY;

CREATE POLICY "通过内容项继承读取素材权限"
  ON public.content_asset
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.content_item
      WHERE content_item.id = content_asset.content_item_id
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

CREATE POLICY "通过内容项继承写入素材权限"
  ON public.content_asset
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.content_item
      WHERE content_item.id = content_asset.content_item_id
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

CREATE POLICY "通过内容项继承更新素材权限"
  ON public.content_asset
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.content_item
      WHERE content_item.id = content_asset.content_item_id
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
      WHERE content_item.id = content_asset.content_item_id
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

CREATE POLICY "通过内容项继承删除素材权限"
  ON public.content_asset
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.content_item
      WHERE content_item.id = content_asset.content_item_id
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

CREATE TABLE IF NOT EXISTS public.field_provenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid REFERENCES public.metric_snapshot(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  source_asset_id uuid REFERENCES public.content_asset(id) ON DELETE SET NULL,
  ocr_value text,
  ocr_confidence numeric,
  manual_override_value text,
  manual_override_by uuid,
  final_value text,
  confirmed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_field_provenance_snapshot_id
  ON public.field_provenance(snapshot_id);

CREATE INDEX IF NOT EXISTS idx_field_provenance_source_asset_id
  ON public.field_provenance(source_asset_id);

ALTER TABLE public.field_provenance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "通过快照继承读取字段来源权限"
  ON public.field_provenance
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.metric_snapshot
      JOIN public.content_item
        ON content_item.id = metric_snapshot.content_item_id
      WHERE metric_snapshot.id = field_provenance.snapshot_id
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

CREATE POLICY "通过快照继承写入字段来源权限"
  ON public.field_provenance
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.metric_snapshot
      JOIN public.content_item
        ON content_item.id = metric_snapshot.content_item_id
      WHERE metric_snapshot.id = field_provenance.snapshot_id
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

CREATE POLICY "通过快照继承更新字段来源权限"
  ON public.field_provenance
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.metric_snapshot
      JOIN public.content_item
        ON content_item.id = metric_snapshot.content_item_id
      WHERE metric_snapshot.id = field_provenance.snapshot_id
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
      FROM public.metric_snapshot
      JOIN public.content_item
        ON content_item.id = metric_snapshot.content_item_id
      WHERE metric_snapshot.id = field_provenance.snapshot_id
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

CREATE POLICY "通过快照继承删除字段来源权限"
  ON public.field_provenance
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.metric_snapshot
      JOIN public.content_item
        ON content_item.id = metric_snapshot.content_item_id
      WHERE metric_snapshot.id = field_provenance.snapshot_id
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
