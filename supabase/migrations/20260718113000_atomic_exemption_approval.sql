-- 豁免写入必须在数据库事务内完成，并且只信任 auth.uid()。
-- 旧签名允许调用方传入 reviewer/team/profile 投影；即使校验了 manage_members，
-- 仍缺少目标团队范围校验，team_admin 可借此跨团队写入。

drop function if exists public.apply_exemption_grant_atomically(
  uuid, uuid, uuid, uuid, date, date, text, text, text, text, text, date, date, boolean
);
drop function if exists public.approve_exemption_request_atomically(
  uuid, uuid, uuid, uuid, date, date, text, text, text, text, text, date, date, boolean
);

-- 用户会话只允许修改自己的显示名称；角色、权限、团队和豁免投影均由可信后端写入。
revoke update, insert on table public.profiles from authenticated;
grant update (name) on table public.profiles to authenticated;

-- 同时收紧表级 RLS，避免绕过 RPC 直接走 PostgREST 跨团队写入。
drop policy if exists "成员读取自己的豁免申请" on public.exemption_request;
drop policy if exists "成员提交自己的豁免申请" on public.exemption_request;
drop policy if exists "仅管理员审核豁免申请" on public.exemption_request;
drop policy if exists "仅管理员删除豁免申请" on public.exemption_request;

create policy "成员或范围管理员读取豁免申请"
  on public.exemption_request
  for select
  to authenticated
  using (
    applicant_user_id = auth.uid()
    or public.is_owner()
    or (
      (
        public.has_permission('manage_members')
        or exists (
          select 1
          from public.groups managed_group
          where managed_group.leader_user_id = auth.uid()
        )
      )
      and exists (
        select 1
        from public.profiles actor
        join public.profiles applicant on applicant.id = exemption_request.applicant_user_id
        where actor.id = auth.uid()
          and actor.team_id is not null
          and actor.team_id = applicant.team_id
      )
    )
  );

create policy "成员提交自己的豁免申请"
  on public.exemption_request
  for insert
  to authenticated
  with check (
    applicant_user_id = auth.uid()
    and request_status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and exists (
      select 1
      from public.profiles actor
      where actor.id = auth.uid()
        and actor.team_id is not distinct from exemption_request.team_id
    )
  );

-- 认证用户只能提交申请内容；审核状态、审核人、审核时间和创建时间只由数据库默认值/RPC 维护。
revoke insert on table public.exemption_request from anon, authenticated;
grant insert (
  applicant_user_id,
  team_id,
  exemption_type,
  start_date,
  end_date,
  reason,
  exemption_category
) on table public.exemption_request to authenticated;

drop policy if exists "成员读取自己的豁免授予" on public.exemption_grant;
drop policy if exists "仅管理员写入豁免授予" on public.exemption_grant;
drop policy if exists "仅管理员更新豁免授予" on public.exemption_grant;
drop policy if exists "仅管理员删除豁免授予" on public.exemption_grant;

create policy "成员或范围管理员读取豁免授予"
  on public.exemption_grant
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_owner()
    or (
      (
        public.has_permission('manage_members')
        or exists (
          select 1
          from public.groups managed_group
          where managed_group.leader_user_id = auth.uid()
        )
      )
      and exists (
        select 1
        from public.profiles actor
        join public.profiles recipient on recipient.id = exemption_grant.user_id
        where actor.id = auth.uid()
          and actor.team_id is not null
          and actor.team_id = recipient.team_id
      )
    )
  );

-- grant 写入、request 审核与删除不再给 authenticated 建 policy；
-- 唯一入口是下方 SECURITY DEFINER RPC，service_role 仍由 Supabase 固有旁路处理。

-- 一份申请最多生成一条 grant；NULL request_id 的后台手工授权仍可有多条历史记录。
create unique index if not exists exemption_grant_request_id_unique
  on public.exemption_grant (request_id)
  where request_id is not null;

create or replace function public.guard_profile_exemption_projection()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if (
    new.status is distinct from old.status
    or new.exempt_type is distinct from old.exempt_type
    or new.exempt_start_date is distinct from old.exempt_start_date
    or new.exempt_end_date is distinct from old.exempt_end_date
    or new.exempt_reason is distinct from old.exempt_reason
    or new.exemption_category is distinct from old.exemption_category
  )
    and coalesce(current_setting('dydata.exemption_write_authorized', true), '') <> '1'
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = '豁免字段只能通过授权流程修改';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_profile_exemption_projection on public.profiles;
create trigger guard_profile_exemption_projection
before update of status, exempt_type, exempt_start_date, exempt_end_date, exempt_reason, exemption_category
on public.profiles
for each row
execute function public.guard_profile_exemption_projection();

revoke all on function public.guard_profile_exemption_projection() from public;
revoke all on function public.guard_profile_exemption_projection() from anon;
revoke all on function public.guard_profile_exemption_projection() from authenticated;

create or replace function public.apply_exemption_grant_atomically(
  p_user_id uuid,
  p_grant_start_date date,
  p_grant_end_date date,
  p_grant_type text,
  p_exemption_category text,
  p_reason text,
  p_replace_existing boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor public.profiles%rowtype;
  v_target public.profiles%rowtype;
  v_grant_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = '无权限管理豁免';
  end if;

  perform 1
  from public.profiles
  where id in (auth.uid(), p_user_id)
  order by id
  for update;

  select * into v_actor from public.profiles where id = auth.uid();
  if not found then
    raise exception using errcode = '42501', message = '无权限管理豁免';
  end if;

  select * into v_target from public.profiles where id = p_user_id;
  if not found then
    raise exception using errcode = 'P0002', message = '用户资料不存在';
  end if;

  if v_actor.role <> 'owner'
    and not public.has_permission('manage_members')
    and not (
      v_actor.role = 'admin'
      and exists (
        select 1
        from public.groups managed_group
        where managed_group.leader_user_id = v_actor.id
      )
    ) then
    raise exception using errcode = '42501', message = '无权限管理豁免';
  end if;

  if v_actor.role <> 'owner'
    and (
      v_actor.team_id is null
      or v_target.team_id is distinct from v_actor.team_id
    ) then
    raise exception using errcode = '42501', message = '不能跨团队管理豁免';
  end if;

  if p_grant_type is null
    or p_grant_type not in ('single', '3days', '4days', '5days', 'yesterday', 'range', 'permanent') then
    raise exception using errcode = '22023', message = '豁免类型不正确';
  end if;

  if p_exemption_category is null
    or p_exemption_category not in ('waive', 'leave') then
    raise exception using errcode = '22023', message = '豁免分类不正确';
  end if;

  if p_grant_type = 'permanent' then
    if p_grant_start_date is null or p_grant_end_date is not null then
      raise exception using errcode = '22023', message = '豁免日期不正确';
    end if;

    if nullif(trim(p_reason), '') is null then
      raise exception using errcode = '22023', message = '永久豁免必须填写原因';
    end if;
  elsif p_grant_start_date is null
    or p_grant_end_date is null
    or p_grant_start_date > p_grant_end_date then
    raise exception using errcode = '22023', message = '豁免日期不正确';
  end if;

  if p_replace_existing or p_grant_type = 'permanent' then
    update public.exemption_grant
    set status = 'inactive'
    where user_id = p_user_id
      and status = 'active';
  end if;

  insert into public.exemption_grant (
    request_id,
    user_id,
    team_id,
    start_date,
    end_date,
    grant_type,
    exemption_category,
    status
  ) values (
    null,
    p_user_id,
    v_target.team_id,
    p_grant_start_date,
    p_grant_end_date,
    p_grant_type,
    p_exemption_category,
    'active'
  )
  returning id into v_grant_id;

  perform set_config('dydata.exemption_write_authorized', '1', true);
  update public.profiles
  set
    status = case when p_grant_type = 'permanent' then 'exempt' else 'active' end,
    exempt_type = case when p_grant_type = 'permanent' then 'permanent' else 'temporary' end,
    exempt_start_date = case when p_grant_type = 'permanent' then null else p_grant_start_date end,
    exempt_end_date = case when p_grant_type = 'permanent' then null else p_grant_end_date end,
    exempt_reason = nullif(trim(p_reason), ''),
    exemption_category = p_exemption_category
  where id = p_user_id;

  return jsonb_build_object('grant_id', v_grant_id, 'user_id', p_user_id);
end;
$$;

create or replace function public.clear_exemption_grant_atomically(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor public.profiles%rowtype;
  v_target public.profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = '无权限管理豁免';
  end if;

  perform 1
  from public.profiles
  where id in (auth.uid(), p_user_id)
  order by id
  for update;

  select * into v_actor from public.profiles where id = auth.uid();
  if not found then
    raise exception using errcode = '42501', message = '无权限管理豁免';
  end if;

  select * into v_target from public.profiles where id = p_user_id;
  if not found then
    raise exception using errcode = 'P0002', message = '用户资料不存在';
  end if;

  if v_actor.role <> 'owner'
    and not public.has_permission('manage_members')
    and not (
      v_actor.role = 'admin'
      and exists (
        select 1
        from public.groups managed_group
        where managed_group.leader_user_id = v_actor.id
      )
    ) then
    raise exception using errcode = '42501', message = '无权限管理豁免';
  end if;

  if v_actor.role <> 'owner'
    and (
      v_actor.team_id is null
      or v_target.team_id is distinct from v_actor.team_id
    ) then
    raise exception using errcode = '42501', message = '不能跨团队管理豁免';
  end if;

  update public.exemption_grant
  set status = 'inactive'
  where user_id = p_user_id
    and status = 'active';

  perform set_config('dydata.exemption_write_authorized', '1', true);
  update public.profiles
  set
    status = 'active',
    exempt_type = null,
    exempt_start_date = null,
    exempt_end_date = null,
    exempt_reason = null,
    exemption_category = null
  where id = p_user_id;

  return jsonb_build_object('user_id', p_user_id, 'cleared', true);
end;
$$;

create or replace function public.review_exemption_request_atomically(
  p_request_id uuid,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor public.profiles%rowtype;
  v_target public.profiles%rowtype;
  v_request public.exemption_request%rowtype;
  v_grant_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = '无权限审批豁免';
  end if;

  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception using errcode = '22023', message = '审核决定不正确';
  end if;

  -- 先做不触碰申请的通用资格检查，普通成员无法用 UUID 探测申请状态。
  select * into v_actor
  from public.profiles
  where id = auth.uid();
  if not found then
    raise exception using errcode = '42501', message = '无权限审批豁免';
  end if;

  if v_actor.role <> 'owner'
    and not public.has_permission('manage_members')
    and not (
      v_actor.role = 'admin'
      and exists (
        select 1
        from public.groups managed_group
        where managed_group.leader_user_id = v_actor.id
      )
    ) then
    raise exception using errcode = '42501', message = '无权限审批豁免';
  end if;

  -- 只有通用审核权限通过后才读取申请；非 owner 也看不到其他团队的申请是否存在。
  select request_row.*
  into v_request
  from public.exemption_request request_row
  where request_row.id = p_request_id
    and (
      v_actor.role = 'owner'
      or (
        v_actor.team_id is not null
        and exists (
          select 1
          from public.profiles scoped_target
          where scoped_target.id = request_row.applicant_user_id
            and scoped_target.team_id = v_actor.team_id
        )
      )
    )
  for update of request_row;
  if not found then
    raise exception using errcode = 'P0002', message = '申请不存在';
  end if;

  -- 按 UUID 固定顺序锁住操作人和申请人，避免两人互相操作时死锁。
  perform 1
  from public.profiles
  where id in (auth.uid(), v_request.applicant_user_id)
  order by id
  for update;

  select * into v_actor from public.profiles where id = auth.uid();
  if not found then
    raise exception using errcode = '42501', message = '无权限审批豁免';
  end if;

  select * into v_target
  from public.profiles
  where id = v_request.applicant_user_id;
  if not found then
    raise exception using errcode = 'P0002', message = '用户资料不存在';
  end if;

  -- 锁定后重新校验，防止并发的角色、权限或团队变更造成越权。
  if v_actor.role <> 'owner'
    and not public.has_permission('manage_members')
    and not (
      v_actor.role = 'admin'
      and exists (
        select 1
        from public.groups managed_group
        where managed_group.leader_user_id = v_actor.id
      )
    ) then
    raise exception using errcode = '42501', message = '无权限审批豁免';
  end if;

  if v_actor.role <> 'owner'
    and (
      v_actor.team_id is null
      or v_target.team_id is distinct from v_actor.team_id
    ) then
    raise exception using errcode = 'P0002', message = '申请不存在';
  end if;

  if v_request.request_status <> 'pending' then
    raise exception using errcode = 'P0001', message = '该申请已处理';
  end if;

  if p_decision = 'approved' then
    if v_request.team_id is distinct from v_target.team_id then
      raise exception using errcode = 'P0001', message = '申请人与团队不一致';
    end if;

    if v_request.exemption_type is null
      or v_request.exemption_type not in ('single', '3days', '4days', '5days', 'yesterday', 'range', 'permanent') then
      raise exception using errcode = '22023', message = '豁免类型不正确';
    end if;

    if v_request.exemption_category is null
      or v_request.exemption_category not in ('waive', 'leave') then
      raise exception using errcode = '22023', message = '豁免分类不正确';
    end if;

    if v_request.exemption_type = 'permanent' then
      if v_request.start_date is null or v_request.end_date is not null then
        raise exception using errcode = '22023', message = '豁免日期不正确';
      end if;

      if nullif(trim(v_request.reason), '') is null then
        raise exception using errcode = '22023', message = '永久豁免必须填写原因';
      end if;

      update public.exemption_grant
      set status = 'inactive'
      where user_id = v_target.id
        and status = 'active';
    elsif v_request.start_date is null
      or v_request.end_date is null
      or v_request.start_date > v_request.end_date then
      raise exception using errcode = '22023', message = '豁免日期不正确';
    end if;

    insert into public.exemption_grant (
      request_id,
      user_id,
      team_id,
      start_date,
      end_date,
      grant_type,
      exemption_category,
      status
    ) values (
      v_request.id,
      v_target.id,
      v_target.team_id,
      v_request.start_date,
      v_request.end_date,
      v_request.exemption_type,
      v_request.exemption_category,
      'active'
    )
    returning id into v_grant_id;

    perform set_config('dydata.exemption_write_authorized', '1', true);
    update public.profiles
    set
      status = case when v_request.exemption_type = 'permanent' then 'exempt' else 'active' end,
      exempt_type = case when v_request.exemption_type = 'permanent' then 'permanent' else 'temporary' end,
      exempt_start_date = case when v_request.exemption_type = 'permanent' then null else v_request.start_date end,
      exempt_end_date = case when v_request.exemption_type = 'permanent' then null else v_request.end_date end,
      exempt_reason = nullif(trim(v_request.reason), ''),
      exemption_category = v_request.exemption_category
    where id = v_target.id;
  end if;

  update public.exemption_request
  set
    request_status = p_decision,
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = p_request_id;

  return jsonb_build_object(
    'request_id', p_request_id,
    'decision', p_decision,
    'grant_id', v_grant_id
  );
end;
$$;

revoke all on function public.apply_exemption_grant_atomically(uuid, date, date, text, text, text, boolean)
  from public;
revoke all on function public.apply_exemption_grant_atomically(uuid, date, date, text, text, text, boolean)
  from anon;
revoke all on function public.apply_exemption_grant_atomically(uuid, date, date, text, text, text, boolean)
  from service_role;
grant execute on function public.apply_exemption_grant_atomically(uuid, date, date, text, text, text, boolean)
  to authenticated;

revoke all on function public.clear_exemption_grant_atomically(uuid)
  from public;
revoke all on function public.clear_exemption_grant_atomically(uuid)
  from anon;
revoke all on function public.clear_exemption_grant_atomically(uuid)
  from service_role;
grant execute on function public.clear_exemption_grant_atomically(uuid)
  to authenticated;

revoke all on function public.review_exemption_request_atomically(uuid, text)
  from public;
revoke all on function public.review_exemption_request_atomically(uuid, text)
  from anon;
revoke all on function public.review_exemption_request_atomically(uuid, text)
  from service_role;
grant execute on function public.review_exemption_request_atomically(uuid, text)
  to authenticated;
