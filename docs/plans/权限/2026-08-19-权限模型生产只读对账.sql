-- DYData 权限模型生产只读对账
-- 当前确认的 Supabase project ref：gcrhhxaopomtposmahsw
-- 本文件只包含 SELECT，不会修改生产数据、策略或 migration 状态。
-- migration 状态另执行：
-- supabase --workdir /Users/mac/Projects/dydata migration list --linked

-- 1. 当前数据库、版本和 project ref 线索
select
  current_database() as database_name,
  current_user as database_user,
  version() as postgres_version;

-- 2. 所有启用 RLS 的表，以及四类操作是否存在策略
with rls_tables as (
  select n.nspname as schema_name, c.relname as table_name
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind = 'r'
    and c.relrowsecurity
    and n.nspname not in ('pg_catalog', 'information_schema')
), operations as (
  select * from (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as v(operation)
)
select
  r.schema_name,
  r.table_name,
  o.operation,
  count(p.policyname) filter (where p.cmd in ('ALL', o.operation)) as matching_policy_count,
  coalesce(string_agg(p.policyname, ', ' order by p.policyname) filter (where p.cmd in ('ALL', o.operation)), '') as policy_names
from rls_tables r
cross join operations o
left join pg_policies p
  on p.schemaname = r.schema_name
 and p.tablename = r.table_name
group by r.schema_name, r.table_name, o.operation
order by r.schema_name, r.table_name, o.operation;

-- 3. 原始策略：检查 USING、WITH CHECK 和 permissive policy 组合
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual as using_expression,
  with_check as with_check_expression
from pg_policies
where schemaname not in ('pg_catalog', 'information_schema')
order by schemaname, tablename, policyname;

-- 4. profiles 角色、范围和归档字段的真实结构
select
  table_schema,
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'profiles',
    'group_permission_qualifications',
    'group_mode_sessions',
    'exemption_request',
    'exemption_grant'
  )
order by table_name, ordinal_position;

-- 5. CHECK、外键和唯一约束
select
  n.nspname as schema_name,
  cls.relname as table_name,
  con.conname as constraint_name,
  case con.contype
    when 'c' then 'CHECK'
    when 'f' then 'FOREIGN KEY'
    when 'u' then 'UNIQUE'
    when 'p' then 'PRIMARY KEY'
    else con.contype::text
  end as constraint_type,
  pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class cls on cls.oid = con.conrelid
join pg_namespace n on n.oid = cls.relnamespace
where n.nspname = 'public'
  and cls.relname in (
    'profiles',
    'group_permission_qualifications',
    'group_mode_sessions',
    'exemption_request',
    'exemption_grant'
  )
order by cls.relname, con.conname;

-- 6. SECURITY DEFINER 函数、search_path 和完整定义
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  p.proconfig as function_configuration,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
order by p.proname, arguments;

-- 7. 关键函数是否存在以及是否固定 search_path
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  coalesce(array_to_string(p.proconfig, ', '), '') as configuration
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'company_role_for_user',
    'has_group_owner_qualification',
    'is_group_mode_active',
    'visible_user_ids',
    'active_visible_user_ids',
    'visible_user_ids_v2',
    'active_visible_user_ids_v2',
    'has_permission',
    'admin_pending_submissions_today',
    'admin_cockpit_summary'
  )
order by p.proname, arguments;

-- 8. 表级授权：service_role 和 authenticated 的真实权限
select
  grantee,
  table_schema,
  table_name,
  string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema in ('public', 'storage')
  and grantee in ('anon', 'authenticated', 'service_role')
group by grantee, table_schema, table_name
order by grantee, table_schema, table_name;

-- 9. Storage bucket、公开状态和对象路径元数据
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
order by id;

select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual as using_expression,
  with_check as with_check_expression
from pg_policies
where schemaname = 'storage'
  and tablename in ('objects', 'buckets')
order by tablename, policyname;

-- 10. 线上新权限模型对象是否已经存在
select
  table_schema,
  table_name,
  exists (
    select 1
    from information_schema.columns c
    where c.table_schema = t.table_schema
      and c.table_name = t.table_name
      and c.column_name = 'company_role'
  ) as has_company_role_column
from information_schema.tables t
where t.table_schema = 'public'
  and t.table_name in (
    'profiles',
    'group_permission_qualifications',
    'group_mode_sessions'
  )
order by table_name;
