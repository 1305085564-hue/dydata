-- ============================================================
-- 056: 转化中心后端数据层
-- ============================================================

ALTER TABLE public.violation_cases
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'violation',
  ADD COLUMN IF NOT EXISTS script_format text NOT NULL DEFAULT 'oral',
  ADD COLUMN IF NOT EXISTS ai_analysis jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS total_views bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_follows int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS usage_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weighted_conversion_rate numeric(10,8) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS script_hash text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.violation_cases(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'violation_cases_purpose_check'
      AND conrelid = 'public.violation_cases'::regclass
  ) THEN
    ALTER TABLE public.violation_cases
      ADD CONSTRAINT violation_cases_purpose_check
      CHECK (purpose IN ('violation', 'conversion'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'violation_cases_script_format_check'
      AND conrelid = 'public.violation_cases'::regclass
  ) THEN
    ALTER TABLE public.violation_cases
      ADD CONSTRAINT violation_cases_script_format_check
      CHECK (script_format IN ('oral', 'visual', 'mixed'));
  END IF;
END $$;

UPDATE public.violation_cases
SET
  purpose = COALESCE(purpose, 'violation'),
  script_format = COALESCE(script_format, 'oral'),
  total_views = COALESCE(total_views, 0),
  total_follows = COALESCE(total_follows, 0),
  usage_count = COALESCE(usage_count, 0),
  script_hash = COALESCE(script_hash, md5(trim(lower(script_text))))
WHERE purpose IS NULL
  OR script_format IS NULL
  OR total_views IS NULL
  OR total_follows IS NULL
  OR usage_count IS NULL
  OR script_hash IS NULL;

CREATE INDEX IF NOT EXISTS idx_vc_purpose_status_created
  ON public.violation_cases(purpose, status, created_at DESC)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_vc_script_hash
  ON public.violation_cases(script_hash)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_vc_conversion_rank
  ON public.violation_cases(weighted_conversion_rate DESC, total_views DESC)
  WHERE is_deleted = false
    AND purpose = 'conversion'
    AND usage_count >= 3
    AND total_views >= 1000;

CREATE OR REPLACE FUNCTION public.set_violation_case_script_hash()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.script_text IS NOT NULL THEN
    NEW.script_hash = md5(trim(lower(NEW.script_text)));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_violation_case_script_hash ON public.violation_cases;
CREATE TRIGGER trg_violation_case_script_hash
BEFORE INSERT OR UPDATE OF script_text ON public.violation_cases
FOR EACH ROW EXECUTE FUNCTION public.set_violation_case_script_hash();

CREATE TABLE IF NOT EXISTS public.script_usage_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.violation_cases(id) ON DELETE CASCADE,
  recorded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  account_name_snapshot text,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  used_at date NOT NULL,
  views int NOT NULL DEFAULT 0 CHECK (views >= 0),
  follows int NOT NULL DEFAULT 0 CHECK (follows >= 0 AND follows <= views),
  conversion_rate numeric(10,8)
    GENERATED ALWAYS AS (
      CASE WHEN views > 0 THEN follows::numeric / views ELSE NULL END
    ) STORED,
  source text NOT NULL DEFAULT 'daily_report'
    CHECK (source IN ('daily_report', 'manual')),
  daily_report_id uuid REFERENCES public.daily_reports(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.violation_reason_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.violation_case_reason_tags (
  case_id uuid NOT NULL REFERENCES public.violation_cases(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.violation_reason_tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (case_id, tag_id)
);

INSERT INTO public.violation_reason_tags (name, sort_order)
VALUES
  ('诱导站外', 10),
  ('承诺收益', 20),
  ('联系方式外露', 30),
  ('夸大宣传', 40),
  ('敏感词', 50),
  ('荐股', 60),
  ('其他', 70)
ON CONFLICT (name) DO UPDATE
SET
  sort_order = EXCLUDED.sort_order,
  is_active = true;

CREATE TABLE IF NOT EXISTS public.violation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid REFERENCES public.violation_cases(id) ON DELETE SET NULL,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  event_type text NOT NULL
    CHECK (event_type IN ('限流', '警告', '删除视频', '封号', '其他')),
  occurred_at timestamptz NOT NULL,
  platform_notice text,
  screenshot_paths text[] NOT NULL DEFAULT '{}',
  suspected_reason text,
  appeal_status text NOT NULL DEFAULT '未申诉'
    CHECK (appeal_status IN ('未申诉', '申诉中', '申诉成功', '申诉失败')),
  appeal_result text,
  recovered_at timestamptz,
  reported_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.script_purposes (
  key text PRIMARY KEY,
  label text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  requires_usage boolean NOT NULL DEFAULT false,
  requires_violation_reason boolean NOT NULL DEFAULT false
);

INSERT INTO public.script_purposes (
  key,
  label,
  sort_order,
  requires_usage,
  requires_violation_reason
)
VALUES
  ('violation', '违规避坑', 10, false, true),
  ('conversion', '转化提效', 20, true, false)
ON CONFLICT (key) DO UPDATE
SET
  label = EXCLUDED.label,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  requires_usage = EXCLUDED.requires_usage,
  requires_violation_reason = EXCLUDED.requires_violation_reason;

CREATE TABLE IF NOT EXISTS public.weekly_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL UNIQUE,
  generated_by text NOT NULL DEFAULT 'ai'
    CHECK (generated_by IN ('ai', 'manual')),
  promote jsonb NOT NULL DEFAULT '[]'::jsonb,
  keep_testing jsonb NOT NULL DEFAULT '[]'::jsonb,
  deprecate jsonb NOT NULL DEFAULT '[]'::jsonb,
  ban jsonb NOT NULL DEFAULT '[]'::jsonb,
  confirmed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sur_case_used_at
  ON public.script_usage_records(case_id, used_at DESC);

CREATE INDEX IF NOT EXISTS idx_sur_recorded_by_created
  ON public.script_usage_records(recorded_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sur_account_used_at
  ON public.script_usage_records(account_id, used_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sur_daily_report_case_unique
  ON public.script_usage_records(daily_report_id, case_id)
  WHERE daily_report_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vcrt_tag
  ON public.violation_case_reason_tags(tag_id);

CREATE INDEX IF NOT EXISTS idx_ve_account_occurred
  ON public.violation_events(account_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_ve_case
  ON public.violation_events(case_id);

CREATE INDEX IF NOT EXISTS idx_weekly_decisions_created
  ON public.weekly_decisions(created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_script_usage_records_updated_at ON public.script_usage_records;
CREATE TRIGGER trg_script_usage_records_updated_at
BEFORE UPDATE ON public.script_usage_records
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.recalculate_script_usage_aggregate(target_case_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.violation_cases vc
  SET
    total_views = COALESCE(agg.total_views, 0),
    total_follows = COALESCE(agg.total_follows, 0),
    usage_count = COALESCE(agg.usage_count, 0),
    weighted_conversion_rate = CASE
      WHEN COALESCE(agg.total_views, 0) > 0
        THEN COALESCE(agg.total_follows, 0)::numeric / agg.total_views
      ELSE NULL
    END
  FROM (
    SELECT
      target_case_id AS case_id,
      sum(views)::bigint AS total_views,
      sum(follows)::int AS total_follows,
      count(*)::int AS usage_count
    FROM public.script_usage_records
    WHERE case_id = target_case_id
  ) agg
  WHERE vc.id = agg.case_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_script_usage_aggregate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.recalculate_script_usage_aggregate(NEW.case_id);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    PERFORM public.recalculate_script_usage_aggregate(NEW.case_id);
    IF OLD.case_id IS DISTINCT FROM NEW.case_id THEN
      PERFORM public.recalculate_script_usage_aggregate(OLD.case_id);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_script_usage_aggregate(OLD.case_id);
    RETURN OLD;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_script_usage_aggregate ON public.script_usage_records;
CREATE TRIGGER trg_script_usage_aggregate
AFTER INSERT OR UPDATE OR DELETE ON public.script_usage_records
FOR EACH ROW EXECUTE FUNCTION public.update_script_usage_aggregate();

ALTER TABLE public.script_usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.violation_reason_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.violation_case_reason_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.violation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.script_purposes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sur_select_own_or_admin" ON public.script_usage_records;
CREATE POLICY "sur_select_own_or_admin" ON public.script_usage_records
  FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      recorded_by = auth.uid()
      OR public.has_violation_permission()
    )
  );

DROP POLICY IF EXISTS "sur_insert_own_open_case" ON public.script_usage_records;
CREATE POLICY "sur_insert_own_open_case" ON public.script_usage_records
  FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND recorded_by = auth.uid()
    AND (account_id IS NULL OR public.owns_account(account_id))
    AND EXISTS (
      SELECT 1
      FROM public.violation_cases
      WHERE id = case_id
        AND status <> 'archived'
        AND is_deleted = false
    )
  );

DROP POLICY IF EXISTS "sur_update_admin" ON public.script_usage_records;
CREATE POLICY "sur_update_admin" ON public.script_usage_records
  FOR UPDATE
  USING (auth.role() = 'authenticated' AND public.has_violation_permission())
  WITH CHECK (auth.role() = 'authenticated' AND public.has_violation_permission());

DROP POLICY IF EXISTS "sur_delete_admin" ON public.script_usage_records;
CREATE POLICY "sur_delete_admin" ON public.script_usage_records
  FOR DELETE
  USING (auth.role() = 'authenticated' AND public.has_violation_permission());

DROP POLICY IF EXISTS "vrt_select_all" ON public.violation_reason_tags;
CREATE POLICY "vrt_select_all" ON public.violation_reason_tags
  FOR SELECT
  USING (auth.role() = 'authenticated' AND is_active = true);

DROP POLICY IF EXISTS "vrt_admin_all" ON public.violation_reason_tags;
CREATE POLICY "vrt_admin_all" ON public.violation_reason_tags
  FOR ALL
  USING (auth.role() = 'authenticated' AND public.has_violation_permission())
  WITH CHECK (auth.role() = 'authenticated' AND public.has_violation_permission());

DROP POLICY IF EXISTS "vcrt_select_all" ON public.violation_case_reason_tags;
CREATE POLICY "vcrt_select_all" ON public.violation_case_reason_tags
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "vcrt_admin_all" ON public.violation_case_reason_tags;
CREATE POLICY "vcrt_admin_all" ON public.violation_case_reason_tags
  FOR ALL
  USING (auth.role() = 'authenticated' AND public.has_violation_permission())
  WITH CHECK (auth.role() = 'authenticated' AND public.has_violation_permission());

DROP POLICY IF EXISTS "ve_select_all" ON public.violation_events;
CREATE POLICY "ve_select_all" ON public.violation_events
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "ve_insert_own" ON public.violation_events;
CREATE POLICY "ve_insert_own" ON public.violation_events
  FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND reported_by = auth.uid()
    AND public.owns_account(account_id)
  );

DROP POLICY IF EXISTS "ve_update_admin" ON public.violation_events;
CREATE POLICY "ve_update_admin" ON public.violation_events
  FOR UPDATE
  USING (auth.role() = 'authenticated' AND public.has_violation_permission())
  WITH CHECK (auth.role() = 'authenticated' AND public.has_violation_permission());

DROP POLICY IF EXISTS "ve_delete_admin" ON public.violation_events;
CREATE POLICY "ve_delete_admin" ON public.violation_events
  FOR DELETE
  USING (auth.role() = 'authenticated' AND public.has_violation_permission());

DROP POLICY IF EXISTS "sp_select_all" ON public.script_purposes;
CREATE POLICY "sp_select_all" ON public.script_purposes
  FOR SELECT
  USING (auth.role() = 'authenticated' AND is_active = true);

DROP POLICY IF EXISTS "sp_admin_all" ON public.script_purposes;
CREATE POLICY "sp_admin_all" ON public.script_purposes
  FOR ALL
  USING (auth.role() = 'authenticated' AND public.has_violation_permission())
  WITH CHECK (auth.role() = 'authenticated' AND public.has_violation_permission());

DROP POLICY IF EXISTS "wd_select_admin" ON public.weekly_decisions;
CREATE POLICY "wd_select_admin" ON public.weekly_decisions
  FOR SELECT
  USING (auth.role() = 'authenticated' AND public.has_violation_permission());

DROP POLICY IF EXISTS "wd_admin_all" ON public.weekly_decisions;
CREATE POLICY "wd_admin_all" ON public.weekly_decisions
  FOR ALL
  USING (auth.role() = 'authenticated' AND public.has_violation_permission())
  WITH CHECK (auth.role() = 'authenticated' AND public.has_violation_permission());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.script_usage_records TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.violation_reason_tags TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.violation_case_reason_tags TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.violation_events TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.script_purposes TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_decisions TO authenticated, service_role;
