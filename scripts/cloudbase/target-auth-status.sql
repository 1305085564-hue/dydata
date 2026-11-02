-- CloudBase PG only. Apply through the isolated batch runner after review.
-- Matches the console's observed BLOCKED=3. Only status changes, never credentials.
CREATE FUNCTION public.cloudbase_set_auth_user_status(
  p_subject text, p_status smallint, p_project text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user auth.users%ROWTYPE;
  v_count integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'service role required';
  END IF;
  IF p_subject IS NULL OR length(p_subject) = 0 OR length(p_subject) > 64
    OR p_subject IS DISTINCT FROM trim(p_subject)
    OR p_status IS NULL OR p_status NOT IN (1, 3)
    OR p_project IS NULL OR length(p_project) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid status request';
  END IF;
  SELECT count(*) INTO v_count FROM auth.users
    WHERE sub = p_subject AND project = p_project;
  IF v_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'unique target required';
  END IF;
  SELECT * INTO STRICT v_user FROM auth.users
    WHERE sub = p_subject AND project = p_project FOR UPDATE;
  -- Pending and unknown statuses must never become active through archive restore.
  IF v_user.status NOT IN (1, 3) OR v_user.status IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'account status not restorable';
  END IF;
  UPDATE auth.users SET status = p_status
    WHERE id = v_user.id AND sub = p_subject AND project = p_project;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'exact status write required';
  END IF;
  RETURN pg_catalog.jsonb_build_object('subject', p_subject, 'status', p_status);
END;
$function$;

REVOKE ALL PRIVILEGES ON FUNCTION public.cloudbase_set_auth_user_status(text, smallint, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cloudbase_set_auth_user_status(text, smallint, text)
  TO service_role;
