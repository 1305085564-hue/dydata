CREATE OR REPLACE FUNCTION validate_invite_code(p_code text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM invite_codes
  WHERE code = p_code
    AND used_by IS NULL
    AND (expires_at IS NULL OR expires_at > now());
$$;
