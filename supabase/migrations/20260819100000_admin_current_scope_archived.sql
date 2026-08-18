-- Current admin queues must exclude archived members while historical reads keep them.

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
begin
  if not public.is_admin_or_owner() then
    raise exception 'permission denied';
  end if;

  select count(*)::int
  into pending_videos_count
  from public.videos v
  where v.created_at::date = target_date
    and not exists (
      select 1
      from public.profiles p
      where p.id = v.user_id
        and coalesce(p.membership_status, 'active') = 'archived'
    )
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
    and vc.is_deleted = false
    and not exists (
      select 1
      from public.profiles p
      where p.id = vc.submitted_by
        and coalesce(p.membership_status, 'active') = 'archived'
    );

  select count(*)::int
  into pending_submissions_count
  from public.profiles p
  where coalesce(p.status, 'active') = 'active'
    and coalesce(p.membership_status, 'active') <> 'archived'
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
  where er.request_status = 'pending'
    and not exists (
      select 1
      from public.profiles p
      where p.id = er.applicant_user_id
        and coalesce(p.membership_status, 'active') = 'archived'
    );

  return jsonb_build_object(
    'pending_videos', pending_videos_count,
    'pending_violations', pending_violations_count,
    'pending_submissions', pending_submissions_count,
    'pending_exemptions', pending_exemptions_count
  );
end;
$$;

create or replace function public.admin_pending_submissions_today(target_date date default current_date)
returns table (
  profile_id uuid,
  name text,
  team_id uuid,
  team_name text,
  last_report_date date
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin_or_owner() then
    raise exception 'permission denied';
  end if;

  return query
  select
    p.id as profile_id,
    p.name,
    p.team_id,
    t.name as team_name,
    (
      select max(dr_last.report_date)
      from public.daily_reports dr_last
      where dr_last.user_id = p.id
        and dr_last.report_date < target_date
    ) as last_report_date
  from public.profiles p
  left join public.teams t on t.id = p.team_id
  where coalesce(p.status, 'active') = 'active'
    and coalesce(p.membership_status, 'active') <> 'archived'
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
    )
  order by t.name nulls last, p.name;
end;
$$;

grant execute on function public.admin_cockpit_summary(date) to authenticated, service_role;
grant execute on function public.admin_pending_submissions_today(date) to authenticated, service_role;
