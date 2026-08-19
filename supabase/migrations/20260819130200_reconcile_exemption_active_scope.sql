-- Switch the existing exemption RPCs to the active-only scope.
-- Function bodies are preserved from the newer production definition; only
-- the scope helper they call is changed.

do $$
declare
  v_name text;
  v_definition text;
begin
  foreach v_name in array array[
    'apply_exemption_grant_atomically',
    'clear_exemption_grant_atomically',
    'review_exemption_request_atomically'
  ] loop
    select pg_get_functiondef(p.oid)
      into v_definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = v_name
      and pg_get_function_identity_arguments(p.oid) in (
        'p_user_id uuid, p_grant_start_date date, p_grant_end_date date, p_grant_type text, p_exemption_category text, p_reason text, p_replace_existing boolean',
        'p_user_id uuid',
        'p_request_id uuid, p_decision text'
      );

    if v_definition is null then
      raise exception 'missing exemption function: %', v_name;
    end if;

    execute replace(v_definition, 'public.visible_user_ids', 'public.active_visible_user_ids');
  end loop;
end;
$$;

revoke all on function public.apply_exemption_grant_atomically(uuid, date, date, text, text, text, boolean)
  from public, anon, service_role;
grant execute on function public.apply_exemption_grant_atomically(uuid, date, date, text, text, text, boolean)
  to authenticated;

revoke all on function public.clear_exemption_grant_atomically(uuid)
  from public, anon, service_role;
grant execute on function public.clear_exemption_grant_atomically(uuid)
  to authenticated;

revoke all on function public.review_exemption_request_atomically(uuid, text)
  from public, anon, service_role;
grant execute on function public.review_exemption_request_atomically(uuid, text)
  to authenticated;
