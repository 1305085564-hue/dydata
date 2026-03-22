CREATE TABLE IF NOT EXISTS public.submission_batch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid,
  team_id uuid,
  submitter_user_id uuid REFERENCES auth.users(id),
  task_date date NOT NULL,
  batch_status text NOT NULL DEFAULT 'draft'
    CHECK (batch_status IN ('draft','processing','need_confirm','ready_submit','submitted','returned','deleted')),
  idempotency_key text UNIQUE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_submission_batch_submitter_user_id
  ON public.submission_batch(submitter_user_id);

CREATE INDEX IF NOT EXISTS idx_submission_batch_task_date
  ON public.submission_batch(task_date);

CREATE INDEX IF NOT EXISTS idx_submission_batch_org_team_task_date
  ON public.submission_batch(org_id, team_id, task_date);

ALTER TABLE public.submission_batch ENABLE ROW LEVEL SECURITY;

CREATE POLICY "用户读取自己的提交批次"
  ON public.submission_batch
  FOR SELECT
  USING (
    submitter_user_id = auth.uid()
    OR public.is_admin()
  );

CREATE POLICY "用户创建自己的提交批次"
  ON public.submission_batch
  FOR INSERT
  WITH CHECK (
    submitter_user_id = auth.uid()
    OR public.is_admin()
  );

CREATE POLICY "用户更新自己的提交批次"
  ON public.submission_batch
  FOR UPDATE
  USING (
    submitter_user_id = auth.uid()
    OR public.is_admin()
  )
  WITH CHECK (
    submitter_user_id = auth.uid()
    OR public.is_admin()
  );

CREATE POLICY "用户删除自己的提交批次"
  ON public.submission_batch
  FOR DELETE
  USING (
    submitter_user_id = auth.uid()
    OR public.is_admin()
  );
