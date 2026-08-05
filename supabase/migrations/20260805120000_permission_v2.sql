-- 20260805120000: 权限机制 V2，解耦角色、权限和数据范围

-- 1. profiles 新增 data_scope 字段，作为独立的数据范围控制
alter table public.profiles
  add column if not exists data_scope text not null default 'self'
  check (data_scope in ('self', 'team', 'all'));

-- 2. 根据现有 role + permissions 回填 data_scope
update public.profiles
set data_scope = 'all'
where role = 'owner';

update public.profiles
set data_scope = 'all'
where role = 'admin'
  and (permissions->>'view_all_data')::boolean = true;

update public.profiles
set data_scope = 'team'
where role = 'admin'
  and coalesce(data_scope, 'self') = 'self';

update public.profiles
set data_scope = 'self'
where role = 'member'
  and coalesce(data_scope, 'self') = 'self';

-- 3. 重命名 permissions JSONB 中的旧 key，保留已存在的新 key
update public.profiles
set permissions = jsonb_set(
  permissions - 'manage_violations',
  '{review_violations}',
  coalesce(permissions->'review_violations', permissions->'manage_violations'),
  true
)
where permissions ? 'manage_violations';

update public.profiles
set permissions = jsonb_set(
  permissions - 'view_conversion_hub',
  '{view_conversion}',
  coalesce(permissions->'view_conversion', permissions->'view_conversion_hub'),
  true
)
where permissions ? 'view_conversion_hub';

update public.profiles
set permissions = jsonb_set(
  permissions - 'view_content_review',
  '{review_content}',
  coalesce(permissions->'review_content', permissions->'view_content_review'),
  true
)
where permissions ? 'view_content_review';

update public.profiles
set permissions = jsonb_set(
  permissions - 'manage_video_assets',
  '{manage_videos}',
  coalesce(permissions->'manage_videos', permissions->'manage_video_assets'),
  true
)
where permissions ? 'manage_video_assets';

update public.profiles
set permissions = jsonb_set(
  permissions - 'use_ai_copywriting',
  '{use_ai_copy}',
  coalesce(permissions->'use_ai_copy', permissions->'use_ai_copywriting'),
  true
)
where permissions ? 'use_ai_copywriting';

update public.profiles
set permissions = jsonb_set(
  permissions - 'use_ai_management',
  '{use_ai_assist}',
  coalesce(permissions->'use_ai_assist', permissions->'use_ai_management'),
  true
)
where permissions ? 'use_ai_management';

-- 4. 删除旧 key，把数据范围从 permissions 中彻底移出
update public.profiles
set permissions = permissions - 'view_all_data' - 'edit_data';

-- 5. 给原 admin 补 manage_fulfillment=true，补齐新权限模板
update public.profiles
set permissions = permissions || '{"manage_fulfillment": true}'::jsonb
where role = 'admin'
  and not (permissions ? 'manage_fulfillment');

-- 6. 给 owner 补 manage_system=true，确保系统权限显式落库
update public.profiles
set permissions = permissions || '{"manage_system": true}'::jsonb
where role = 'owner'
  and not (permissions ? 'manage_system');

-- 7. 重写 has_permission(perm) 函数：owner 直接放行，其余按 JSONB 判断
create or replace function public.has_permission(perm text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and (
        role = 'owner'
        or coalesce((permissions->>perm)::boolean, false) = true
      )
  );
$$;

-- 8. 新增 get_data_scope() 函数，统一读取当前登录用户的数据范围
create or replace function public.get_data_scope()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select data_scope from public.profiles where id = auth.uid()),
    'self'
  );
$$;

-- 9. 删除 profiles.group_id 列前，先移除相关索引
drop index if exists public.idx_profiles_group_id;

alter table public.profiles
  drop column if exists group_id;

-- 10. 删除 profiles.access_level 列，旧数据范围字段不再使用
alter table public.profiles
  drop column if exists access_level;

-- 11. leader_daily_reports 已废弃，先整表删除，避免 group_id 外键残留
drop table if exists public.leader_daily_reports cascade;

-- 12. 删除 groups 表前，先清理已知依赖的 index 和 policy
drop index if exists public.idx_groups_leader_user_id;

drop policy if exists "成员读取所属团队分组" on public.groups;
drop policy if exists "仅管理员写入分组" on public.groups;
drop policy if exists "仅管理员更新分组" on public.groups;
drop policy if exists "仅管理员删除分组" on public.groups;
drop policy if exists "groups_service_role_bypass" on public.groups;

-- 13. 删除 groups 表；CASCADE 会清掉其它表上残留的引用约束
drop table if exists public.groups cascade;
