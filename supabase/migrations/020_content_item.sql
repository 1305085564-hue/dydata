CREATE TABLE IF NOT EXISTS public.content_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid REFERENCES public.submission_batch(id) ON DELETE SET NULL,
  org_id uuid,
  team_id uuid,
  account_id uuid,
  owner_user_id uuid REFERENCES auth.users(id),
  biz_date date NOT NULL,
  task_date date,
  publish_at timestamptz,
  publish_precision text DEFAULT 'unknown'
    CHECK (publish_precision IN ('minute','hour','date','unknown')),
  publish_time_text text,
  uploaded_at timestamptz,
  submitted_at timestamptz,
  content_status text DEFAULT 'draft',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_item_batch_id
  ON public.content_item(batch_id);

CREATE INDEX IF NOT EXISTS idx_content_item_owner_user_id
  ON public.content_item(owner_user_id);

CREATE INDEX IF NOT EXISTS idx_content_item_account_id
  ON public.content_item(account_id);

CREATE INDEX IF NOT EXISTS idx_content_item_biz_date
  ON public.content_item(biz_date);

CREATE INDEX IF NOT EXISTS idx_content_item_task_date
  ON public.content_item(task_date);

ALTER TABLE public.content_item ENABLE ROW LEVEL SECURITY;

CREATE POLICY "用户读取自己的内容项"
  ON public.content_item
  FOR SELECT
  USING (
    owner_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.submission_batch
      WHERE submission_batch.id = content_item.batch_id
        AND submission_batch.submitter_user_id = auth.uid()
    )
    OR public.is_admin()
  );

CREATE POLICY "用户创建自己的内容项"
  ON public.content_item
  FOR INSERT
  WITH CHECK (
    owner_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.submission_batch
      WHERE submission_batch.id = content_item.batch_id
        AND submission_batch.submitter_user_id = auth.uid()
    )
    OR public.is_admin()
  );

CREATE POLICY "用户更新自己的内容项"
  ON public.content_item
  FOR UPDATE
  USING (
    owner_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.submission_batch
      WHERE submission_batch.id = content_item.batch_id
        AND submission_batch.submitter_user_id = auth.uid()
    )
    OR public.is_admin()
  )
  WITH CHECK (
    owner_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.submission_batch
      WHERE submission_batch.id = content_item.batch_id
        AND submission_batch.submitter_user_id = auth.uid()
    )
    OR public.is_admin()
  );

CREATE POLICY "用户删除自己的内容项"
  ON public.content_item
  FOR DELETE
  USING (
    owner_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.submission_batch
      WHERE submission_batch.id = content_item.batch_id
        AND submission_batch.submitter_user_id = auth.uid()
    )
    OR public.is_admin()
  );
