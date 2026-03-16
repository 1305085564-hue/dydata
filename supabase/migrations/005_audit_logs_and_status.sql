-- Add status column to profiles (for exempt tracking)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'exempt'));

-- Add used boolean column to invite_codes (derived from used_by, but explicit for queries)
ALTER TABLE public.invite_codes
  ADD COLUMN IF NOT EXISTS used boolean NOT NULL DEFAULT false;

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  action text NOT NULL,
  target text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON public.audit_logs (created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read/write audit logs
CREATE POLICY "audit_logs_admin_select"
  ON public.audit_logs
  FOR SELECT
  USING (public.is_admin());

CREATE POLICY "audit_logs_admin_insert"
  ON public.audit_logs
  FOR INSERT
  WITH CHECK (public.is_admin());

-- Update get_today_submission_status to exclude exempt members
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
    AND COALESCE(p.status, 'active') != 'exempt';
$$;
