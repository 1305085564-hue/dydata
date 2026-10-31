-- Read-only service adapters for CloudBase Auth users.
-- These functions expose the Auth-owned profile fields needed by server code
-- without granting API roles direct access to auth.users or credential fields.

CREATE OR REPLACE FUNCTION public.cloudbase_auth_user_by_subject(p_subject text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'id', u.sub,
    'email', u.email,
    'phone', u.phone_number,
    'banned_until', CASE WHEN u.status = 1 THEN NULL::text ELSE 'infinity'::text END,
    'app_metadata', coalesce(u.raw_app_meta_data, '{}'::jsonb),
    'user_metadata', pg_catalog.jsonb_build_object('full_name', u.name),
    'created_at', u.created_at,
    'updated_at', u.updated_at
  )
  FROM auth.users AS u
  WHERE u.sub = p_subject;
$function$;

REVOKE ALL PRIVILEGES ON FUNCTION public.cloudbase_auth_user_by_subject(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cloudbase_auth_user_by_subject(text) TO service_role;

CREATE OR REPLACE FUNCTION public.cloudbase_auth_users_page(
  p_page integer DEFAULT 1,
  p_per_page integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
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
          u.created_at,
          u.updated_at
        FROM auth.users AS u
        ORDER BY u.id
        LIMIT page_bounds.per_page
        OFFSET ((page_bounds.page::bigint - 1) * page_bounds.per_page::bigint)
      ) AS page_rows
    ), '[]'::jsonb),
    'total', (SELECT pg_catalog.count(*) FROM auth.users),
    'page', page_bounds.page,
    'per_page', page_bounds.per_page
  )
  FROM page_bounds;
$function$;

REVOKE ALL PRIVILEGES ON FUNCTION public.cloudbase_auth_users_page(integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cloudbase_auth_users_page(integer, integer) TO service_role;
