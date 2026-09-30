alter table public.fulfillment_appeals
  add column if not exists account_id uuid references public.accounts(id) on delete cascade;

drop index if exists public.idx_fulfillment_appeals_pending_unique;
create unique index if not exists idx_fulfillment_appeals_pending_unique
  on public.fulfillment_appeals (user_id, account_id, record_date)
  where status = 'pending';

create index if not exists idx_fulfillment_appeals_account_date
  on public.fulfillment_appeals (account_id, record_date desc);

create or replace function public.handle_fulfillment_appeal(
  p_appeal_id uuid,
  p_decision text,
  p_handler_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  appeal_record public.fulfillment_appeals%rowtype;
  resolved_handler_id uuid;
  resolved_status text;
begin
  if not public.is_admin_or_owner() then
    raise exception 'permission denied';
  end if;

  if p_decision not in ('approve', 'reject') then
    raise exception 'invalid decision: %', p_decision;
  end if;

  resolved_handler_id := coalesce(
    p_handler_id,
    auth.uid()
  );

  select * into appeal_record
  from public.fulfillment_appeals
  where id = p_appeal_id
  for update;

  if not found then
    raise exception 'appeal not found';
  end if;

  if appeal_record.status <> 'pending' then
    raise exception 'appeal already handled';
  end if;

  resolved_status := case when p_decision = 'approve' then 'approved' else 'rejected' end;

  update public.fulfillment_appeals
  set status = resolved_status,
      handler_id = resolved_handler_id,
      handled_at = now()
  where id = appeal_record.id;

  if resolved_handler_id is not null then
    insert into public.audit_logs (user_id, action, target, detail)
    values (
      resolved_handler_id,
      'handle_fulfillment_appeal',
      appeal_record.user_id::text,
      jsonb_build_object(
        'appeal_id', appeal_record.id,
        'account_id', appeal_record.account_id,
        'record_date', appeal_record.record_date,
        'decision', resolved_status
      )::text
    );
  end if;

  return jsonb_build_object(
    'id', appeal_record.id,
    'status', resolved_status,
    'account_id', appeal_record.account_id,
    'record_date', appeal_record.record_date,
    'user_id', appeal_record.user_id
  );
end;
$$;

revoke all on function public.handle_fulfillment_appeal(uuid, text, uuid) from public, anon;
grant execute on function public.handle_fulfillment_appeal(uuid, text, uuid) to authenticated, service_role;

insert into public.notifications (
  user_id,
  type,
  category,
  severity,
  title,
  body,
  action_label,
  action_url,
  payload,
  source_type,
  source_id,
  expires_at
)
select
  p.id,
  'system.announcement',
  'feed',
  'info',
  '数据上传规则已更新',
  '作品日期按平台真实发布时间计算；同月 72 小时内可直接补交，跨月或超过 72 小时需要申请补交并等待管理审批。',
  '去上传数据',
  '/dashboard',
  jsonb_build_object('announcement', 'video_submission_deadline_2026_09'),
  'video_submission_policy',
  '2026-09-30-v1',
  now() + interval '30 days'
from public.profiles p
where p.membership_status = 'active'
on conflict (user_id, type, source_type, source_id) do nothing;
