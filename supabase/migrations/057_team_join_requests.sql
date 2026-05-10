-- 057: team_join_requests — 新用户注册即申请加入团队，管理员审核通过后 profiles.team_id 落地
-- 去邀请码 + 未分配用户体验 + 管理员审批流

-- =============================
-- 表结构
-- =============================
create table if not exists public.team_join_requests (
  id uuid primary key default gen_random_uuid(),
  applicant_user_id uuid not null references auth.users(id) on delete cascade,
  target_team_id uuid not null references public.teams(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default timezone('utc'::text, now())
);

-- 一人一时只能有一条 pending 申请
create unique index if not exists team_join_requests_one_pending_per_user
  on public.team_join_requests (applicant_user_id)
  where status = 'pending';

create index if not exists team_join_requests_status_idx
  on public.team_join_requests (status);

create index if not exists team_join_requests_target_team_idx
  on public.team_join_requests (target_team_id);

alter table public.team_join_requests enable row level security;

-- =============================
-- RLS
-- =============================
drop policy if exists "申请人或管理员可读申请" on public.team_join_requests;
drop policy if exists "申请人仅可创建自己的 pending 申请" on public.team_join_requests;
drop policy if exists "申请人仅可撤销自己的 pending 申请" on public.team_join_requests;

create policy "申请人或管理员可读申请"
  on public.team_join_requests
  for select
  using (
    applicant_user_id = auth.uid()
    or public.is_admin()
  );

create policy "申请人仅可创建自己的 pending 申请"
  on public.team_join_requests
  for insert
  with check (
    applicant_user_id = auth.uid()
    and status = 'pending'
  );

create policy "申请人仅可撤销自己的 pending 申请"
  on public.team_join_requests
  for delete
  using (
    applicant_user_id = auth.uid()
    and status = 'pending'
  );

-- =============================
-- 审批 RPC（SECURITY DEFINER，只允 admin/owner）
-- =============================
create or replace function public.review_team_join_request(
  p_request_id uuid,
  p_action text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reviewer uuid := auth.uid();
  v_request public.team_join_requests;
  v_affected integer;
begin
  if v_reviewer is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  end if;

  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  if p_action not in ('approve', 'reject') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_action');
  end if;

  select * into v_request
  from public.team_join_requests
  where id = p_request_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_request.status <> 'pending' then
    return jsonb_build_object('ok', false, 'reason', 'already_reviewed');
  end if;

  if p_action = 'approve' then
    update public.profiles
      set team_id = v_request.target_team_id
      where id = v_request.applicant_user_id;

    update public.team_join_requests
      set status = 'approved',
          reviewed_by = v_reviewer,
          reviewed_at = now(),
          review_note = p_note
      where id = p_request_id
        and status = 'pending';

    get diagnostics v_affected = row_count;
    if v_affected = 0 then
      return jsonb_build_object('ok', false, 'reason', 'already_reviewed');
    end if;

    return jsonb_build_object('ok', true, 'status', 'approved');
  end if;

  -- reject
  update public.team_join_requests
    set status = 'rejected',
        reviewed_by = v_reviewer,
        reviewed_at = now(),
        review_note = p_note
    where id = p_request_id
      and status = 'pending';

  get diagnostics v_affected = row_count;
  if v_affected = 0 then
    return jsonb_build_object('ok', false, 'reason', 'already_reviewed');
  end if;

  return jsonb_build_object('ok', true, 'status', 'rejected');
end;
$$;

grant execute on function public.review_team_join_request(uuid, text, text) to authenticated;

comment on table public.team_join_requests is
  '新用户注册后申请加入团队，管理员审批通过后写入 profiles.team_id。一人仅允许一条 pending。';
comment on function public.review_team_join_request(uuid, text, text) is
  '审批入团申请。p_action in (approve, reject)。仅 admin/owner 可调用。';
