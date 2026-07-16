-- 异常视频提交 -> 避坑案例待审核池
-- 1. 保留视频来源和提交时的异常上下文
-- 2. 支持管理员标注违规段落
-- 3. 收紧员工读取与写入边界，管理员继续按既有权限审核

ALTER TABLE public.violation_cases
  ADD COLUMN IF NOT EXISTS source_video_id uuid REFERENCES public.videos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS highlighted_sections jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_violation_cases_source_video_id_unique
  ON public.violation_cases (source_video_id)
  WHERE source_video_id IS NOT NULL;

COMMENT ON COLUMN public.violation_cases.source_video_id
  IS '异常案例关联的原始视频；同一视频最多生成一条案例';
COMMENT ON COLUMN public.violation_cases.source_metadata
  IS '异常视频提交来源上下文：平台通知、处罚类型、申诉、视频标题和链接';
COMMENT ON COLUMN public.violation_cases.highlighted_sections
  IS '管理员标注的违规段落：start/end/text/reason/created_at 数组';

DROP POLICY IF EXISTS "vc_select" ON public.violation_cases;
CREATE POLICY "vc_select" ON public.violation_cases
  FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND is_deleted = false
    AND (
      status = 'verified'
      OR public.has_violation_permission()
    )
  );

DROP POLICY IF EXISTS "vc_insert" ON public.violation_cases;
CREATE POLICY "vc_insert" ON public.violation_cases
  FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND auth.uid() = submitted_by
    AND status = 'submitted'
    AND is_deleted = false
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND highlighted_sections = '[]'::jsonb
    AND (account_id IS NULL OR public.owns_account(account_id))
    AND (
      source_video_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.videos v
        WHERE v.id = source_video_id
          AND v.user_id = auth.uid()
          AND v.account_id = violation_cases.account_id
      )
    )
  );
