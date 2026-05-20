-- 070_video_review.sql
-- 2026-05-19 视频复盘台核心表
-- 串联：视频提交 → AI 初诊 → 人工复核 → 反馈下发 → 复验结果

CREATE TABLE IF NOT EXISTS video_review (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  reviewer_id UUID REFERENCES profiles(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ai_done', 'reviewing', 'feedback_sent', 'verified', 'archived')),
  ai_diagnosis JSONB,
  ai_diagnosis_at TIMESTAMPTZ,
  manual_review_notes TEXT,
  feedback_card JSONB,
  feedback_sent_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  verified_result TEXT CHECK (verified_result IN ('improved', 'same', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE video_review ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view video reviews within scope"
  ON video_review FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Reviewers with permission can update video reviews"
  ON video_review FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin'))
      OR
      EXISTS (
        SELECT 1 FROM profiles p
        JOIN video_review vr ON vr.reviewer_id = p.id
        WHERE p.id = auth.uid()
      )
    )
  );

CREATE POLICY "Group leaders with review_diagnosis permission can insert"
  ON video_review FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE OR REPLACE FUNCTION refresh_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER video_review_updated_at
  BEFORE UPDATE ON video_review
  FOR EACH ROW EXECUTE FUNCTION refresh_updated_at();

COMMENT ON TABLE video_review IS '视频复盘台：串联视频提交→AI初诊→人工复核→反馈下发→复验';
COMMENT ON COLUMN video_review.status IS 'pending=待诊断, ai_done=AI完成, reviewing=复核中, feedback_sent=已发反馈, verified=已复验, archived=已归档';
COMMENT ON COLUMN video_review.feedback_card IS '发给组员的反馈卡片结构 {title, action, reason, example}';
