begin;
CREATE OR REPLACE FUNCTION public.admin_cockpit_summary(target_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.admin_pending_submissions_today(target_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(profile_id uuid, name text, team_id uuid, team_name text, last_report_date date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin_or_owner() THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS profile_id,
    p.name,
    p.team_id,
    t.name AS team_name,
    (
      SELECT max(dr_last.report_date)
      FROM public.daily_reports dr_last
      WHERE dr_last.user_id = p.id
        AND dr_last.report_date < target_date
    ) AS last_report_date
  FROM public.profiles p
  LEFT JOIN public.teams t ON t.id = p.team_id
  WHERE COALESCE(p.status, 'active') = 'active'
    AND NOT (
      COALESCE(p.exempt_type, '') = 'permanent'
      OR (
        p.exempt_type = 'temporary'
        AND p.exempt_start_date IS NOT NULL
        AND p.exempt_end_date IS NOT NULL
        AND target_date BETWEEN p.exempt_start_date AND p.exempt_end_date
      )
      OR EXISTS (
        SELECT 1
        FROM public.exemption_grant eg
        WHERE eg.user_id = p.id
          AND eg.status = 'active'
          AND eg.start_date IS NOT NULL
          AND target_date >= eg.start_date
          AND (eg.end_date IS NULL OR target_date <= eg.end_date)
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.daily_reports dr
      WHERE dr.user_id = p.id
        AND dr.report_date = target_date
    )
  ORDER BY t.name NULLS LAST, p.name;
END;
$function$
;

delete from supabase_migrations.schema_migrations where version in ('20260819130300', '20260819100000');
select pg_notify('pgrst', 'reload schema');
commit;
