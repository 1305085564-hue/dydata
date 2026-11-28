-- 入团审批由本人会话执行。守卫在函数内部，直调 REST/RPC 也不能绕过。
create or replace function public.review_team_join_request(
  p_request_id uuid,
  p_action text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reviewer uuid := auth.uid();
  v_actor public.profiles%rowtype;
  v_applicant public.profiles%rowtype;
  v_request public.team_join_requests%rowtype;
  v_actor_role text;
  v_applicant_role text;
begin
  if v_reviewer is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  end if;
  select * into v_actor from public.profiles where id = v_reviewer for update;
  v_actor_role := public.company_role_for_user(v_reviewer);
  if not found or v_actor.membership_status is distinct from 'active'
     or v_actor.team_id is null or v_actor_role is null
     or v_actor_role not in ('admin', 'company_owner') then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  if p_request_id is null or p_action is null or p_action not in ('approve', 'reject')
     or char_length(coalesce(p_note, '')) > 200 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
  end if;

  select * into v_request from public.team_join_requests where id = p_request_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_request.target_team_id is distinct from v_actor.team_id
     or v_request.applicant_user_id = v_reviewer then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  select * into v_applicant from public.profiles where id = v_request.applicant_user_id for update;
  -- company_role_for_user 禁止本人会话读取他人的角色；这里使用已锁定的可信资料。
  v_applicant_role := coalesce(v_applicant.company_role, case when v_applicant.role = 'owner' then 'company_owner' else v_applicant.role end);
  -- 待入团员工可无团队；已有其他团队的成员须走成员调配，不能借入团审批跨团队搬人。
  if not found or v_applicant.membership_status is distinct from 'active'
     or v_applicant_role is null or v_applicant_role not in ('member', 'admin')
     or (v_applicant.company_role is not null and v_applicant.role is not null
         and v_applicant.company_role <> case when v_applicant.role = 'owner' then 'company_owner' else v_applicant.role end)
     or (v_actor_role = 'admin' and v_applicant_role <> 'member')
     or (v_applicant.team_id is not null and v_applicant.team_id <> v_actor.team_id) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  if v_request.status <> 'pending' then
    return jsonb_build_object('ok', false, 'reason', 'already_reviewed');
  end if;

  if p_action = 'approve' then
    update public.profiles set team_id = v_actor.team_id where id = v_applicant.id;
  end if;
  update public.team_join_requests
    set status = case p_action when 'approve' then 'approved' else 'rejected' end,
        reviewed_by = v_reviewer, reviewed_at = now(), review_note = p_note
    where id = p_request_id;
  return jsonb_build_object('ok', true, 'status', case p_action when 'approve' then 'approved' else 'rejected' end);
end;
$$;

revoke all on function public.review_team_join_request(uuid, text, text) from public, anon;
grant execute on function public.review_team_join_request(uuid, text, text) to authenticated;
