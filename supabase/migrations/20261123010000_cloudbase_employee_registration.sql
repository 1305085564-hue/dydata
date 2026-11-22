-- CloudBase PG 员工注册与自检失败回滚（仅服务端 service_role 可调）。
-- 依赖腾讯云内部密码存储格式；如果自检开始失败，改用官方 CreateUser（方案 B）。
-- 发版时由负责人确认后在正式库执行；不动既有表结构、账号、审批流程与权限规则。

CREATE OR REPLACE FUNCTION public.cloudbase_register_employee(
  p_project text,
  p_email text,
  p_password text,
  p_name text,
  p_team_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_project text;
  v_email text;
  v_name text;
  v_user_id uuid;
  v_password_hash text;
  v_now timestamptz := pg_catalog.timezone('utc', pg_catalog.now());
BEGIN
  -- 依赖腾讯云内部密码存储格式；如果自检开始失败，改用官方 CreateUser（方案 B）
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'service role required';
  END IF;

  v_project := pg_catalog.btrim(coalesce(p_project, ''));
  v_email := pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, '')));
  v_name := pg_catalog.btrim(coalesce(p_name, ''));

  IF v_project = '' OR pg_catalog.length(v_project) > 128 OR v_project !~ '^[a-zA-Z0-9-]+$' THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_input', 'detail', 'invalid_project');
  END IF;

  IF v_email = ''
    OR pg_catalog.length(v_email) > 320
    OR pg_catalog.strpos(v_email, '@') <= 1
    OR v_email ~ '[[:space:]]' THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_input', 'detail', 'invalid_email');
  END IF;

  IF v_name = '' OR pg_catalog.length(v_name) > 100 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_input', 'detail', 'invalid_name');
  END IF;

  IF p_password IS NULL
    OR pg_catalog.length(p_password) < 6
    OR pg_catalog.octet_length(p_password) > 72 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_input', 'detail', 'invalid_password');
  END IF;

  IF p_team_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_team', 'detail', 'missing_team');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.teams WHERE id = p_team_id) THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_team', 'detail', 'team_not_found');
  END IF;

  -- 同项目同邮箱并发串行化，避免同一人重复提交建出两个账号。
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('cloudbase_register_employee'),
    pg_catalog.hashtext(v_project || ':' || v_email)
  );

  IF EXISTS (
    SELECT 1
    FROM auth.users AS u
    WHERE u.project = v_project
      AND (
        pg_catalog.lower(coalesce(u.email, '')) = v_email
        OR pg_catalog.lower(coalesce(u.username, '')) = v_email
      )
  ) THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'email_already_exists', 'detail', 'duplicate_email');
  END IF;

  v_user_id := pg_catalog.gen_random_uuid();
  -- 依赖腾讯云内部密码存储格式；如果自检开始失败，改用官方 CreateUser（方案 B）
  v_password_hash := pg_catalog.replace(
    pg_catalog.encode(
      pg_catalog.convert_to(public.crypt(p_password, public.gen_salt('bf', 10)), 'UTF8'),
      'base64'
    ),
    pg_catalog.chr(10),
    ''
  );

  BEGIN
    INSERT INTO auth.users (
      project,
      sub,
      name,
      username,
      email,
      password,
      status,
      email_verified,
      type,
      providers,
      created_at,
      updated_at
    ) VALUES (
      v_project,
      v_user_id::text,
      v_name,
      v_email,
      v_email,
      v_password_hash,
      1,
      true,
      'external',
      '[]'::jsonb,
      v_now,
      v_now
    );
  EXCEPTION
    WHEN unique_violation THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'email_already_exists', 'detail', 'unique_violation');
  END;

  -- 以下三张业务表写入与上面的建号同处一个事务：任一步失败整笔回滚，不留半截账号。
  INSERT INTO public.profiles (
    id,
    name,
    role,
    team_id,
    permissions
  ) VALUES (
    v_user_id,
    v_name,
    'member',
    NULL,
    '{}'::jsonb
  );

  INSERT INTO public.accounts (
    profile_id,
    name
  ) VALUES (
    v_user_id,
    v_name
  );

  INSERT INTO public.team_join_requests (
    applicant_user_id,
    target_team_id
  ) VALUES (
    v_user_id,
    p_team_id
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'user_id', v_user_id::text,
    'email', v_email
  );
END;
$function$;

REVOKE ALL PRIVILEGES ON FUNCTION public.cloudbase_register_employee(text, text, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cloudbase_register_employee(text, text, text, text, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.cloudbase_rollback_registered_employee(
  p_project text,
  p_user_id uuid,
  p_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_project text;
  v_email text;
  v_auth_count integer;
  v_deleted_auth integer;
  v_deleted_profile integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'service role required';
  END IF;

  v_project := pg_catalog.btrim(coalesce(p_project, ''));
  v_email := pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, '')));

  IF v_project = '' OR p_user_id IS NULL OR v_email = '' THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_input', 'detail', 'missing_rollback_target');
  END IF;

  -- 只允许清理 15 分钟内刚建好且未归属团队的普通注册账号，避免误删既有员工。
  SELECT pg_catalog.count(*) INTO v_auth_count
  FROM auth.users AS u
  WHERE u.project = v_project
    AND u.sub = p_user_id::text
    AND pg_catalog.lower(coalesce(u.email, '')) = v_email
    AND u.type = 'external'
    AND u.created_at >= pg_catalog.now() - interval '15 minutes';

  IF v_auth_count <> 1 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'not_rollback_eligible', 'detail', 'auth_user_not_matched');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = p_user_id
      AND (
        p.team_id IS NOT NULL
        OR p.role IS DISTINCT FROM 'member'
        OR p.company_role IS DISTINCT FROM 'member'
        OR p.created_at < pg_catalog.now() - interval '15 minutes'
      )
  ) THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'not_rollback_eligible', 'detail', 'profile_not_rollback_eligible');
  END IF;

  DELETE FROM public.team_join_requests
  WHERE applicant_user_id = p_user_id;

  DELETE FROM public.accounts
  WHERE profile_id = p_user_id;

  DELETE FROM public.profiles
  WHERE id = p_user_id
    AND team_id IS NULL
    AND role = 'member';
  GET DIAGNOSTICS v_deleted_profile = ROW_COUNT;

  DELETE FROM auth.users
  WHERE project = v_project
    AND sub = p_user_id::text
    AND pg_catalog.lower(coalesce(email, '')) = v_email
    AND type = 'external';
  GET DIAGNOSTICS v_deleted_auth = ROW_COUNT;

  IF v_deleted_auth <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'rollback auth delete mismatch';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'deleted_auth', v_deleted_auth,
    'deleted_profile', v_deleted_profile
  );
END;
$function$;

REVOKE ALL PRIVILEGES ON FUNCTION public.cloudbase_rollback_registered_employee(text, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cloudbase_rollback_registered_employee(text, uuid, text)
  TO service_role;
