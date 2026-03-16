-- 重要：profiles 表豁免字段只能通过应用层操作，不要手动修改
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS exempt_type text,
  ADD COLUMN IF NOT EXISTS exempt_start_date date,
  ADD COLUMN IF NOT EXISTS exempt_end_date date,
  ADD COLUMN IF NOT EXISTS exempt_reason text;

UPDATE public.profiles
SET exempt_type = 'permanent'
WHERE status = 'exempt'
  AND exempt_type IS NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_exemption_fields_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_exemption_fields_check
  CHECK (
    (
      exempt_type IS NULL
      AND exempt_start_date IS NULL
      AND exempt_end_date IS NULL
      AND exempt_reason IS NULL
      AND status = 'active'
    )
    OR (
      exempt_type = 'permanent'
      AND exempt_start_date IS NULL
      AND exempt_end_date IS NULL
      AND status = 'exempt'
    )
    OR (
      exempt_type = 'temporary'
      AND exempt_start_date IS NOT NULL
      AND exempt_end_date IS NOT NULL
      AND exempt_start_date <= exempt_end_date
      AND status = 'active'
    )
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
      SELECT 1 FROM daily_reports dr
      WHERE dr.user_id = p.id
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
