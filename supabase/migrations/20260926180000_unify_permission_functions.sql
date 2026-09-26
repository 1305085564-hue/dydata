-- Unify database role permissions with src/lib/permission-contract.ts.
-- 2026-09-26：固定权限表新增 view_video_review（作品复盘只读查看）。
--   只读能力：数据管理（/admin/collaboration）里打开单条作品复盘详情，
--   不授予 /admin/content 页面访问，也不激活入库 / 移出选题库等 review_content 写操作。
--   应用层放行点：src/lib/route-permissions.ts 的 canReadWorkVideo()。
-- 本文件是 get_role_permissions 的完整快照（与 20260915141335 同源，只增一个权限键），
-- 供 src/lib/permission-migration.test.ts 与 TypeScript 契约做逐项比对。
-- Group-mode authorization remains token-bound in is_group_mode_active(text);
-- has_permission(text) must never infer group mode from a session row alone.

create or replace function public.get_role_permissions(
  p_role text,
  p_group_mode boolean default false
)
returns text[]
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
  if p_group_mode then
    return array[
      'view_analytics', 'export_data', 'view_conversion',
      'review_content', 'view_video_review', 'manage_fulfillment', 'manage_videos',
      'manage_members', 'review_violations', 'manage_system',
      'use_ai_copy', 'use_ai_assist'
    ];
  end if;

  p_role := case when p_role = 'owner' then 'company_owner' else p_role end;

  case p_role
    when 'member' then
      return array['view_analytics', 'export_data', 'view_video_review'];
    when 'admin' then
      return array[
        'view_analytics', 'export_data', 'view_conversion',
        'review_content', 'view_video_review', 'manage_fulfillment', 'manage_videos',
        'manage_members', 'review_violations', 'use_ai_copy'
      ];
    when 'company_owner' then
      return array[
        'view_analytics', 'export_data', 'view_conversion',
        'review_content', 'view_video_review', 'manage_fulfillment', 'manage_videos',
        'manage_members', 'review_violations', 'manage_system',
        'use_ai_copy', 'use_ai_assist'
      ];
    else
      return array[]::text[];
  end case;
end;
$$;

create or replace function public.has_permission(perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    perm = any(
      public.get_role_permissions(
        coalesce(
          p.company_role,
          case when p.role = 'owner' then 'company_owner' else p.role end
        ),
        false
      )
    ),
    false
  )
  from public.profiles p
  where p.id = auth.uid()
    and p.membership_status = 'active';
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.membership_status = 'active'
      and coalesce(
        p.company_role,
        case when p.role = 'owner' then 'company_owner' else p.role end
      ) in ('admin', 'company_owner')
  );
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.membership_status = 'active'
      and coalesce(
        p.company_role,
        case when p.role = 'owner' then 'company_owner' else p.role end
      ) = 'company_owner'
  );
$$;

create or replace function public.is_admin_or_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'role' = 'service_role', false)
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.membership_status = 'active'
        and coalesce(
          p.company_role,
          case when p.role = 'owner' then 'company_owner' else p.role end
        ) in ('admin', 'company_owner')
    );
$$;

comment on function public.get_role_permissions(text, boolean) is
  'Fixed role permission contract synchronized with src/lib/permission-contract.ts.';
comment on function public.has_permission(text) is
  'Checks the active current user fixed role permissions; group mode remains token-bound.';
comment on function public.is_admin() is
  'True for active admin or company_owner profiles.';
comment on function public.is_owner() is
  'True only for an active company_owner profile.';
comment on function public.is_admin_or_owner() is
  'True for service_role or active admin/company_owner profiles.';

revoke all on function public.get_role_permissions(text, boolean) from public, anon;
revoke all on function public.has_permission(text) from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.is_owner() from public, anon;
revoke all on function public.is_admin_or_owner() from public, anon;

grant execute on function public.get_role_permissions(text, boolean) to authenticated, service_role;
grant execute on function public.has_permission(text) to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.is_owner() to authenticated, service_role;
grant execute on function public.is_admin_or_owner() to authenticated, service_role;
