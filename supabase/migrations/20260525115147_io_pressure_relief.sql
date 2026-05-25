-- ============================================================
-- 076: io pressure relief
-- 目标：减少后台高频读对免费版磁盘 IO 的压力
-- 手段：补高频索引 + 重写 admin cockpit 中最热的视频日期过滤
-- ============================================================

create index if not exists idx_videos_created_at_desc
  on public.videos (created_at desc);

create index if not exists idx_videos_created_date
  on public.videos (((created_at at time zone 'Asia/Shanghai')::date));

create index if not exists idx_ai_insight_result_pending_created_at
  on public.ai_insight_result (created_at asc)
  where result_status = 'pending';

create index if not exists idx_ai_insight_result_next_day_review_success
  on public.ai_insight_result (created_at desc)
  where insight_type = 'next_day_review'
    and result_status = 'success';

create or replace function public.admin_cockpit_summary(target_date date default current_date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  pending_videos_count int;
  pending_violations_count int;
  pending_submissions_count int;
  pending_exemptions_count int;
  day_start timestamptz;
  day_end timestamptz;
begin
  if not public.is_admin_or_owner() then
    raise exception 'permission denied';
  end if;

  day_start := ((target_date)::text || ' 00:00:00 Asia/Shanghai')::timestamptz;
  day_end := (((target_date + 1))::text || ' 00:00:00 Asia/Shanghai')::timestamptz;

  select count(*)::int
  into pending_videos_count
  from public.videos v
  where v.created_at >= day_start
    and v.created_at < day_end
    and (
      v.anomaly_status <> '正常'
      or not exists (
        select 1
        from public.video_tags vt
        where vt.video_id = v.id
      )
    );

  select count(*)::int
  into pending_violations_count
  from public.violation_cases vc
  where vc.status = 'submitted'
    and vc.is_deleted = false;

  select count(*)::int
  into pending_submissions_count
  from public.profiles p
  where coalesce(p.status, 'active') = 'active'
    and not (
      coalesce(p.exempt_type, '') = 'permanent'
      or (
        p.exempt_type = 'temporary'
        and p.exempt_start_date is not null
        and p.exempt_end_date is not null
        and target_date between p.exempt_start_date and p.exempt_end_date
      )
      or exists (
        select 1
        from public.exemption_grant eg
        where eg.user_id = p.id
          and eg.status = 'active'
          and eg.start_date is not null
          and target_date >= eg.start_date
          and (eg.end_date is null or target_date <= eg.end_date)
      )
    )
    and not exists (
      select 1
      from public.daily_reports dr
      where dr.user_id = p.id
        and dr.report_date = target_date
    );

  select count(*)::int
  into pending_exemptions_count
  from public.exemption_request er
  where er.request_status = 'pending';

  return jsonb_build_object(
    'pending_videos', pending_videos_count,
    'pending_violations', pending_violations_count,
    'pending_submissions', pending_submissions_count,
    'pending_exemptions', pending_exemptions_count
  );
end;
$$;

create or replace function public.admin_pending_videos_today(
  target_date date default current_date,
  limit_rows int default 20
)
returns table (
  id uuid,
  account_name text,
  report_date date,
  has_tags boolean,
  anomaly_flag boolean,
  submitted_by uuid,
  submitted_by_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  day_start timestamptz;
  day_end timestamptz;
begin
  if not public.is_admin_or_owner() then
    raise exception 'permission denied';
  end if;

  day_start := ((target_date)::text || ' 00:00:00 Asia/Shanghai')::timestamptz;
  day_end := (((target_date + 1))::text || ' 00:00:00 Asia/Shanghai')::timestamptz;

  return query
  select
    v.id,
    coalesce(a.name, '未命名账号') as account_name,
    coalesce(dr.report_date, (v.created_at at time zone 'Asia/Shanghai')::date) as report_date,
    exists (
      select 1
      from public.video_tags vt
      where vt.video_id = v.id
    ) as has_tags,
    (v.anomaly_status <> '正常') as anomaly_flag,
    v.user_id as submitted_by,
    coalesce(p.name, '未命名成员') as submitted_by_name
  from public.videos v
  left join public.daily_reports dr on dr.id = v.id
  left join public.accounts a on a.id = v.account_id
  left join public.profiles p on p.id = v.user_id
  where (
      dr.report_date = target_date
      or (
        dr.report_date is null
        and v.created_at >= day_start
        and v.created_at < day_end
      )
    )
    and (
      v.anomaly_status <> '正常'
      or not exists (
        select 1
        from public.video_tags vt
        where vt.video_id = v.id
      )
    )
  order by
    (v.anomaly_status <> '正常') desc,
    (not exists (
      select 1
      from public.video_tags vt
      where vt.video_id = v.id
    )) desc,
    v.created_at desc
  limit greatest(1, least(coalesce(limit_rows, 20), 100));
end;
$$;
