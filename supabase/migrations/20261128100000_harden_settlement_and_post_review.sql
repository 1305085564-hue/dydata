-- 两个复合外键与父行共用 PostgreSQL 的并发保护。仅事后单生成非空引用键。
-- 在同一事务中安装并验证存量。先运行 precheck-c8-and-hardening.mjs。
alter table public.videos add constraint videos_post_review_key unique (id, user_id, account_id);
alter table public.daily_reports add constraint daily_reports_post_review_key unique (id, video_id, user_id, account_id);

alter table public.fulfillment_appeals
  add column post_review_user_id uuid generated always as
    (case when review_mode = 'post_submit' then user_id end) stored,
  add constraint post_review_requires_targets check (
    review_mode <> 'post_submit' or
    (user_id is not null and account_id is not null and video_id is not null and daily_report_id is not null)
  ),
  add constraint post_review_video_owner_fk foreign key (video_id, post_review_user_id, account_id)
    references public.videos (id, user_id, account_id),
  add constraint post_review_report_owner_fk foreign key (daily_report_id, video_id, post_review_user_id, account_id)
    references public.daily_reports (id, video_id, user_id, account_id);

-- 使用调用点的有效数据库角色。普通字段走快路径，普通角色自行设置会话变量也没有维护权。
create function public.guard_review_settlement_fields() returns trigger
language plpgsql security invoker set search_path = pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    if new.settlement_excluded is false and new.settlement_excluded_reason is null
      and new.settlement_excluded_at is null and new.settlement_excluded_by is null then
      return new;
    end if;
  elsif row(new.settlement_excluded, new.settlement_excluded_reason, new.settlement_excluded_at, new.settlement_excluded_by)
    is not distinct from
    row(old.settlement_excluded, old.settlement_excluded_reason, old.settlement_excluded_at, old.settlement_excluded_by) then
    return new;
  end if;

  -- 直接维护须为真实服务角色、表所有者或数据库管理员。
  if current_user = coalesce(nullif(current_setting('role'), 'none'), session_user)
    and (current_user = 'service_role' or exists (
      select 1 from pg_roles r
      where r.rolname = current_user and
        (r.rolsuper or r.oid = (select relowner from pg_class where oid = tg_relid))
    )) then
    return new;
  end if;

  -- RPC 在双表写完后恢复局部开关，触发器同时核验 DEFINER 身份。
  if current_setting('dydata.allow_settlement_write', true) = '1'
    and current_user not in ('authenticated', 'anon')
    and exists (
      select 1 from pg_proc p where p.proowner = current_user::regrole
        and p.oid in ('public.handle_fulfillment_appeal(uuid,text,uuid,text)'::regprocedure,
                      'public.reopen_fulfillment_appeal_atomically(uuid,uuid)'::regprocedure)
    ) then
    return new;
  end if;

  raise exception using errcode = '42501', message = '结算字段仅允许审批、重开或管理角色维护';
end;
$$;

revoke all on function public.guard_review_settlement_fields() from public, anon, authenticated;
create trigger guard_review_settlement_fields before insert or update on public.videos
  for each row execute function public.guard_review_settlement_fields();
create trigger guard_review_settlement_fields before insert or update on public.daily_reports
  for each row execute function public.guard_review_settlement_fields();

create or replace function public.handle_fulfillment_appeal(
  p_appeal_id uuid,
  p_decision text,
  p_handler_id uuid default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  appeal_record public.fulfillment_appeals%rowtype;
  resolved_handler_id uuid;
  resolved_status text;
  resolved_reason text;
  is_post_submit boolean;
  prior_write_setting text;
  excluded_flag boolean := false;
begin
  if to_regprocedure('public.cloudbase_require_active_actor_v2()') is not null then
    perform public.cloudbase_require_active_actor_v2();
  end if;

  resolved_handler_id := case
    when auth.role() = 'service_role' then p_handler_id
    else (auth.uid())::uuid
  end;
  if resolved_handler_id is null
    or (auth.role() = 'authenticated' and p_handler_id is not null and p_handler_id is distinct from resolved_handler_id)
  then
    raise exception using errcode = '42501', message = 'permission denied';
  end if;

  if not exists (
    select 1
    from public.profiles actor
    where actor.id = resolved_handler_id
      and actor.membership_status = 'active'
      and coalesce(
        actor.company_role,
        case when actor.role = 'owner' then 'company_owner' else actor.role end
      ) in ('admin', 'company_owner')
  ) then
    raise exception using errcode = '42501', message = 'permission denied';
  end if;

  if p_decision is null or p_decision not in ('approve', 'reject') then
    raise exception 'invalid decision: %', p_decision;
  end if;

  select * into appeal_record
  from public.fulfillment_appeals
  where id = p_appeal_id
  for update;

  if not found
    or appeal_record.user_id = resolved_handler_id
    or not exists (
      select 1
      from public.active_visible_user_ids(resolved_handler_id) scope
      where scope.user_id = appeal_record.user_id
    )
  then
    raise exception using errcode = '42501', message = 'permission denied';
  end if;

  if appeal_record.status <> 'pending' then
    raise exception 'appeal already handled';
  end if;

  resolved_status := case when p_decision = 'approve' then 'approved' else 'rejected' end;
  resolved_reason := case
    when p_decision = 'reject' then nullif(left(trim(coalesce(p_reason, '')), 1000), '')
    else null
  end;
  is_post_submit := coalesce(appeal_record.review_mode, 'pre_submit') = 'post_submit';

  if is_post_submit and p_decision = 'reject' and resolved_reason is null then
    raise exception 'reason required';
  end if;

  update public.fulfillment_appeals
  set status = resolved_status,
      handler_id = resolved_handler_id,
      handled_at = now(),
      decision_reason = resolved_reason
  where id = appeal_record.id;

  if is_post_submit then
    prior_write_setting := current_setting('dydata.allow_settlement_write', true);
    perform set_config('dydata.allow_settlement_write', '1', true);
    excluded_flag := (p_decision = 'reject');

    update public.videos
    set settlement_excluded = excluded_flag,
        settlement_excluded_reason = case when excluded_flag then resolved_reason else null end,
        settlement_excluded_at = case when excluded_flag then now() else null end,
        settlement_excluded_by = case when excluded_flag then resolved_handler_id else null end
    where id = appeal_record.video_id
      and user_id = appeal_record.user_id
      and account_id = appeal_record.account_id;
    if not found then
      raise exception using errcode = '23503', message = '事后核查单的作品归属不一致';
    end if;

    update public.daily_reports
    set settlement_excluded = excluded_flag,
        settlement_excluded_reason = case when excluded_flag then resolved_reason else null end,
        settlement_excluded_at = case when excluded_flag then now() else null end,
        settlement_excluded_by = case when excluded_flag then resolved_handler_id else null end
    where id = appeal_record.daily_report_id
      and video_id = appeal_record.video_id
      and user_id = appeal_record.user_id
      and account_id = appeal_record.account_id;
    if not found then
      raise exception using errcode = '23503', message = '事后核查单的日报归属不一致';
    end if;
    perform set_config('dydata.allow_settlement_write', coalesce(prior_write_setting, ''), true);
  end if;

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
        'decision', resolved_status,
        'review_mode', coalesce(appeal_record.review_mode, 'pre_submit'),
        'video_id', appeal_record.video_id,
        'daily_report_id', appeal_record.daily_report_id,
        'reason', resolved_reason,
        'settlement_excluded', excluded_flag
      )::text
    );
  end if;

  return jsonb_build_object(
    'id', appeal_record.id,
    'status', resolved_status,
    'review_mode', coalesce(appeal_record.review_mode, 'pre_submit'),
    'video_id', appeal_record.video_id,
    'daily_report_id', appeal_record.daily_report_id,
    'settlement_excluded', excluded_flag,
    'account_id', appeal_record.account_id,
    'record_date', appeal_record.record_date,
    'user_id', appeal_record.user_id
  );
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
set search_path = pg_catalog, public, pg_temp
as $$
declare
  appeal_record public.fulfillment_appeals%rowtype;
  resolved_handler_id uuid;
  is_post_submit boolean;
  prior_write_setting text;
  restored_settlement boolean := false;
begin
  if to_regprocedure('public.cloudbase_require_active_actor_v2()') is not null then
    perform public.cloudbase_require_active_actor_v2();
  end if;

  resolved_handler_id := case
    when auth.role() = 'service_role' then p_handler_id
    else (auth.uid())::uuid
  end;
  if resolved_handler_id is null
    or (auth.role() = 'authenticated' and p_handler_id is not null and p_handler_id is distinct from resolved_handler_id)
  then
    raise exception using errcode = '42501', message = 'permission denied';
  end if;

  if not exists (
    select 1
    from public.profiles actor
    where actor.id = resolved_handler_id
      and actor.membership_status = 'active'
      and coalesce(
        actor.company_role,
        case when actor.role = 'owner' then 'company_owner' else actor.role end
      ) in ('admin', 'company_owner')
  ) then
    raise exception using errcode = '42501', message = 'permission denied';
  end if;

  select * into appeal_record
  from public.fulfillment_appeals
  where id = p_appeal_id
  for update;

  if not found
    or appeal_record.user_id = resolved_handler_id
    or not exists (
      select 1
      from public.active_visible_user_ids(resolved_handler_id) scope
      where scope.user_id = appeal_record.user_id
    )
  then
    raise exception using errcode = '42501', message = 'permission denied';
  end if;

  if appeal_record.status not in ('approved', 'rejected') then
    raise exception 'appeal is not handled';
  end if;

  is_post_submit := coalesce(appeal_record.review_mode, 'pre_submit') = 'post_submit';

  update public.fulfillment_appeals
  set status = 'pending', handler_id = null, handled_at = null, decision_reason = null
  where id = p_appeal_id;

  if is_post_submit then
    prior_write_setting := current_setting('dydata.allow_settlement_write', true);
    perform set_config('dydata.allow_settlement_write', '1', true);
    restored_settlement := (appeal_record.status = 'rejected');

    update public.videos
    set settlement_excluded = false,
        settlement_excluded_reason = null,
        settlement_excluded_at = null,
        settlement_excluded_by = null
    where id = appeal_record.video_id
      and user_id = appeal_record.user_id
      and account_id = appeal_record.account_id;
    if not found then
      raise exception using errcode = '23503', message = '事后核查单的作品归属不一致';
    end if;

    update public.daily_reports
    set settlement_excluded = false,
        settlement_excluded_reason = null,
        settlement_excluded_at = null,
        settlement_excluded_by = null
    where id = appeal_record.daily_report_id
      and video_id = appeal_record.video_id
      and user_id = appeal_record.user_id
      and account_id = appeal_record.account_id;
    if not found then
      raise exception using errcode = '23503', message = '事后核查单的日报归属不一致';
    end if;
    perform set_config('dydata.allow_settlement_write', coalesce(prior_write_setting, ''), true);
  end if;

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
        'review_mode', coalesce(appeal_record.review_mode, 'pre_submit'),
        'video_id', appeal_record.video_id,
        'daily_report_id', appeal_record.daily_report_id,
        'settlement_restored', restored_settlement,
        'reopened', true
      )::text
    );
  end if;

  return jsonb_build_object(
    'id', appeal_record.id,
    'status', 'pending',
    'previous_status', appeal_record.status,
    'review_mode', coalesce(appeal_record.review_mode, 'pre_submit'),
    'settlement_restored', restored_settlement
  );
end;
$$;

revoke all on function public.reopen_fulfillment_appeal_atomically(uuid, uuid) from public, anon;
grant execute on function public.reopen_fulfillment_appeal_atomically(uuid, uuid) to authenticated, service_role;
