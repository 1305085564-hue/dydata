create or replace function public.replace_daily_report_usage_record(
  p_daily_report_id uuid,
  p_case_id uuid,
  p_recorded_by uuid,
  p_account_id uuid,
  p_account_name_snapshot text,
  p_team_id uuid,
  p_used_at date,
  p_views integer,
  p_follows integer,
  p_source text,
  p_note text,
  p_result_flag text
)
returns setof public.script_usage_records
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_record public.script_usage_records%rowtype;
begin
  delete from public.script_usage_records
  where daily_report_id = p_daily_report_id
    and recorded_by = p_recorded_by;

  insert into public.script_usage_records (
    case_id,
    recorded_by,
    account_id,
    account_name_snapshot,
    team_id,
    used_at,
    views,
    follows,
    source,
    daily_report_id,
    note,
    result_flag
  ) values (
    p_case_id,
    p_recorded_by,
    p_account_id,
    p_account_name_snapshot,
    p_team_id,
    p_used_at,
    p_views,
    p_follows,
    p_source,
    p_daily_report_id,
    p_note,
    p_result_flag
  )
  returning * into v_record;

  return next v_record;
end;
$$;

revoke all on function public.replace_daily_report_usage_record(uuid, uuid, uuid, uuid, text, uuid, date, integer, integer, text, text, text) from public;
revoke all on function public.replace_daily_report_usage_record(uuid, uuid, uuid, uuid, text, uuid, date, integer, integer, text, text, text) from anon;
revoke all on function public.replace_daily_report_usage_record(uuid, uuid, uuid, uuid, text, uuid, date, integer, integer, text, text, text) from authenticated;
grant execute on function public.replace_daily_report_usage_record(uuid, uuid, uuid, uuid, text, uuid, date, integer, integer, text, text, text) to service_role;
