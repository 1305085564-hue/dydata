-- C3：72 小时补交改「先交后核」与不计优结算复核（向后兼容、幂等）。
-- 1) fulfillment_appeals 增量扩展事后核查字段（旧行默认 review_mode = 'pre_submit'，行为不变）；
-- 2) videos 与 daily_reports 增补 settlement_excluded 单一真源字段（默认 false，不破坏旧查询）；
-- 3) 更新 handle_fulfillment_appeal（保持 4 参唯一签名）与 reopen_fulfillment_appeal_atomically（保持 2 参签名），
--    对 post_submit 核查单同步写入/恢复不计优结算标记与审计日志；pre_submit 旧待审单行为完全保留；
--    完整保留线上 CloudBase 活性校验、防伪造 handler_id、防自批与单公司可见范围约束，并兼容 auth.uid() 返回 text/uuid。

alter table public.fulfillment_appeals
  add column if not exists review_mode text not null default 'pre_submit',
  add column if not exists video_id uuid references public.videos(id) on delete set null,
  add column if not exists daily_report_id uuid references public.daily_reports(id) on delete set null,
  add column if not exists trigger_reason text,
  add column if not exists ocr_published_at_text text,
  add column if not exists elapsed_hours numeric;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fulfillment_appeals_review_mode_check'
      and conrelid = 'public.fulfillment_appeals'::regclass
  ) then
    alter table public.fulfillment_appeals
      add constraint fulfillment_appeals_review_mode_check
      check (review_mode in ('pre_submit', 'post_submit'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'fulfillment_appeals_trigger_reason_check'
      and conrelid = 'public.fulfillment_appeals'::regclass
  ) then
    alter table public.fulfillment_appeals
      add constraint fulfillment_appeals_trigger_reason_check
      check (trigger_reason is null or trigger_reason in ('expired', 'manual_published_at'));
  end if;
end $$;

comment on column public.fulfillment_appeals.review_mode is
  'pre_submit=历史前置审批单（提交前拦截）；post_submit=先交后核事后核查单（作品已直接入库并恢复履约）';
comment on column public.fulfillment_appeals.video_id is
  '事后核查单关联的已入库作品 ID';
comment on column public.fulfillment_appeals.daily_report_id is
  '事后核查单关联的已入库日报 ID';
comment on column public.fulfillment_appeals.trigger_reason is
  '触发事后核查的原因：expired（超过72小时）或 manual_published_at（手工填写/修改发布时间）';
comment on column public.fulfillment_appeals.ocr_published_at_text is
  '触发事后核查时 OCR 识别到的发布时间原值，供管理员核对';
comment on column public.fulfillment_appeals.elapsed_hours is
  '作品发布时间到提交上传时间的间隔小时数';

-- 允许同账号同日提交多条事后核查作品，同时保留 pre_submit 原唯一约束与 post_submit 按 video_id 幂等去重。
drop index if exists public.idx_fulfillment_appeals_pending_unique;
create unique index if not exists idx_fulfillment_appeals_pending_unique
  on public.fulfillment_appeals (user_id, account_id, record_date)
  where status = 'pending' and review_mode = 'pre_submit';

create unique index if not exists idx_fulfillment_appeals_post_submit_video_pending_unique
  on public.fulfillment_appeals (video_id)
  where status = 'pending' and review_mode = 'post_submit' and video_id is not null;

create index if not exists idx_fulfillment_appeals_video_id
  on public.fulfillment_appeals (video_id)
  where video_id is not null;

-- 不计优结算单一真源字段：原作品与日报数据保留可追溯，仅剔除文案「优条数」结算资格。
alter table public.videos
  add column if not exists settlement_excluded boolean not null default false,
  add column if not exists settlement_excluded_reason text,
  add column if not exists settlement_excluded_at timestamptz,
  add column if not exists settlement_excluded_by uuid;

alter table public.daily_reports
  add column if not exists settlement_excluded boolean not null default false,
  add column if not exists settlement_excluded_reason text,
  add column if not exists settlement_excluded_at timestamptz,
  add column if not exists settlement_excluded_by uuid;

comment on column public.videos.settlement_excluded is
  '事后核查标为无效（不计优结算）的单一真源状态；true 时保留原始数据可追溯，但排除在文案优条数结算之外';
comment on column public.daily_reports.settlement_excluded is
  '与 videos.settlement_excluded 同事务同步维护，供协作管理文案优条数统计直接读取';

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
  appeal_record public.fulfillment_appeals%rowtype;
  resolved_handler_id uuid;
  resolved_status text;
  resolved_reason text;
  is_post_submit boolean;
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
    excluded_flag := (p_decision = 'reject');

    if appeal_record.video_id is not null then
      update public.videos
      set settlement_excluded = excluded_flag,
          settlement_excluded_reason = case when excluded_flag then resolved_reason else null end,
          settlement_excluded_at = case when excluded_flag then now() else null end,
          settlement_excluded_by = case when excluded_flag then resolved_handler_id else null end
      where id = appeal_record.video_id;
    end if;

    if appeal_record.daily_report_id is not null or appeal_record.video_id is not null then
      update public.daily_reports
      set settlement_excluded = excluded_flag,
          settlement_excluded_reason = case when excluded_flag then resolved_reason else null end,
          settlement_excluded_at = case when excluded_flag then now() else null end,
          settlement_excluded_by = case when excluded_flag then resolved_handler_id else null end
      where (appeal_record.daily_report_id is not null and id = appeal_record.daily_report_id)
         or (appeal_record.video_id is not null and video_id = appeal_record.video_id and is_void = false);
    end if;
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
set search_path = public
as $$
declare
  appeal_record public.fulfillment_appeals%rowtype;
  resolved_handler_id uuid;
  is_post_submit boolean;
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
    restored_settlement := (appeal_record.status = 'rejected');

    if appeal_record.video_id is not null then
      update public.videos
      set settlement_excluded = false,
          settlement_excluded_reason = null,
          settlement_excluded_at = null,
          settlement_excluded_by = null
      where id = appeal_record.video_id;
    end if;

    if appeal_record.daily_report_id is not null or appeal_record.video_id is not null then
      update public.daily_reports
      set settlement_excluded = false,
          settlement_excluded_reason = null,
          settlement_excluded_at = null,
          settlement_excluded_by = null
      where (appeal_record.daily_report_id is not null and id = appeal_record.daily_report_id)
         or (appeal_record.video_id is not null and video_id = appeal_record.video_id and is_void = false);
    end if;
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
