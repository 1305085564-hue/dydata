-- 阶段三：补交申诉历史驳回原因与打回待审批。
-- 本文件只出 migration，不在本轮执行。
alter table public.fulfillment_appeals
  add column if not exists decision_reason text;

create or replace function public.handle_fulfillment_appeal(
  p_appeal_id uuid,
  p_decision text,
  p_handler_id uuid default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  result := public.handle_fulfillment_appeal(p_appeal_id, p_decision, p_handler_id);
  update public.fulfillment_appeals
  set decision_reason = case when p_decision = 'reject' then nullif(left(coalesce(p_reason, ''), 1000), '') else null end
  where id = p_appeal_id;
  return result;
end;
$$;

revoke all on function public.handle_fulfillment_appeal(uuid, text, uuid, text) from public, anon;
grant execute on function public.handle_fulfillment_appeal(uuid, text, uuid, text) to authenticated, service_role;

create or replace function public.reopen_fulfillment_appeal_atomically(
  p_appeal_id uuid,
  p_handler_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  appeal_record public.fulfillment_appeals%rowtype;
  resolved_handler_id uuid := coalesce(p_handler_id, auth.uid());
begin
  if not public.is_admin_or_owner() then
    raise exception 'permission denied';
  end if;

  select * into appeal_record
  from public.fulfillment_appeals
  where id = p_appeal_id
  for update;
  if not found then raise exception 'appeal not found'; end if;
  if appeal_record.status not in ('approved', 'rejected') then
    raise exception 'appeal is not handled';
  end if;

  update public.fulfillment_appeals
  set status = 'pending', handler_id = null, handled_at = null, decision_reason = null
  where id = p_appeal_id;

  if resolved_handler_id is not null then
    insert into public.audit_logs (user_id, action, target, detail)
    values (
      resolved_handler_id,
      'reopen_fulfillment_appeal',
      appeal_record.user_id::text,
      jsonb_build_object(
        'appeal_id', appeal_record.id,
        'account_id', appeal_record.account_id,
        'record_date', appeal_record.record_date,
        'previous_status', appeal_record.status,
        'reopened', true
      )::text
    );
  end if;

  return jsonb_build_object('id', appeal_record.id, 'status', 'pending', 'previous_status', appeal_record.status);
end;
$$;

revoke all on function public.reopen_fulfillment_appeal_atomically(uuid, uuid) from public, anon, service_role;
grant execute on function public.reopen_fulfillment_appeal_atomically(uuid, uuid) to authenticated;
