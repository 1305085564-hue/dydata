-- CloudBase Auth 管理员读取：补齐最近登录时间，并将 RPC 收口到 service_role。

CREATE OR REPLACE FUNCTION public.cloudbase_auth_users_page(
  p_page integer DEFAULT 1,
  p_per_page integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'service role required';
  END IF;

  WITH page_bounds AS (
    SELECT
      greatest(coalesce(p_page, 1), 1) AS page,
      least(greatest(coalesce(p_per_page, 50), 1), 200) AS per_page
  )
  SELECT pg_catalog.jsonb_build_object(
    'users', coalesce((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', page_rows.sub,
          'email', page_rows.email,
          'phone', page_rows.phone_number,
          'banned_until', CASE WHEN page_rows.status = 1 THEN NULL::text ELSE 'infinity'::text END,
          'app_metadata', coalesce(page_rows.raw_app_meta_data, '{}'::jsonb),
          'user_metadata', pg_catalog.jsonb_build_object('full_name', page_rows.name),
          'last_sign_in_at', page_rows.last_login,
          'created_at', page_rows.created_at,
          'updated_at', page_rows.updated_at
        ) ORDER BY page_rows.internal_id
      )
      FROM (
        SELECT
          u.id AS internal_id,
          u.sub,
          u.email,
          u.phone_number,
          u.status,
          u.raw_app_meta_data,
          u.name,
          u.last_login,
          u.created_at,
          u.updated_at
        FROM auth.users AS u
        ORDER BY u.id
        LIMIT (SELECT page_bounds.per_page FROM page_bounds)
        OFFSET (
          (SELECT page_bounds.page::bigint FROM page_bounds) - 1
        ) * (SELECT page_bounds.per_page::bigint FROM page_bounds)
      ) AS page_rows
    ), '[]'::jsonb),
    'total', (SELECT pg_catalog.count(*) FROM auth.users),
    'page', page_bounds.page,
    'per_page', page_bounds.per_page
  )
  INTO v_result
  FROM page_bounds;

  RETURN v_result;
END;
$function$;

REVOKE ALL PRIVILEGES ON FUNCTION public.cloudbase_auth_users_page(integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cloudbase_auth_users_page(integer, integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.cloudbase_auth_user_by_subject(p_subject text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'service role required';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'id', u.sub,
    'email', u.email,
    'phone', u.phone_number,
    'banned_until', CASE WHEN u.status = 1 THEN NULL::text ELSE 'infinity'::text END,
    'app_metadata', coalesce(u.raw_app_meta_data, '{}'::jsonb),
    'user_metadata', pg_catalog.jsonb_build_object('full_name', u.name),
    'last_sign_in_at', u.last_login,
    'created_at', u.created_at,
    'updated_at', u.updated_at
  )
  INTO v_user
  FROM auth.users AS u
  WHERE u.sub = p_subject
  LIMIT 1;

  RETURN v_user;
END;
$function$;

REVOKE ALL PRIVILEGES ON FUNCTION public.cloudbase_auth_user_by_subject(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cloudbase_auth_user_by_subject(text)
  TO service_role;
