-- Function to get today's submission status for all members
-- Uses SECURITY DEFINER to bypass RLS
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
  WHERE p.role = 'member';
$$;
