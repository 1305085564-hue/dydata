-- ============================================================
-- publish_drafts: 视频审核（待发稿）模块
-- 用户提交话术+截图 → 管理审核 → 通过即入库（已通过=数据页可见）
-- 打回后用户在原稿上整改，轮次累加，反馈历史保留在 jsonb
-- ============================================================

CREATE TABLE IF NOT EXISTS public.publish_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  account_name_snapshot text,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  script_text text NOT NULL,
  screenshot_paths text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  current_round int NOT NULL DEFAULT 1,
  feedback_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  approved_at timestamptz,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 自更新 updated_at
CREATE OR REPLACE FUNCTION public.publish_drafts_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_publish_drafts_updated_at ON public.publish_drafts;
CREATE TRIGGER trg_publish_drafts_updated_at
BEFORE UPDATE ON public.publish_drafts
FOR EACH ROW
EXECUTE FUNCTION public.publish_drafts_set_updated_at();

-- 索引
CREATE INDEX IF NOT EXISTS idx_publish_drafts_status_created
  ON public.publish_drafts (status, created_at ASC)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_publish_drafts_approved_at_desc
  ON public.publish_drafts (approved_at DESC NULLS LAST)
  WHERE status = 'approved' AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_publish_drafts_submitted_by
  ON public.publish_drafts (submitted_by, created_at DESC)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_publish_drafts_account_id
  ON public.publish_drafts (account_id)
  WHERE is_deleted = false;

-- RLS
ALTER TABLE public.publish_drafts ENABLE ROW LEVEL SECURITY;

-- 已通过：全员可读（数据页公开沉淀）
DROP POLICY IF EXISTS publish_drafts_approved_select_all ON public.publish_drafts;
CREATE POLICY publish_drafts_approved_select_all
  ON public.publish_drafts
  FOR SELECT
  TO authenticated
  USING (status = 'approved' AND is_deleted = false);

-- 自己看自己（任何状态）
DROP POLICY IF EXISTS publish_drafts_owner_select ON public.publish_drafts;
CREATE POLICY publish_drafts_owner_select
  ON public.publish_drafts
  FOR SELECT
  TO authenticated
  USING (submitted_by = auth.uid() AND is_deleted = false);

-- 自己提交/更新（updated 仅限 pending 自稿；其他流转走 service role）
DROP POLICY IF EXISTS publish_drafts_owner_insert ON public.publish_drafts;
CREATE POLICY publish_drafts_owner_insert
  ON public.publish_drafts
  FOR INSERT
  TO authenticated
  WITH CHECK (submitted_by = auth.uid());

DROP POLICY IF EXISTS publish_drafts_owner_update ON public.publish_drafts;
CREATE POLICY publish_drafts_owner_update
  ON public.publish_drafts
  FOR UPDATE
  TO authenticated
  USING (submitted_by = auth.uid() AND status IN ('pending', 'rejected') AND is_deleted = false)
  WITH CHECK (submitted_by = auth.uid());

-- 审核员视角：复用 violations 同款 manage_violations 权限
-- 通过 RPC publish_draft_actor_scope 控制可见用户范围
-- 审核动作（approve/reject）走 service role，不在 RLS 里授权 admin update

-- ============================================================
-- 权限 + 可见范围 RPC：复用 case_library_actor_scope 逻辑
-- 审核员=具备 manage_violations 的 owner / team_admin / group_leader
-- ============================================================

CREATE OR REPLACE FUNCTION public.publish_draft_actor_scope(p_user_id uuid)
RETURNS TABLE (
  can_review boolean,
  business_role text,
  visible_user_ids uuid[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_led_group_ids uuid[] := ARRAY[]::uuid[];
  v_visible_user_ids uuid[] := ARRAY[]::uuid[];
  v_business_role text := 'member';
  v_can_review boolean := false;
BEGIN
  IF auth.role() <> 'service_role' AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT *
  INTO v_profile
  FROM public.profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'member'::text, ARRAY[]::uuid[];
    RETURN;
  END IF;

  SELECT COALESCE(array_agg(g.id), ARRAY[]::uuid[])
  INTO v_led_group_ids
  FROM public.groups g
  WHERE g.leader_user_id = p_user_id;

  IF v_profile.role = 'owner' THEN
    v_business_role := 'owner';
  ELSIF v_profile.role = 'admin' AND COALESCE((v_profile.permissions ->> 'manage_members')::boolean, false) = true THEN
    v_business_role := 'team_admin';
  ELSIF v_profile.role = 'admin' AND COALESCE(array_length(v_led_group_ids, 1), 0) > 0 THEN
    v_business_role := 'group_leader';
  ELSE
    v_business_role := 'member';
  END IF;

  v_can_review := CASE
    WHEN v_business_role = 'owner' THEN true
    WHEN v_business_role = 'team_admin' THEN COALESCE((v_profile.permissions ->> 'manage_violations')::boolean, true)
    WHEN v_business_role = 'group_leader' THEN COALESCE((v_profile.permissions ->> 'manage_violations')::boolean, false)
    ELSE COALESCE((v_profile.permissions ->> 'manage_violations')::boolean, false)
  END;

  IF NOT v_can_review OR v_business_role = 'member' THEN
    RETURN QUERY SELECT false, v_business_role, ARRAY[]::uuid[];
    RETURN;
  END IF;

  IF v_business_role = 'owner' THEN
    SELECT COALESCE(array_agg(p.id), ARRAY[]::uuid[])
    INTO v_visible_user_ids
    FROM public.profiles p;
  ELSIF v_business_role = 'team_admin' AND v_profile.team_id IS NOT NULL THEN
    SELECT COALESCE(array_agg(p.id), ARRAY[]::uuid[])
    INTO v_visible_user_ids
    FROM public.profiles p
    WHERE p.team_id = v_profile.team_id;
  ELSIF v_business_role = 'group_leader' AND COALESCE(array_length(v_led_group_ids, 1), 0) > 0 THEN
    SELECT COALESCE(array_agg(p.id), ARRAY[]::uuid[])
    INTO v_visible_user_ids
    FROM public.profiles p
    WHERE p.group_id = ANY(v_led_group_ids);
  END IF;

  RETURN QUERY SELECT v_can_review, v_business_role, v_visible_user_ids;
END;
$$;

GRANT EXECUTE ON FUNCTION public.publish_draft_actor_scope(uuid) TO authenticated;

-- ============================================================
-- 审核队列 RPC：返回 pending 列表 + 待审计数
-- ============================================================
CREATE OR REPLACE FUNCTION public.publish_drafts_review_queue(p_user_id uuid)
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
  FROM public.publish_draft_actor_scope(p_user_id);

  IF NOT COALESCE(v_scope.can_review, false) THEN
    RETURN jsonb_build_object('queue', '[]'::jsonb, 'pending_count', 0);
  END IF;

  RETURN jsonb_build_object(
    'pending_count',
    (
      SELECT COUNT(*)::int
      FROM public.publish_drafts pd
      WHERE pd.is_deleted = false
        AND pd.status = 'pending'
        AND pd.submitted_by = ANY(v_scope.visible_user_ids)
    ),
    'queue',
    COALESCE((
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT
          pd.id,
          pd.script_text,
          pd.screenshot_paths,
          pd.account_id,
          pd.account_name_snapshot,
          pd.current_round,
          pd.feedback_history,
          pd.created_at,
          pd.updated_at,
          COALESCE(p.name, '未命名成员') AS submitted_by_name,
          pd.submitted_by
        FROM public.publish_drafts pd
        LEFT JOIN public.profiles p ON p.id = pd.submitted_by
        WHERE pd.is_deleted = false
          AND pd.status = 'pending'
          AND pd.submitted_by = ANY(v_scope.visible_user_ids)
        ORDER BY pd.created_at ASC
        LIMIT 100
      ) t
    ), '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.publish_drafts_review_queue(uuid) TO authenticated;

-- ============================================================
-- 已发列表 RPC（数据页）：所有人可见已通过条目
-- ============================================================
CREATE OR REPLACE FUNCTION public.publish_drafts_approved_list(
  p_limit int DEFAULT 50,
  p_account_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(t))
    FROM (
      SELECT
        pd.id,
        pd.script_text,
        pd.screenshot_paths,
        pd.account_id,
        pd.account_name_snapshot,
        pd.approved_at,
        COALESCE(p.name, '未命名成员') AS submitted_by_name,
        pd.submitted_by
      FROM public.publish_drafts pd
      LEFT JOIN public.profiles p ON p.id = pd.submitted_by
      WHERE pd.is_deleted = false
        AND pd.status = 'approved'
        AND (p_account_id IS NULL OR pd.account_id = p_account_id)
        AND (p_search IS NULL OR p_search = '' OR pd.script_text ILIKE '%' || p_search || '%')
      ORDER BY pd.approved_at DESC NULLS LAST, pd.created_at DESC
      LIMIT GREATEST(1, LEAST(p_limit, 200))
    ) t
  ), '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.publish_drafts_approved_list(int, uuid, text) TO authenticated;

-- rollback reference:
-- DROP FUNCTION IF EXISTS public.publish_drafts_approved_list(int, uuid, text);
-- DROP FUNCTION IF EXISTS public.publish_drafts_review_queue(uuid);
-- DROP FUNCTION IF EXISTS public.publish_draft_actor_scope(uuid);
-- DROP TRIGGER IF EXISTS trg_publish_drafts_updated_at ON public.publish_drafts;
-- DROP FUNCTION IF EXISTS public.publish_drafts_set_updated_at();
-- DROP TABLE IF EXISTS public.publish_drafts;
