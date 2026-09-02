-- 日期级申请与审批明细。申请单保留作分组/兼容视图，真实审批状态以本表为准。
create table if not exists public.exemption_request_date (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.exemption_request(id) on delete cascade,
  request_date date not null,
  reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  feedback text,
  -- 历史 reviewed_by 可能对应已删除账号；保留 UUID，不建立强 FK。
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (request_id, request_date)
);

alter table public.exemption_request_date enable row level security;
grant select, insert on public.exemption_request_date to authenticated;
create index if not exists exemption_request_date_pending_idx
  on public.exemption_request_date (status, request_date);
create index if not exists exemption_request_date_request_idx
  on public.exemption_request_date (request_id, request_date);
drop index if exists public.exemption_grant_request_id_unique;
create unique index if not exists exemption_grant_request_date_unique
  on public.exemption_grant (request_id, start_date)
  where request_id is not null;

drop policy if exists "成员或管理员读取申请日期明细" on public.exemption_request_date;
create policy "成员或管理员读取申请日期明细"
  on public.exemption_request_date for select to authenticated
  using (
    exists (
      select 1 from public.exemption_request r
      where r.id = exemption_request_date.request_id
        and (r.applicant_user_id = auth.uid() or public.is_owner()
          or public.exemption_target_in_active_scope(auth.uid(), r.applicant_user_id, null))
    )
  );
create policy "成员提交自己的申请日期明细"
  on public.exemption_request_date for insert to authenticated
  with check (exists (
    select 1 from public.exemption_request r
    where r.id = exemption_request_date.request_id and r.applicant_user_id = auth.uid()
      and r.request_status = 'pending'
  ));

-- 回填历史区间；特殊豁免历史数据沿用申请原因，之后的新申请可逐日传入原因。
insert into public.exemption_request_date (request_id, request_date, reason, status, feedback, reviewed_by, reviewed_at)
select r.id, gs::date, r.reason, coalesce(r.request_status, 'pending'), null, r.reviewed_by, r.reviewed_at
from public.exemption_request r
cross join lateral generate_series(r.start_date, coalesce(r.end_date, r.start_date), interval '1 day') gs
on conflict (request_id, request_date) do nothing;

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

  if v_pending = 0 and v_rejected = 0 then
    perform set_config('dydata.exemption_write_authorized', '1', true);
    update public.profiles set
      status = case when v_request.exemption_type = 'permanent' then 'exempt' else 'active' end,
      exempt_type = case when v_request.exemption_type = 'permanent' then 'permanent' else 'temporary' end,
      exempt_start_date = case when v_request.exemption_type = 'permanent' then null else v_request.start_date end,
      exempt_end_date = case when v_request.exemption_type = 'permanent' then null else v_request.end_date end,
      exempt_reason = nullif(trim(v_request.reason), ''),
      exemption_category = coalesce(v_request.exemption_category, 'waive')
    where id = v_target.id;
  end if;

  return jsonb_build_object('request_id', p_request_id, 'decision', p_decision, 'dates', v_dates, 'feedback', nullif(trim(p_feedback), ''), 'pending_count', v_pending, 'approved_count', v_approved, 'rejected_count', v_rejected, 'grant_count', v_grant_count);
end;
$$;

revoke all on function public.review_exemption_request_dates_atomically(uuid, text, date[], text, text) from public, anon, service_role;
grant execute on function public.review_exemption_request_dates_atomically(uuid, text, date[], text, text) to authenticated;
