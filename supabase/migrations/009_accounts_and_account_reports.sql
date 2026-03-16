-- 009: Split people and accounts, migrate daily_reports to account_id

CREATE TABLE IF NOT EXISTS public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  name text NOT NULL,
  content_direction text,
  presentation_format text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT accounts_profile_id_name_key UNIQUE (profile_id, name)
);

CREATE INDEX IF NOT EXISTS accounts_profile_id_idx
  ON public.accounts (profile_id);

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accounts_select_own_or_admin"
  ON public.accounts
  FOR SELECT
  USING (profile_id = auth.uid() OR public.is_admin());

CREATE POLICY "accounts_insert_own_or_admin"
  ON public.accounts
  FOR INSERT
  WITH CHECK (profile_id = auth.uid() OR public.is_admin());

CREATE POLICY "accounts_update_own_or_admin"
  ON public.accounts
  FOR UPDATE
  USING (profile_id = auth.uid() OR public.is_admin())
  WITH CHECK (profile_id = auth.uid() OR public.is_admin());

CREATE POLICY "accounts_delete_own_or_admin"
  ON public.accounts
  FOR DELETE
  USING (profile_id = auth.uid() OR public.is_admin());

INSERT INTO public.accounts (profile_id, name)
SELECT p.id, p.name
FROM public.profiles p
ON CONFLICT (profile_id, name) DO NOTHING;

ALTER TABLE public.daily_reports
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.accounts (id) ON DELETE CASCADE;

UPDATE public.daily_reports dr
SET account_id = a.id
FROM public.accounts a
WHERE a.profile_id = dr.user_id
  AND a.name = dr.submitter
  AND dr.account_id IS NULL;

UPDATE public.daily_reports dr
SET account_id = a.id
FROM public.accounts a
WHERE a.profile_id = dr.user_id
  AND dr.account_id IS NULL;

ALTER TABLE public.daily_reports
  ALTER COLUMN account_id SET NOT NULL;

DROP INDEX IF EXISTS daily_reports_user_id_report_date_key;

CREATE UNIQUE INDEX IF NOT EXISTS daily_reports_account_id_report_date_key
  ON public.daily_reports (account_id, report_date);

CREATE INDEX IF NOT EXISTS daily_reports_account_id_idx
  ON public.daily_reports (account_id);

CREATE OR REPLACE FUNCTION public.owns_account(target_account_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.accounts
    WHERE id = target_account_id
      AND profile_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS "daily_reports_select_own_or_admin" ON public.daily_reports;
DROP POLICY IF EXISTS "daily_reports_insert_own_or_admin" ON public.daily_reports;
DROP POLICY IF EXISTS "daily_reports_update_own_or_admin" ON public.daily_reports;
DROP POLICY IF EXISTS "daily_reports_delete_own_or_admin" ON public.daily_reports;

CREATE POLICY "daily_reports_select_own_or_admin"
  ON public.daily_reports
  FOR SELECT
  USING (
    public.is_admin()
    OR user_id = auth.uid()
    OR public.owns_account(account_id)
  );

CREATE POLICY "daily_reports_insert_own_or_admin"
  ON public.daily_reports
  FOR INSERT
  WITH CHECK (
    public.is_admin()
    OR user_id = auth.uid()
    OR public.owns_account(account_id)
  );

CREATE POLICY "daily_reports_update_own_or_admin"
  ON public.daily_reports
  FOR UPDATE
  USING (
    public.is_admin()
    OR user_id = auth.uid()
    OR public.owns_account(account_id)
  )
  WITH CHECK (
    public.is_admin()
    OR user_id = auth.uid()
    OR public.owns_account(account_id)
  );

CREATE POLICY "daily_reports_delete_own_or_admin"
  ON public.daily_reports
  FOR DELETE
  USING (
    public.is_admin()
    OR user_id = auth.uid()
    OR public.owns_account(account_id)
  );

CREATE OR REPLACE FUNCTION get_today_submission_status()
RETURNS TABLE (
  user_id uuid,
  name text,
  submitted boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id AS user_id,
    p.name,
    EXISTS (
      SELECT 1
      FROM daily_reports dr
      JOIN accounts a ON a.id = dr.account_id
      WHERE a.profile_id = p.id
        AND dr.report_date = CURRENT_DATE
    ) AS submitted
  FROM profiles p
  WHERE p.role = 'member'
    AND NOT (
      COALESCE(p.status, 'active') = 'exempt'
      OR p.exempt_type = 'permanent'
      OR (
        p.exempt_type = 'temporary'
        AND p.exempt_start_date IS NOT NULL
        AND p.exempt_end_date IS NOT NULL
        AND CURRENT_DATE BETWEEN p.exempt_start_date AND p.exempt_end_date
      )
    );
$$;
