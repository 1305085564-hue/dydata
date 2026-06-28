BEGIN;

-- ============================================================
-- Review Desk + Case Library architecture refactor
-- 目标：
-- 1. 把优秀经验库从 violation_cases 中拆出，建立 knowledge_cases 资产主表
-- 2. 保留 legacy conversion 行做平滑过渡，新的知识库链路全部切到 knowledge_cases
-- 3. 为 content_feedback_cards 增加员工回传闭环和任务化追踪
-- ============================================================

CREATE TABLE IF NOT EXISTS public.knowledge_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  submitted_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  account_name_snapshot text,
  original_video_id uuid REFERENCES public.videos(id) ON DELETE SET NULL,
  legacy_source_violation_case_id uuid UNIQUE REFERENCES public.violation_cases(id) ON DELETE SET NULL,
  source_script_text text NOT NULL DEFAULT '',
  source_notes text,
  screenshot_paths text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'needs_revision', 'verified', 'deprecated')),
  hook_text text,
  body_text text,
  cta_text text,
  admin_insight text,
  usage_count int NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  actual_completion_rate numeric(10,8),
  actual_conversion_rate numeric(10,8),
  verified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  verified_at timestamptz,
  revision_requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  revision_requested_at timestamptz,
  revision_note text,
  revision_missing_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  deprecated_reason text,
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_knowledge_cases_status_created
  ON public.knowledge_cases(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_cases_submitted_by
  ON public.knowledge_cases(submitted_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_cases_team_status
  ON public.knowledge_cases(team_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_cases_verified_rank
  ON public.knowledge_cases(actual_conversion_rate DESC, usage_count DESC, created_at DESC)
  WHERE status = 'verified';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_cases TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_cases TO service_role;

ALTER TABLE public.knowledge_cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "knowledge_cases_select" ON public.knowledge_cases;
CREATE POLICY "knowledge_cases_select"
  ON public.knowledge_cases
  FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      submitted_by = auth.uid()
      OR public.has_violation_permission()
      OR public.is_admin()
    )
  );

DROP POLICY IF EXISTS "knowledge_cases_insert" ON public.knowledge_cases;
CREATE POLICY "knowledge_cases_insert"
  ON public.knowledge_cases
  FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND submitted_by = auth.uid()
    AND (account_id IS NULL OR public.owns_account(account_id))
  );

DROP POLICY IF EXISTS "knowledge_cases_update" ON public.knowledge_cases;
CREATE POLICY "knowledge_cases_update"
  ON public.knowledge_cases
  FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND (public.has_violation_permission() OR public.is_admin())
  )
  WITH CHECK (
    auth.role() = 'authenticated'
    AND (public.has_violation_permission() OR public.is_admin())
  );

DROP POLICY IF EXISTS "knowledge_cases_delete" ON public.knowledge_cases;
CREATE POLICY "knowledge_cases_delete"
  ON public.knowledge_cases
  FOR DELETE
  USING (
    auth.role() = 'authenticated'
    AND (public.has_violation_permission() OR public.is_admin())
  );

CREATE TABLE IF NOT EXISTS public.case_taxonomies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension text NOT NULL
    CHECK (dimension IN ('emotion', 'scenario', 'product_category')),
  label text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dimension, label)
);

CREATE INDEX IF NOT EXISTS idx_case_taxonomies_dimension_sort
  ON public.case_taxonomies(dimension, sort_order, label);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_taxonomies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_taxonomies TO service_role;

ALTER TABLE public.case_taxonomies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "case_taxonomies_select" ON public.case_taxonomies;
CREATE POLICY "case_taxonomies_select"
  ON public.case_taxonomies
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "case_taxonomies_manage" ON public.case_taxonomies;
CREATE POLICY "case_taxonomies_manage"
  ON public.case_taxonomies
  FOR ALL
  USING (public.is_admin() OR public.has_violation_permission())
  WITH CHECK (public.is_admin() OR public.has_violation_permission());

CREATE TABLE IF NOT EXISTS public.knowledge_case_taxonomy_links (
  case_id uuid NOT NULL REFERENCES public.knowledge_cases(id) ON DELETE CASCADE,
  taxonomy_id uuid NOT NULL REFERENCES public.case_taxonomies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (case_id, taxonomy_id)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_case_taxonomy_links_taxonomy
  ON public.knowledge_case_taxonomy_links(taxonomy_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_case_taxonomy_links TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_case_taxonomy_links TO service_role;

ALTER TABLE public.knowledge_case_taxonomy_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "knowledge_case_taxonomy_links_select" ON public.knowledge_case_taxonomy_links;
CREATE POLICY "knowledge_case_taxonomy_links_select"
  ON public.knowledge_case_taxonomy_links
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "knowledge_case_taxonomy_links_manage" ON public.knowledge_case_taxonomy_links;
CREATE POLICY "knowledge_case_taxonomy_links_manage"
  ON public.knowledge_case_taxonomy_links
  FOR ALL
  USING (public.is_admin() OR public.has_violation_permission())
  WITH CHECK (public.is_admin() OR public.has_violation_permission());

CREATE TABLE IF NOT EXISTS public.knowledge_case_status_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.knowledge_cases(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  action text NOT NULL,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  note text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_case_status_logs_case
  ON public.knowledge_case_status_logs(case_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_case_status_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_case_status_logs TO service_role;

ALTER TABLE public.knowledge_case_status_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "knowledge_case_status_logs_select" ON public.knowledge_case_status_logs;
CREATE POLICY "knowledge_case_status_logs_select"
  ON public.knowledge_case_status_logs
  FOR SELECT
  USING (public.is_admin() OR public.has_violation_permission());

DROP POLICY IF EXISTS "knowledge_case_status_logs_manage" ON public.knowledge_case_status_logs;
CREATE POLICY "knowledge_case_status_logs_manage"
  ON public.knowledge_case_status_logs
  FOR ALL
  USING (public.is_admin() OR public.has_violation_permission())
  WITH CHECK (public.is_admin() OR public.has_violation_permission());

CREATE TABLE IF NOT EXISTS public.case_usages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.knowledge_cases(id) ON DELETE CASCADE,
  applied_video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, applied_video_id)
);

CREATE INDEX IF NOT EXISTS idx_case_usages_case_created
  ON public.case_usages(case_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_case_usages_video_created
  ON public.case_usages(applied_video_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_usages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_usages TO service_role;

ALTER TABLE public.case_usages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "case_usages_select" ON public.case_usages;
CREATE POLICY "case_usages_select"
  ON public.case_usages
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "case_usages_insert" ON public.case_usages;
CREATE POLICY "case_usages_insert"
  ON public.case_usages
  FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "case_usages_update" ON public.case_usages;
CREATE POLICY "case_usages_update"
  ON public.case_usages
  FOR UPDATE
  USING (public.is_admin() OR public.has_violation_permission())
  WITH CHECK (public.is_admin() OR public.has_violation_permission());

DROP POLICY IF EXISTS "case_usages_delete" ON public.case_usages;
CREATE POLICY "case_usages_delete"
  ON public.case_usages
  FOR DELETE
  USING (public.is_admin() OR public.has_violation_permission());

CREATE OR REPLACE FUNCTION public.append_knowledge_case_status_log(
  p_case_id uuid,
  p_from_status text,
  p_to_status text,
  p_action text,
  p_actor_id uuid,
  p_note text DEFAULT NULL,
  p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.knowledge_case_status_logs (
    case_id,
    from_status,
    to_status,
    action,
    actor_id,
    note,
    meta
  )
  VALUES (
    p_case_id,
    p_from_status,
    p_to_status,
    p_action,
    p_actor_id,
    p_note,
    COALESCE(p_meta, '{}'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION public.sync_knowledge_case_taxonomies(
  p_case_id uuid,
  p_taxonomy_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dimension text;
  v_label text;
  v_taxonomy_id uuid;
BEGIN
  DELETE FROM public.knowledge_case_taxonomy_links
  WHERE case_id = p_case_id;

  FOR v_dimension IN
    SELECT unnest(ARRAY['emotion', 'scenario', 'product_category'])
  LOOP
    IF jsonb_typeof(COALESCE(p_taxonomy_payload -> v_dimension, '[]'::jsonb)) <> 'array' THEN
      CONTINUE;
    END IF;

    FOR v_label IN
      SELECT btrim(value)
      FROM jsonb_array_elements_text(COALESCE(p_taxonomy_payload -> v_dimension, '[]'::jsonb))
      WHERE btrim(value) <> ''
    LOOP
      INSERT INTO public.case_taxonomies (dimension, label)
      VALUES (v_dimension, v_label)
      ON CONFLICT (dimension, label) DO UPDATE
      SET is_active = true
      RETURNING id INTO v_taxonomy_id;

      IF v_taxonomy_id IS NULL THEN
        SELECT id
        INTO v_taxonomy_id
        FROM public.case_taxonomies
        WHERE dimension = v_dimension
          AND label = v_label;
      END IF;

      INSERT INTO public.knowledge_case_taxonomy_links (case_id, taxonomy_id)
      VALUES (p_case_id, v_taxonomy_id)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_knowledge_case_usage_metrics(target_case_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  WITH latest_snapshots AS (
    SELECT DISTINCT ON (vms.video_id)
      vms.video_id,
      vms.play_count,
      vms.completion_rate,
      vms.follower_gain
    FROM public.case_usages cu
    JOIN public.video_metrics_snapshots vms
      ON vms.video_id = cu.applied_video_id
    WHERE cu.case_id = target_case_id
      AND vms.snapshot_type = '24h'
    ORDER BY vms.video_id, vms.captured_at DESC
  ),
  aggregate_metrics AS (
    SELECT
      cu.case_id,
      count(*)::int AS usage_count,
      avg(ls.completion_rate)::numeric(10,8) AS actual_completion_rate,
      CASE
        WHEN sum(COALESCE(ls.play_count, 0)) > 0
          THEN sum(COALESCE(ls.follower_gain, 0))::numeric / sum(COALESCE(ls.play_count, 0))
        ELSE NULL
      END AS actual_conversion_rate
    FROM public.case_usages cu
    LEFT JOIN latest_snapshots ls
      ON ls.video_id = cu.applied_video_id
    WHERE cu.case_id = target_case_id
    GROUP BY cu.case_id
  )
  UPDATE public.knowledge_cases kc
  SET
    usage_count = COALESCE(am.usage_count, 0),
    actual_completion_rate = am.actual_completion_rate,
    actual_conversion_rate = am.actual_conversion_rate
  FROM aggregate_metrics am
  WHERE kc.id = target_case_id
    AND kc.id = am.case_id;

  IF NOT FOUND THEN
    UPDATE public.knowledge_cases
    SET
      usage_count = 0,
      actual_completion_rate = NULL,
      actual_conversion_rate = NULL
    WHERE id = target_case_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_recalculate_knowledge_case_usage_metrics()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recalculate_knowledge_case_usage_metrics(COALESCE(NEW.case_id, OLD.case_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_case_usages_recalculate_metrics ON public.case_usages;
CREATE TRIGGER trg_case_usages_recalculate_metrics
AFTER INSERT OR UPDATE OR DELETE ON public.case_usages
FOR EACH ROW EXECUTE FUNCTION public.trg_recalculate_knowledge_case_usage_metrics();

CREATE OR REPLACE FUNCTION public.knowledge_case_snapshot(p_case_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', kc.id,
    'submitted_by', kc.submitted_by,
    'team_id', kc.team_id,
    'account_id', kc.account_id,
    'account_name_snapshot', kc.account_name_snapshot,
    'original_video_id', kc.original_video_id,
    'legacy_source_violation_case_id', kc.legacy_source_violation_case_id,
    'source_script_text', kc.source_script_text,
    'source_notes', kc.source_notes,
    'screenshot_paths', kc.screenshot_paths,
    'status', kc.status,
    'hook_text', kc.hook_text,
    'body_text', kc.body_text,
    'cta_text', kc.cta_text,
    'admin_insight', kc.admin_insight,
    'usage_count', kc.usage_count,
    'actual_completion_rate', kc.actual_completion_rate,
    'actual_conversion_rate', kc.actual_conversion_rate,
    'verified_by', kc.verified_by,
    'verified_at', kc.verified_at,
    'revision_requested_by', kc.revision_requested_by,
    'revision_requested_at', kc.revision_requested_at,
    'revision_note', kc.revision_note,
    'revision_missing_fields', kc.revision_missing_fields,
    'deprecated_reason', kc.deprecated_reason,
    'created_at', kc.created_at,
    'updated_at', kc.updated_at,
    'taxonomy', jsonb_build_object(
      'emotion',
      COALESCE((
        SELECT jsonb_agg(ct.label ORDER BY ct.sort_order, ct.label)
        FROM public.knowledge_case_taxonomy_links kctl
        JOIN public.case_taxonomies ct ON ct.id = kctl.taxonomy_id
        WHERE kctl.case_id = kc.id
          AND ct.dimension = 'emotion'
      ), '[]'::jsonb),
      'scenario',
      COALESCE((
        SELECT jsonb_agg(ct.label ORDER BY ct.sort_order, ct.label)
        FROM public.knowledge_case_taxonomy_links kctl
        JOIN public.case_taxonomies ct ON ct.id = kctl.taxonomy_id
        WHERE kctl.case_id = kc.id
          AND ct.dimension = 'scenario'
      ), '[]'::jsonb),
      'product_category',
      COALESCE((
        SELECT jsonb_agg(ct.label ORDER BY ct.sort_order, ct.label)
        FROM public.knowledge_case_taxonomy_links kctl
        JOIN public.case_taxonomies ct ON ct.id = kctl.taxonomy_id
        WHERE kctl.case_id = kc.id
          AND ct.dimension = 'product_category'
      ), '[]'::jsonb)
    )
  )
  FROM public.knowledge_cases kc
  WHERE kc.id = p_case_id;
$$;

INSERT INTO public.knowledge_cases (
  submitted_by,
  team_id,
  account_id,
  account_name_snapshot,
  legacy_source_violation_case_id,
  source_script_text,
  source_notes,
  screenshot_paths,
  status,
  body_text,
  admin_insight,
  usage_count,
  actual_conversion_rate,
  verified_by,
  verified_at,
  revision_requested_by,
  revision_requested_at,
  revision_note,
  revision_missing_fields,
  deprecated_reason,
  source_payload
)
SELECT
  vc.submitted_by,
  COALESCE(vc.team_id, p.team_id),
  vc.account_id,
  vc.account_name_snapshot,
  vc.id,
  vc.script_text,
  COALESCE(vc.result, vc.suggested_action),
  COALESCE(vc.screenshot_paths, '{}'::text[]),
  CASE
    WHEN vc.status = 'verified' THEN 'verified'
    WHEN vc.status = 'rejected' THEN 'needs_revision'
    WHEN vc.status = 'archived' THEN 'deprecated'
    ELSE 'submitted'
  END,
  vc.script_text,
  vc.admin_conclusion,
  COALESCE(vc.usage_count, 0),
  vc.weighted_conversion_rate,
  vc.reviewed_by,
  vc.reviewed_at,
  CASE WHEN vc.status = 'rejected' THEN vc.reviewed_by ELSE NULL END,
  CASE WHEN vc.status = 'rejected' THEN vc.reviewed_at ELSE NULL END,
  CASE WHEN vc.status = 'rejected' THEN COALESCE(vc.suggested_action, vc.admin_conclusion) ELSE NULL END,
  CASE
    WHEN COALESCE(array_length(vc.screenshot_paths, 1), 0) = 0
      THEN '["screenshot"]'::jsonb
    ELSE '[]'::jsonb
  END,
  CASE WHEN vc.status = 'archived' THEN COALESCE(vc.admin_conclusion, vc.suggested_action) ELSE NULL END,
  jsonb_build_object(
    'legacy_table', 'violation_cases',
    'legacy_purpose', vc.purpose,
    'legacy_status', vc.status,
    'legacy_risk_level', vc.risk_level,
    'legacy_tags', COALESCE(to_jsonb(vc.tags), '[]'::jsonb),
    'legacy_ai_analysis', vc.ai_analysis,
    'legacy_script_format', vc.script_format
  )
FROM public.violation_cases vc
LEFT JOIN public.profiles p
  ON p.id = vc.submitted_by
WHERE vc.is_deleted = false
  AND vc.purpose = 'conversion'
ON CONFLICT (legacy_source_violation_case_id) DO UPDATE
SET
  submitted_by = EXCLUDED.submitted_by,
  team_id = EXCLUDED.team_id,
  account_id = EXCLUDED.account_id,
  account_name_snapshot = EXCLUDED.account_name_snapshot,
  source_script_text = EXCLUDED.source_script_text,
  source_notes = EXCLUDED.source_notes,
  screenshot_paths = EXCLUDED.screenshot_paths,
  status = EXCLUDED.status,
  body_text = EXCLUDED.body_text,
  admin_insight = EXCLUDED.admin_insight,
  usage_count = EXCLUDED.usage_count,
  actual_conversion_rate = EXCLUDED.actual_conversion_rate,
  verified_by = EXCLUDED.verified_by,
  verified_at = EXCLUDED.verified_at,
  revision_requested_by = EXCLUDED.revision_requested_by,
  revision_requested_at = EXCLUDED.revision_requested_at,
  revision_note = EXCLUDED.revision_note,
  revision_missing_fields = EXCLUDED.revision_missing_fields,
  deprecated_reason = EXCLUDED.deprecated_reason,
  source_payload = EXCLUDED.source_payload,
  updated_at = now();

INSERT INTO public.knowledge_case_status_logs (
  case_id,
  from_status,
  to_status,
  action,
  actor_id,
  note,
  meta
)
SELECT
  kc.id,
  NULL,
  kc.status,
  'legacy_import',
  kc.verified_by,
  '从 legacy conversion 行迁移入知识案例库',
  jsonb_build_object('legacy_source_violation_case_id', kc.legacy_source_violation_case_id)
FROM public.knowledge_cases kc
WHERE kc.legacy_source_violation_case_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.knowledge_case_status_logs log
    WHERE log.case_id = kc.id
      AND log.action = 'legacy_import'
  );

ALTER TABLE public.content_feedback_cards
  ADD COLUMN IF NOT EXISTS employee_reply_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS employee_reply_text text,
  ADD COLUMN IF NOT EXISTS employee_replied_at timestamptz,
  ADD COLUMN IF NOT EXISTS employee_replied_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.content_feedback_cards
  DROP CONSTRAINT IF EXISTS content_feedback_cards_employee_reply_status_check;

ALTER TABLE public.content_feedback_cards
  ADD CONSTRAINT content_feedback_cards_employee_reply_status_check
  CHECK (employee_reply_status IN ('pending', 'acknowledged', 'disputed'));

CREATE TABLE IF NOT EXISTS public.feedback_card_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_card_id uuid NOT NULL REFERENCES public.content_feedback_cards(id) ON DELETE CASCADE,
  reply_status text NOT NULL CHECK (reply_status IN ('acknowledged', 'disputed')),
  reply_text text NOT NULL,
  replied_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_card_replies_card_created
  ON public.feedback_card_replies(feedback_card_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedback_card_replies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedback_card_replies TO service_role;

ALTER TABLE public.feedback_card_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feedback_card_replies_select" ON public.feedback_card_replies;
CREATE POLICY "feedback_card_replies_select"
  ON public.feedback_card_replies
  FOR SELECT
  USING (
    public.is_admin()
    OR replied_by = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.content_feedback_cards cfc
      WHERE cfc.id = feedback_card_id
        AND cfc.target_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "feedback_card_replies_insert" ON public.feedback_card_replies;
CREATE POLICY "feedback_card_replies_insert"
  ON public.feedback_card_replies
  FOR INSERT
  WITH CHECK (
    replied_by = auth.uid()
    OR public.is_admin()
  );

CREATE TABLE IF NOT EXISTS public.feedback_action_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_card_id uuid NOT NULL REFERENCES public.content_feedback_cards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  task_order int NOT NULL DEFAULT 0,
  task_content text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed')),
  completed_at timestamptz,
  completed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (feedback_card_id, task_order)
);

CREATE INDEX IF NOT EXISTS idx_feedback_action_tasks_user_status
  ON public.feedback_action_tasks(user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_feedback_action_tasks_card
  ON public.feedback_action_tasks(feedback_card_id, task_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedback_action_tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedback_action_tasks TO service_role;

ALTER TABLE public.feedback_action_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feedback_action_tasks_select" ON public.feedback_action_tasks;
CREATE POLICY "feedback_action_tasks_select"
  ON public.feedback_action_tasks
  FOR SELECT
  USING (
    public.is_admin()
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS "feedback_action_tasks_update_self" ON public.feedback_action_tasks;
CREATE POLICY "feedback_action_tasks_update_self"
  ON public.feedback_action_tasks
  FOR UPDATE
  USING (
    public.is_admin()
    OR user_id = auth.uid()
  )
  WITH CHECK (
    public.is_admin()
    OR user_id = auth.uid()
  );

CREATE OR REPLACE FUNCTION public.sync_feedback_action_tasks(target_feedback_card_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card public.content_feedback_cards%ROWTYPE;
  v_task_text text;
  v_task_order int := 0;
BEGIN
  SELECT *
  INTO v_card
  FROM public.content_feedback_cards
  WHERE id = target_feedback_card_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  DELETE FROM public.feedback_action_tasks
  WHERE feedback_card_id = target_feedback_card_id;

  IF v_card.confirmed_payload IS NULL THEN
    RETURN;
  END IF;

  IF jsonb_typeof(COALESCE(v_card.confirmed_payload -> 'actions' -> 'instructions', '[]'::jsonb)) <> 'array' THEN
    RETURN;
  END IF;

  FOR v_task_text IN
    SELECT btrim(value)
    FROM jsonb_array_elements_text(v_card.confirmed_payload -> 'actions' -> 'instructions')
    WHERE btrim(value) <> ''
  LOOP
    v_task_order := v_task_order + 1;

    INSERT INTO public.feedback_action_tasks (
      feedback_card_id,
      user_id,
      task_order,
      task_content
    )
    VALUES (
      target_feedback_card_id,
      v_card.target_user_id,
      v_task_order,
      v_task_text
    )
    ON CONFLICT (feedback_card_id, task_order) DO UPDATE
    SET
      user_id = EXCLUDED.user_id,
      task_content = EXCLUDED.task_content,
      status = CASE
        WHEN public.feedback_action_tasks.task_content = EXCLUDED.task_content
          THEN public.feedback_action_tasks.status
        ELSE 'pending'
      END,
      completed_at = CASE
        WHEN public.feedback_action_tasks.task_content = EXCLUDED.task_content
          THEN public.feedback_action_tasks.completed_at
        ELSE NULL
      END,
      completed_by = CASE
        WHEN public.feedback_action_tasks.task_content = EXCLUDED.task_content
          THEN public.feedback_action_tasks.completed_by
        ELSE NULL
      END,
      updated_at = now();
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_sync_feedback_action_tasks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_feedback_action_tasks(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_feedback_action_tasks ON public.content_feedback_cards;
CREATE TRIGGER trg_sync_feedback_action_tasks
AFTER INSERT OR UPDATE OF confirmed_payload, target_user_id ON public.content_feedback_cards
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_feedback_action_tasks();

CREATE OR REPLACE FUNCTION public.enrich_and_verify_case(
  p_case_id uuid,
  p_actor_id uuid,
  p_hook_text text,
  p_body_text text DEFAULT NULL,
  p_cta_text text DEFAULT NULL,
  p_admin_insight text DEFAULT NULL,
  p_original_video_id uuid DEFAULT NULL,
  p_taxonomy_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scope RECORD;
  v_case public.knowledge_cases%ROWTYPE;
  v_previous_status text;
BEGIN
  SELECT *
  INTO v_scope
  FROM public.case_library_actor_scope(p_actor_id);

  IF NOT COALESCE(v_scope.can_manage, false) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT *
  INTO v_case
  FROM public.knowledge_cases
  WHERE id = p_case_id
    AND submitted_by = ANY(v_scope.visible_user_ids)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'knowledge case not found';
  END IF;

  v_previous_status := v_case.status;

  UPDATE public.knowledge_cases
  SET
    hook_text = NULLIF(btrim(p_hook_text), ''),
    body_text = NULLIF(btrim(COALESCE(p_body_text, body_text)), ''),
    cta_text = NULLIF(btrim(COALESCE(p_cta_text, cta_text)), ''),
    admin_insight = NULLIF(btrim(COALESCE(p_admin_insight, admin_insight)), ''),
    original_video_id = COALESCE(p_original_video_id, original_video_id),
    status = 'verified',
    verified_by = p_actor_id,
    verified_at = now(),
    revision_requested_by = NULL,
    revision_requested_at = NULL,
    revision_note = NULL,
    revision_missing_fields = '[]'::jsonb,
    deprecated_reason = NULL,
    updated_at = now()
  WHERE id = p_case_id;

  PERFORM public.sync_knowledge_case_taxonomies(p_case_id, COALESCE(p_taxonomy_payload, '{}'::jsonb));
  PERFORM public.append_knowledge_case_status_log(
    p_case_id,
    v_previous_status,
    'verified',
    'enrich_and_verify',
    p_actor_id,
    NULLIF(btrim(p_admin_insight), ''),
    jsonb_build_object(
      'hook_text', NULLIF(btrim(p_hook_text), ''),
      'body_text', NULLIF(btrim(p_body_text), ''),
      'cta_text', NULLIF(btrim(p_cta_text), '')
    )
  );

  RETURN public.knowledge_case_snapshot(p_case_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.request_case_supplement(
  p_case_id uuid,
  p_actor_id uuid,
  p_reason text,
  p_missing_fields jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scope RECORD;
  v_case public.knowledge_cases%ROWTYPE;
  v_previous_status text;
BEGIN
  SELECT *
  INTO v_scope
  FROM public.case_library_actor_scope(p_actor_id);

  IF NOT COALESCE(v_scope.can_manage, false) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT *
  INTO v_case
  FROM public.knowledge_cases
  WHERE id = p_case_id
    AND submitted_by = ANY(v_scope.visible_user_ids)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'knowledge case not found';
  END IF;

  v_previous_status := v_case.status;

  UPDATE public.knowledge_cases
  SET
    status = 'needs_revision',
    revision_requested_by = p_actor_id,
    revision_requested_at = now(),
    revision_note = NULLIF(btrim(p_reason), ''),
    revision_missing_fields = COALESCE(p_missing_fields, '[]'::jsonb),
    updated_at = now()
  WHERE id = p_case_id;

  PERFORM public.append_knowledge_case_status_log(
    p_case_id,
    v_previous_status,
    'needs_revision',
    'request_case_supplement',
    p_actor_id,
    NULLIF(btrim(p_reason), ''),
    jsonb_build_object(
      'missing_fields', COALESCE(p_missing_fields, '[]'::jsonb)
    )
  );

  RETURN public.knowledge_case_snapshot(p_case_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.enrich_and_verify_case(uuid, uuid, text, text, text, text, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enrich_and_verify_case(uuid, uuid, text, text, text, text, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.request_case_supplement(uuid, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_case_supplement(uuid, uuid, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.case_library_inbox(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scope RECORD;
BEGIN
  SELECT *
  INTO v_scope
  FROM public.case_library_actor_scope(p_user_id);

  IF NOT COALESCE(v_scope.can_manage, false) THEN
    RETURN jsonb_build_object(
      'pending_review', '[]'::jsonb,
      'violation_pending_review', '[]'::jsonb,
      'knowledge_pending_enrichment', '[]'::jsonb,
      'knowledge_needs_revision', '[]'::jsonb,
      'pending_review_conversion', '[]'::jsonb,
      'missing_data', '[]'::jsonb,
      'high_risk_pending', '[]'::jsonb,
      'promotion_candidates', '[]'::jsonb
    );
  END IF;

  RETURN jsonb_build_object(
    'pending_review',
    COALESCE((
      SELECT jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC)
      FROM (
        SELECT
          vc.id,
          vc.script_text,
          'violation'::text AS queue_type,
          COALESCE(p.name, '未命名成员') AS submitted_by_name,
          vc.created_at,
          vc.risk_level,
          vc.status
        FROM public.violation_cases vc
        LEFT JOIN public.profiles p ON p.id = vc.submitted_by
        WHERE vc.is_deleted = false
          AND vc.status = 'submitted'
          AND vc.purpose = 'violation'
          AND vc.submitted_by = ANY(v_scope.visible_user_ids)

        UNION ALL

        SELECT
          kc.id,
          kc.source_script_text AS script_text,
          'knowledge'::text AS queue_type,
          COALESCE(p.name, '未命名成员') AS submitted_by_name,
          kc.created_at,
          NULL::text AS risk_level,
          kc.status
        FROM public.knowledge_cases kc
        LEFT JOIN public.profiles p ON p.id = kc.submitted_by
        WHERE kc.status = 'submitted'
          AND kc.submitted_by = ANY(v_scope.visible_user_ids)
      ) t
    ), '[]'::jsonb),
    'violation_pending_review',
    COALESCE((
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT
          vc.id,
          vc.script_text,
          COALESCE(p.name, '未命名成员') AS submitted_by_name,
          vc.created_at,
          vc.risk_level,
          vc.status
        FROM public.violation_cases vc
        LEFT JOIN public.profiles p ON p.id = vc.submitted_by
        WHERE vc.is_deleted = false
          AND vc.status = 'submitted'
          AND vc.purpose = 'violation'
          AND vc.submitted_by = ANY(v_scope.visible_user_ids)
        ORDER BY vc.created_at DESC
        LIMIT 20
      ) t
    ), '[]'::jsonb),
    'knowledge_pending_enrichment',
    COALESCE((
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT
          kc.id,
          kc.source_script_text AS script_text,
          COALESCE(p.name, '未命名成员') AS submitted_by_name,
          kc.created_at,
          kc.status,
          kc.screenshot_paths,
          kc.usage_count,
          kc.actual_conversion_rate
        FROM public.knowledge_cases kc
        LEFT JOIN public.profiles p ON p.id = kc.submitted_by
        WHERE kc.status = 'submitted'
          AND kc.submitted_by = ANY(v_scope.visible_user_ids)
        ORDER BY kc.created_at DESC
        LIMIT 20
      ) t
    ), '[]'::jsonb),
    'knowledge_needs_revision',
    COALESCE((
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT
          kc.id,
          kc.source_script_text AS script_text,
          COALESCE(p.name, '未命名成员') AS submitted_by_name,
          kc.created_at,
          kc.status,
          kc.revision_note,
          kc.revision_missing_fields AS missing_fields,
          kc.screenshot_paths
        FROM public.knowledge_cases kc
        LEFT JOIN public.profiles p ON p.id = kc.submitted_by
        WHERE kc.status = 'needs_revision'
          AND kc.submitted_by = ANY(v_scope.visible_user_ids)
        ORDER BY kc.revision_requested_at DESC NULLS LAST, kc.created_at DESC
        LIMIT 20
      ) t
    ), '[]'::jsonb),
    'pending_review_conversion',
    COALESCE((
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT
          kc.id,
          kc.source_script_text AS script_text,
          COALESCE(p.name, '未命名成员') AS submitted_by_name,
          kc.created_at,
          kc.status
        FROM public.knowledge_cases kc
        LEFT JOIN public.profiles p ON p.id = kc.submitted_by
        WHERE kc.status = 'submitted'
          AND kc.submitted_by = ANY(v_scope.visible_user_ids)
        ORDER BY kc.created_at DESC
        LIMIT 20
      ) t
    ), '[]'::jsonb),
    'missing_data',
    COALESCE((
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT
          kc.id,
          kc.source_script_text AS script_text,
          COALESCE(p.name, '未命名成员') AS submitted_by_name,
          kc.created_at,
          kc.revision_missing_fields AS missing_fields
        FROM public.knowledge_cases kc
        LEFT JOIN public.profiles p ON p.id = kc.submitted_by
        WHERE kc.status = 'needs_revision'
          AND kc.submitted_by = ANY(v_scope.visible_user_ids)
        ORDER BY kc.revision_requested_at DESC NULLS LAST, kc.created_at DESC
        LIMIT 20
      ) t
    ), '[]'::jsonb),
    'high_risk_pending',
    COALESCE((
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT
          vc.id,
          vc.script_text,
          COALESCE(p.name, '未命名成员') AS submitted_by_name,
          vc.created_at,
          vc.risk_level
        FROM public.violation_cases vc
        LEFT JOIN public.profiles p ON p.id = vc.submitted_by
        WHERE vc.is_deleted = false
          AND vc.status = 'submitted'
          AND vc.purpose = 'violation'
          AND vc.risk_level = 'high'
          AND vc.submitted_by = ANY(v_scope.visible_user_ids)
        ORDER BY vc.created_at DESC
        LIMIT 20
      ) t
    ), '[]'::jsonb),
    'promotion_candidates',
    COALESCE((
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT
          kc.id,
          kc.source_script_text AS script_text,
          COALESCE(p.name, '未命名成员') AS submitted_by_name,
          kc.created_at,
          kc.actual_conversion_rate,
          kc.usage_count,
          kc.status
        FROM public.knowledge_cases kc
        LEFT JOIN public.profiles p ON p.id = kc.submitted_by
        WHERE kc.status = 'verified'
          AND kc.submitted_by = ANY(v_scope.visible_user_ids)
          AND kc.usage_count >= 3
          AND COALESCE(kc.actual_conversion_rate, 0) >= 0.05
        ORDER BY kc.actual_conversion_rate DESC NULLS LAST, kc.created_at DESC
        LIMIT 20
      ) t
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.case_library_inbox_counts(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scope RECORD;
  v_violation_pending_review int := 0;
  v_knowledge_pending_enrichment int := 0;
  v_knowledge_needs_revision int := 0;
  v_high_risk_pending int := 0;
  v_promotion_candidates int := 0;
BEGIN
  SELECT *
  INTO v_scope
  FROM public.case_library_actor_scope(p_user_id);

  IF NOT COALESCE(v_scope.can_manage, false) THEN
    RETURN jsonb_build_object(
      'pending_review', 0,
      'violation_pending_review', 0,
      'knowledge_pending_enrichment', 0,
      'knowledge_needs_revision', 0,
      'pending_review_conversion', 0,
      'missing_data', 0,
      'high_risk_pending', 0,
      'promotion_candidates', 0
    );
  END IF;

  SELECT count(*)::int
  INTO v_violation_pending_review
  FROM public.violation_cases vc
  WHERE vc.is_deleted = false
    AND vc.status = 'submitted'
    AND vc.purpose = 'violation'
    AND vc.submitted_by = ANY(v_scope.visible_user_ids);

  SELECT count(*)::int
  INTO v_knowledge_pending_enrichment
  FROM public.knowledge_cases kc
  WHERE kc.status = 'submitted'
    AND kc.submitted_by = ANY(v_scope.visible_user_ids);

  SELECT count(*)::int
  INTO v_knowledge_needs_revision
  FROM public.knowledge_cases kc
  WHERE kc.status = 'needs_revision'
    AND kc.submitted_by = ANY(v_scope.visible_user_ids);

  SELECT count(*)::int
  INTO v_high_risk_pending
  FROM public.violation_cases vc
  WHERE vc.is_deleted = false
    AND vc.status = 'submitted'
    AND vc.purpose = 'violation'
    AND vc.risk_level = 'high'
    AND vc.submitted_by = ANY(v_scope.visible_user_ids);

  SELECT count(*)::int
  INTO v_promotion_candidates
  FROM public.knowledge_cases kc
  WHERE kc.status = 'verified'
    AND kc.submitted_by = ANY(v_scope.visible_user_ids)
    AND kc.usage_count >= 3
    AND COALESCE(kc.actual_conversion_rate, 0) >= 0.05;

  RETURN jsonb_build_object(
    'pending_review', v_violation_pending_review + v_knowledge_pending_enrichment,
    'violation_pending_review', v_violation_pending_review,
    'knowledge_pending_enrichment', v_knowledge_pending_enrichment,
    'knowledge_needs_revision', v_knowledge_needs_revision,
    'pending_review_conversion', v_knowledge_pending_enrichment,
    'missing_data', v_knowledge_needs_revision,
    'high_risk_pending', v_high_risk_pending,
    'promotion_candidates', v_promotion_candidates
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.case_library_inbox(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.case_library_inbox(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.case_library_inbox_counts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.case_library_inbox_counts(uuid) TO service_role;

COMMIT;

-- Rollback reference (manual, do not run automatically in production):
-- 1. DROP TRIGGER trg_sync_feedback_action_tasks ON public.content_feedback_cards;
-- 2. DROP FUNCTION public.trg_sync_feedback_action_tasks();
-- 3. DROP FUNCTION public.sync_feedback_action_tasks(uuid);
-- 4. DROP TABLE public.feedback_action_tasks;
-- 5. DROP TABLE public.feedback_card_replies;
-- 6. ALTER TABLE public.content_feedback_cards DROP COLUMN employee_reply_status, DROP COLUMN employee_reply_text, DROP COLUMN employee_replied_at, DROP COLUMN employee_replied_by;
-- 7. DROP FUNCTION public.request_case_supplement(uuid, uuid, text, jsonb);
-- 8. DROP FUNCTION public.enrich_and_verify_case(uuid, uuid, text, text, text, text, uuid, jsonb);
-- 9. DROP TABLE public.case_usages;
-- 10. DROP TABLE public.knowledge_case_status_logs;
-- 11. DROP TABLE public.knowledge_case_taxonomy_links;
-- 12. DROP TABLE public.case_taxonomies;
-- 13. DROP TABLE public.knowledge_cases;
