-- CloudBase 密码更新：仅服务端 service_role 可调，保持腾讯云 auth.users 密码编码。

CREATE OR REPLACE FUNCTION public.cloudbase_set_auth_user_password(
  p_subject text,
  p_password text,
  p_project text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_subject text := pg_catalog.btrim(coalesce(p_subject, ''));
  v_password text := pg_catalog.btrim(coalesce(p_password, ''));
  v_project text := pg_catalog.btrim(coalesce(p_project, ''));
  v_now timestamptz := pg_catalog.timezone('utc', pg_catalog.now());
  v_updated integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'service role required';
  END IF;

  IF v_subject !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_subject');
  END IF;
  IF v_project = '' OR pg_catalog.length(v_project) > 64 OR v_project !~ '^[a-zA-Z0-9-]+$' THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_project');
  END IF;
  IF v_password = ''
    OR pg_catalog.length(v_password) < 6
    OR pg_catalog.length(v_password) > 128
    OR pg_catalog.octet_length(v_password) > 72 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_password');
  END IF;

  UPDATE auth.users
  SET password = pg_catalog.replace(
      pg_catalog.encode(
        pg_catalog.convert_to(public.crypt(v_password, public.gen_salt('bf', 10)), 'UTF8'),
        'base64'
      ),
      pg_catalog.chr(10),
      ''
    ),
    updated_at = v_now
  WHERE project = v_project
    AND sub = v_subject
    AND status = 1;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    IF EXISTS (SELECT 1 FROM auth.users WHERE project = v_project AND sub = v_subject) THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'account_disabled');
    END IF;
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'user_not_found');
  END IF;

  RETURN pg_catalog.jsonb_build_object('ok', true, 'subject', v_subject);
END;
$function$;

REVOKE ALL PRIVILEGES ON FUNCTION public.cloudbase_set_auth_user_password(text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cloudbase_set_auth_user_password(text, text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.cloudbase_change_own_password(
  p_subject text,
  p_old_password text,
  p_new_password text,
  p_project text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_subject text := pg_catalog.btrim(coalesce(p_subject, ''));
  v_old_password text := coalesce(p_old_password, '');
  v_new_password text := coalesce(p_new_password, '');
  v_project text := pg_catalog.btrim(coalesce(p_project, ''));
  v_existing_password text;
  v_existing_hash text;
  v_account_status smallint;
  v_now timestamptz := pg_catalog.timezone('utc', pg_catalog.now());
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'service role required';
  END IF;

  IF v_subject !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_subject');
  END IF;
  IF v_project = '' OR pg_catalog.length(v_project) > 64 OR v_project !~ '^[a-zA-Z0-9-]+$' THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_project');
  END IF;
  IF pg_catalog.length(pg_catalog.btrim(v_old_password)) < 6
    OR pg_catalog.length(v_old_password) > 128
    OR pg_catalog.octet_length(v_old_password) > 72
    OR pg_catalog.length(pg_catalog.btrim(v_new_password)) < 6
    OR pg_catalog.length(v_new_password) > 128
    OR pg_catalog.octet_length(v_new_password) > 72 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_password');
  END IF;
  IF v_old_password = v_new_password THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'same_password');
  END IF;

  SELECT u.password, u.status
  INTO v_existing_password, v_account_status
  FROM auth.users AS u
  WHERE u.project = v_project
    AND u.sub = v_subject
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'user_not_found');
  END IF;
  IF v_account_status IS DISTINCT FROM 1 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'account_disabled');
  END IF;
  v_existing_hash := pg_catalog.convert_from(pg_catalog.decode(v_existing_password, 'base64'), 'UTF8');
  IF public.crypt(v_old_password, v_existing_hash) IS DISTINCT FROM v_existing_hash THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_old_password');
  END IF;

  UPDATE auth.users
  SET password = pg_catalog.replace(
      pg_catalog.encode(
        pg_catalog.convert_to(public.crypt(v_new_password, public.gen_salt('bf', 10)), 'UTF8'),
        'base64'
      ),
      pg_catalog.chr(10),
      ''
    ),
    updated_at = v_now
  WHERE project = v_project AND sub = v_subject;

  INSERT INTO public.audit_logs (user_id, action, target, detail)
  VALUES (v_subject::uuid, 'change_own_password', v_subject, NULL);

  RETURN pg_catalog.jsonb_build_object('ok', true, 'subject', v_subject);
END;
$function$;

REVOKE ALL PRIVILEGES ON FUNCTION public.cloudbase_change_own_password(text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cloudbase_change_own_password(text, text, text, text)
  TO service_role;
