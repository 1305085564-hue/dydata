-- ============================================================
-- 055: 违规话术系统 V1
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_violation_permission()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND (
        role = 'owner'
        OR (role = 'admin' AND (permissions->>'manage_violations')::boolean = true)
      )
  );
$$;

CREATE TABLE IF NOT EXISTS public.violation_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  script_text text NOT NULL,
  is_violation boolean NOT NULL DEFAULT true,
  category text NOT NULL DEFAULT '其他'
    CHECK (category IN ('下粉', '直播', '短视频', '其他')),
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  account_name_snapshot text,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  scene_description text,
  screenshot_paths text[] NOT NULL DEFAULT '{}',
  result text,
  tags text[] NOT NULL DEFAULT '{}',
  pass_count int NOT NULL DEFAULT 0,
  fail_count int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'verified', 'rejected', 'archived')),
  risk_level text CHECK (risk_level IN ('high', 'medium', 'low')),
  admin_conclusion text,
  suggested_action text,
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  is_deleted boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.violation_test_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.violation_cases(id) ON DELETE CASCADE,
  tested_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tested_at timestamptz NOT NULL DEFAULT now(),
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  passed boolean NOT NULL,
  note text
);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'violation-screenshots',
  'violation-screenshots',
  false,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE INDEX IF NOT EXISTS idx_vc_status
  ON public.violation_cases(status)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_vc_category
  ON public.violation_cases(category)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_vc_team
  ON public.violation_cases(team_id)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_vc_created
  ON public.violation_cases(created_at DESC)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_vc_script_search
  ON public.violation_cases
  USING gin(to_tsvector('simple', script_text))
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_vtr_case
  ON public.violation_test_records(case_id);

CREATE INDEX IF NOT EXISTS idx_vtr_case_tester_account_time
  ON public.violation_test_records(case_id, tested_by, account_id, tested_at DESC);

CREATE OR REPLACE FUNCTION public.update_violation_pass_rate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_case_id uuid;
BEGIN
  target_case_id := COALESCE(NEW.case_id, OLD.case_id);

  UPDATE public.violation_cases
  SET
    pass_count = (
      SELECT count(*)
      FROM public.violation_test_records
      WHERE case_id = target_case_id
        AND passed = true
    ),
    fail_count = (
      SELECT count(*)
      FROM public.violation_test_records
      WHERE case_id = target_case_id
        AND passed = false
    )
  WHERE id = target_case_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_violation_pass_rate ON public.violation_test_records;
CREATE TRIGGER trg_violation_pass_rate
AFTER INSERT OR UPDATE OR DELETE ON public.violation_test_records
FOR EACH ROW EXECUTE FUNCTION public.update_violation_pass_rate();

ALTER TABLE public.violation_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.violation_test_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vc_select" ON public.violation_cases;
CREATE POLICY "vc_select" ON public.violation_cases
  FOR SELECT
  USING (auth.role() = 'authenticated' AND is_deleted = false);

DROP POLICY IF EXISTS "vc_insert" ON public.violation_cases;
CREATE POLICY "vc_insert" ON public.violation_cases
  FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND auth.uid() = submitted_by
    AND (account_id IS NULL OR public.owns_account(account_id))
  );

DROP POLICY IF EXISTS "vc_update" ON public.violation_cases;
CREATE POLICY "vc_update" ON public.violation_cases
  FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND public.has_violation_permission()
  )
  WITH CHECK (
    auth.role() = 'authenticated'
    AND public.has_violation_permission()
  );

DROP POLICY IF EXISTS "vc_delete" ON public.violation_cases;
CREATE POLICY "vc_delete" ON public.violation_cases
  FOR DELETE
  USING (
    auth.role() = 'authenticated'
    AND public.has_violation_permission()
  );

DROP POLICY IF EXISTS "vtr_select" ON public.violation_test_records;
CREATE POLICY "vtr_select" ON public.violation_test_records
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "vtr_insert" ON public.violation_test_records;
CREATE POLICY "vtr_insert" ON public.violation_test_records
  FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND auth.uid() = tested_by
    AND (account_id IS NULL OR public.owns_account(account_id))
    AND EXISTS (
      SELECT 1
      FROM public.violation_cases
      WHERE id = case_id
        AND status <> 'archived'
        AND is_deleted = false
    )
  );

DROP POLICY IF EXISTS "vtr_delete" ON public.violation_test_records;
CREATE POLICY "vtr_delete" ON public.violation_test_records
  FOR DELETE
  USING (
    auth.role() = 'authenticated'
    AND public.has_violation_permission()
  );
