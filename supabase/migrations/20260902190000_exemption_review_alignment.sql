-- 审批链路对齐修复（2026-09-02 代码审查产出）：
-- 1. 逐日审批 RPC 补齐旧 RPC 的 permanent/团队/类型校验与 permanent 停用其他 active grant；
--    profiles 豁免投影改为「无 pending 后按剩余 active grant 重算」，修复部分批准/部分拒绝后投影失真。
-- 2. 改判 RPC 同步逐日明细表，并按 request_id 处理全部 grant 行（逐日模型一 request 多行），
--    修复 SELECT INTO 只取任意一行导致的多日申请改判数据错乱。
-- 3. 应用代码统一路由到逐日 RPC（见 src/lib/exemption-review.ts），旧 review RPC 不再被新调用使用。

create or replace function public.review_exemption_request_dates_atomically(
  p_request_id uuid,
  p_decision text,
  p_dates date[] default null,
  p_feedback text default null,
  p_group_mode_token_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.exemption_request%rowtype;
  v_target public.profiles%rowtype;
  v_dates date[];
  v_pending int;
  v_approved int;
  v_rejected int;
  v_grant_count int := 0;
  v_remaining_grant public.exemption_grant%rowtype;
  v_remaining_reason text;
  v_remaining_category text;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = '无权限审批豁免'; end if;
  if p_decision not in ('approved', 'rejected') then raise exception using errcode = '22023', message = '审核决定不正确'; end if;
  if not (public.has_permission('manage_fulfillment') or public.has_permission('review_violations') or public.is_group_mode_active(p_group_mode_token_hash)) then
    raise exception using errcode = '42501', message = '无权限审批豁免';
  end if;

  select * into v_request from public.exemption_request where id = p_request_id for update;
  if not found then raise exception using errcode = 'P0002', message = '申请不存在'; end if;
  if v_request.applicant_user_id = auth.uid() or not public.exemption_target_in_active_scope(auth.uid(), v_request.applicant_user_id, p_group_mode_token_hash) then
    raise exception using errcode = '42501', message = '不能操作当前管理范围外的成员';
  end if;
  select * into v_target from public.profiles where id = v_request.applicant_user_id;
  if not found or coalesce(v_target.membership_status, 'active') = 'archived' then raise exception using errcode = 'P0002', message = '用户资料不存在'; end if;

  -- 与旧 review RPC 对齐的批准前置校验：拒绝不需要（历史拒绝单也允许改判日期）。
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
      update public.exemption_grant set status = 'inactive'
      where user_id = v_target.id and status = 'active';
    end if;
  end if;

  insert into public.exemption_request_date (request_id, request_date, reason, status)
  select v_request.id, gs::date, v_request.reason, coalesce(v_request.request_status, 'pending')
  from generate_series(v_request.start_date, coalesce(v_request.end_date, v_request.start_date), interval '1 day') gs
  on conflict (request_id, request_date) do nothing;

  if p_dates is null or cardinality(p_dates) = 0 then
    select array_agg(request_date order by request_date) into v_dates
    from public.exemption_request_date where request_id = p_request_id and status = 'pending';
  else
    v_dates := (select array_agg(distinct d order by d) from unnest(p_dates) d);
    if exists (select 1 from unnest(v_dates) d where not exists (select 1 from public.exemption_request_date where request_id = p_request_id and request_date = d)) then
      raise exception using errcode = '22023', message = '审批日期不属于该申请';
    end if;
  end if;
  if v_dates is null or cardinality(v_dates) = 0 then raise exception using errcode = 'P0001', message = '该申请已处理'; end if;

  update public.exemption_request_date
  set status = p_decision, feedback = nullif(trim(p_feedback), ''), reviewed_by = auth.uid(), reviewed_at = now()
  where request_id = p_request_id and request_date = any(v_dates) and status = 'pending';
  if not found then raise exception using errcode = 'P0001', message = '该申请已处理'; end if;

  if p_decision = 'approved' then
    insert into public.exemption_grant (request_id, user_id, team_id, start_date, end_date, grant_type, exemption_category, status)
    select p_request_id, v_target.id, v_target.team_id, d.request_date,
      case when v_request.exemption_type = 'permanent' then null else d.request_date end,
      v_request.exemption_type, coalesce(v_request.exemption_category, 'waive'), 'active'
    from public.exemption_request_date d
    where d.request_id = p_request_id and d.request_date = any(v_dates) and d.status = 'approved'
    on conflict do nothing;
    get diagnostics v_grant_count = row_count;
  end if;

  select count(*) filter (where status = 'pending'), count(*) filter (where status = 'approved'), count(*) filter (where status = 'rejected')
    into v_pending, v_approved, v_rejected from public.exemption_request_date where request_id = p_request_id;
  update public.exemption_request set
    request_status = case when v_pending > 0 then 'pending' when v_rejected > 0 then 'rejected' else 'approved' end,
    reviewed_by = case when v_pending = 0 then auth.uid() else reviewed_by end,
    reviewed_at = case when v_pending = 0 then now() else reviewed_at end
  where id = p_request_id;

  -- 无剩余 pending 日期时，按剩余 active grant 重算 profiles 豁免投影（永久优先，否则最新 active），
  -- 与改判 RPC 同一套口径；全部批准时本次新插入的 grant 即参与重算。
  if v_pending = 0 then
    select grant_row.* into v_remaining_grant
    from public.exemption_grant grant_row
    where grant_row.user_id = v_target.id
      and grant_row.status = 'active'
    order by (grant_row.grant_type = 'permanent') desc, grant_row.created_at desc
    limit 1;

    v_remaining_reason := null;
    v_remaining_category := v_remaining_grant.exemption_category;
    if v_remaining_grant.id is not null then
      select
        request_row.reason,
        case
          when request_row.id is null then grant_row.exemption_category
          else request_row.exemption_category
        end
      into v_remaining_reason, v_remaining_category
      from public.exemption_grant grant_row
      left join public.exemption_request request_row
        on request_row.id = grant_row.request_id
      where grant_row.id = v_remaining_grant.id;
    end if;

    perform set_config('dydata.exemption_write_authorized', '1', true);
    if v_remaining_grant.id is null then
      update public.profiles
      set status = 'active', exempt_type = null, exempt_start_date = null,
          exempt_end_date = null, exempt_reason = null, exemption_category = null
      where id = v_target.id;
    elsif v_remaining_grant.grant_type = 'permanent' then
      update public.profiles
      set status = 'exempt', exempt_type = 'permanent', exempt_start_date = null,
          exempt_end_date = null, exempt_reason = v_remaining_reason, exemption_category = v_remaining_category
      where id = v_target.id;
    else
      update public.profiles
      set status = 'active', exempt_type = 'temporary', exempt_start_date = v_remaining_grant.start_date,
          exempt_end_date = v_remaining_grant.end_date, exempt_reason = v_remaining_reason, exemption_category = v_remaining_category
      where id = v_target.id;
    end if;
  end if;

  return jsonb_build_object('request_id', p_request_id, 'decision', p_decision, 'dates', v_dates, 'feedback', nullif(trim(p_feedback), ''), 'pending_count', v_pending, 'approved_count', v_approved, 'rejected_count', v_rejected, 'grant_count', v_grant_count);
end;
$$;

revoke all on function public.review_exemption_request_dates_atomically(uuid, text, date[], text, text) from public, anon, service_role;
grant execute on function public.review_exemption_request_dates_atomically(uuid, text, date[], text, text) to authenticated;


create or replace function public.re_review_exemption_request_atomically(
  p_request_id uuid,
  p_decision text,
  p_group_mode_token_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor public.profiles%rowtype;
  v_request public.exemption_request%rowtype;
  v_target public.profiles%rowtype;
  v_grant_count int := 0;
  v_grant_id uuid;
  v_remaining_grant public.exemption_grant%rowtype;
  v_remaining_reason text;
  v_remaining_category text;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = '无权限审批豁免';
  end if;
  select * into v_actor from public.profiles where id = auth.uid();
  if not found or coalesce(v_actor.membership_status, 'active') <> 'active' then
    raise exception using errcode = '42501', message = '无权限审批豁免';
  end if;
  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception using errcode = '22023', message = '审核决定不正确';
  end if;
  if not (
    (public.is_group_mode_active(p_group_mode_token_hash)
      or public.has_permission('manage_fulfillment')
      or public.has_permission('review_violations'))
    and public.exemption_target_in_active_scope(auth.uid(), auth.uid(), p_group_mode_token_hash)
  ) then
    raise exception using errcode = '42501', message = '无权限审批豁免';
  end if;

  select request_row.*
  into v_request
  from public.exemption_request request_row
  where request_row.id = p_request_id
    and request_row.applicant_user_id <> auth.uid()
    and public.exemption_target_in_active_scope(auth.uid(), request_row.applicant_user_id, p_group_mode_token_hash)
  for update of request_row;
  if not found then
    raise exception using errcode = 'P0002', message = '申请不存在';
  end if;

  perform 1
  from public.profiles
  where id in (auth.uid(), v_request.applicant_user_id)
  order by id
  for update;

  select * into v_target from public.profiles where id = v_request.applicant_user_id;
  if not found or coalesce(v_target.membership_status, 'active') = 'archived' then
    raise exception using errcode = 'P0002', message = '用户资料不存在';
  end if;
  if not public.exemption_target_in_active_scope(auth.uid(), v_target.id, p_group_mode_token_hash) then
    raise exception using errcode = 'P0002', message = '申请不存在';
  end if;
  if v_request.request_status is null
    or v_request.request_status not in ('approved', 'rejected') then
    raise exception using errcode = 'P0001', message = '仅支持改判已审批的申请';
  end if;
  if v_request.request_status = p_decision then
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
    elsif v_request.start_date is null or v_request.end_date is null
      or v_request.start_date > v_request.end_date then
      raise exception using errcode = '22023', message = '豁免日期不正确';
    end if;
  end if;

  -- 逐日明细与申请单同步改判，避免明细永久停留在旧状态。
  insert into public.exemption_request_date (request_id, request_date, reason, status)
  select v_request.id, gs::date, v_request.reason, coalesce(v_request.request_status, 'pending')
  from generate_series(v_request.start_date, coalesce(v_request.end_date, v_request.start_date), interval '1 day') gs
  on conflict (request_id, request_date) do nothing;

  update public.exemption_request_date
  set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now()
  where request_id = p_request_id;

  -- 逐日模型：一个 request 可能对应多行 grant，改判必须整组处理，不能只取任意一行。
  if p_decision = 'rejected' then
    update public.exemption_grant
    set status = 'inactive'
    where request_id = p_request_id and status = 'active';
    get diagnostics v_grant_count = row_count;
  else
    update public.exemption_grant
    set status = 'active',
        user_id = v_target.id,
        team_id = v_target.team_id,
        grant_type = v_request.exemption_type,
        exemption_category = v_request.exemption_category
    where request_id = p_request_id;
    get diagnostics v_grant_count = row_count;

    -- 改判为同意时，此前被拒绝的日期没有 grant 行，需按逐日明细补齐；
    -- 存量无明细行时按整段区间补一行，保持旧改判行为兜底。
    insert into public.exemption_grant (
      request_id, user_id, team_id, start_date, end_date, grant_type,
      exemption_category, status
    )
    select p_request_id, v_target.id, v_target.team_id, d.request_date,
      case when v_request.exemption_type = 'permanent' then null else d.request_date end,
      v_request.exemption_type, coalesce(v_request.exemption_category, 'waive'), 'active'
    from public.exemption_request_date d
    where d.request_id = p_request_id
      and not exists (
        select 1 from public.exemption_grant g
        where g.request_id = p_request_id and g.start_date = d.request_date
      )
    on conflict do nothing;
  end if;

  -- Profile 豁免投影依据剩余 active grant 重算：永久优先，否则最新 active
  select grant_row.* into v_remaining_grant
  from public.exemption_grant grant_row
  where grant_row.user_id = v_target.id
    and grant_row.status = 'active'
  order by (grant_row.grant_type = 'permanent') desc, grant_row.created_at desc
  limit 1;

  v_remaining_reason := null;
  v_remaining_category := v_remaining_grant.exemption_category;
  if v_remaining_grant.id is not null then
    select
      request_row.reason,
      case
        when request_row.id is null then grant_row.exemption_category
        else request_row.exemption_category
      end
    into v_remaining_reason, v_remaining_category
    from public.exemption_grant grant_row
    left join public.exemption_request request_row
      on request_row.id = grant_row.request_id
    where grant_row.id = v_remaining_grant.id;
  end if;

  perform set_config('dydata.exemption_write_authorized', '1', true);
  if v_remaining_grant.id is null then
    update public.profiles
    set
      status = 'active',
      exempt_type = null,
      exempt_start_date = null,
      exempt_end_date = null,
      exempt_reason = null,
      exemption_category = null
    where id = v_target.id;
  elsif v_remaining_grant.grant_type = 'permanent' then
    update public.profiles
    set
      status = 'exempt',
      exempt_type = 'permanent',
      exempt_start_date = null,
      exempt_end_date = null,
      exempt_reason = v_remaining_reason,
      exemption_category = v_remaining_category
    where id = v_target.id;
  else
    update public.profiles
    set
      status = 'active',
      exempt_type = 'temporary',
      exempt_start_date = v_remaining_grant.start_date,
      exempt_end_date = v_remaining_grant.end_date,
      exempt_reason = v_remaining_reason,
      exemption_category = v_remaining_category
    where id = v_target.id;
  end if;

  update public.exemption_request
  set request_status = p_decision, reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_request_id;

  return jsonb_build_object(
    'request_id', p_request_id,
    'decision', p_decision,
    'grant_id', v_grant_id,
    'grant_count', v_grant_count
  );
end;
$$;

revoke all on function public.re_review_exemption_request_atomically(uuid, text, text) from public, anon, service_role;
grant execute on function public.re_review_exemption_request_atomically(uuid, text, text) to authenticated;

-- 允许成员删除自己仍处于 pending 的申请：申请接口逐日明细写入失败时清理残留申请单，
-- 避免"提交失败但无法重新提交同一日期"的孤儿单。已审批申请不可删除。
drop policy if exists "成员删除自己待审批的申请" on public.exemption_request;
create policy "成员删除自己待审批的申请"
  on public.exemption_request for delete to authenticated
  using (applicant_user_id = auth.uid() and request_status = 'pending');
